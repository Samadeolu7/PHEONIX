# hr/services/leave_service.py
"""
Leave Management Service

Handles leave request operations including:
- Balance checking
- Leave request validation
- Approval workflow
- Balance updates
"""

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError


class LeaveService:
    """Service for leave management operations"""
    
    def __init__(self, leave_request):
        """
        Initialize service with leave request
        
        Args:
            leave_request: LeaveRequest instance
        """
        self.leave_request = leave_request
        self.config = None
    
    def _get_config(self):
        """Get HR config for this branch, create if doesn't exist."""
        from hr.config_models import HRConfig

        if not self.config:
            # Use filter().first() — not get_or_create() — to avoid the
            # internal atomic block that poisons the outer transaction on
            # IntegrityError (soft-deleted row holding the unique slot).
            self.config = HRConfig.all_objects.filter(
                tenant=self.leave_request.tenant,
                owner=self.leave_request.owner,
                branch=self.leave_request.branch,
            ).first()

            if self.config is None:
                self.config = HRConfig(
                    tenant=self.leave_request.tenant,
                    owner=self.leave_request.owner,
                    branch=self.leave_request.branch,
                    enable_leave_approval=True,
                    max_consecutive_leave_days=14,
                    annual_leave_days=20,
                    sick_leave_days=10,
                    enable_attendance_tracking=True,
                    working_hours_per_day=Decimal('8.00'),
                    late_arrival_grace_minutes=15,
                    payroll_currency='USD',
                    payroll_frequency='monthly',
                    tax_rate_percentage=0,
                    enable_overtime_calculation=False,
                    overtime_multiplier=Decimal('1.50'),
                )
                self.config.save()
            elif self.config.is_deleted:
                self.config.is_deleted = False
                self.config.save(update_fields=['is_deleted'])

        return self.config
    
    def validate_leave_request(self):
        """
        Validate leave request
        
        Returns:
            Dict with validation result
        """
        from hr.models import LeaveBalance
        
        errors = []
        warnings = []
        
        # Check dates
        if self.leave_request.end_date < self.leave_request.start_date:
            errors.append("End date cannot be before start date")
        
        # Check for overlapping requests
        overlapping = self.leave_request.__class__.objects.filter(
            staff=self.leave_request.staff,
            status__in=['submitted', 'approved'],
            start_date__lte=self.leave_request.end_date,
            end_date__gte=self.leave_request.start_date
        ).exclude(id=self.leave_request.id)
        
        if overlapping.exists():
            errors.append("Leave dates overlap with existing request")
        
        # Check balance - CRITICAL: Missing balance is now an ERROR, not a warning
        try:
            year = self.leave_request.start_date.year
            balance = LeaveBalance.objects.get(
                staff=self.leave_request.staff,
                leave_type=self.leave_request.leave_type,
                year=year
            )
            
            if not balance.has_sufficient_balance(self.leave_request.num_days):
                errors.append(
                    f"Insufficient leave balance. Available: {balance.available_days} days, "
                    f"Requested: {self.leave_request.num_days} days"
                )
        except LeaveBalance.DoesNotExist:
            # CRITICAL FIX: This is now an ERROR to prevent orphaned leave requests
            errors.append(
                f"No leave balance found for {self.leave_request.staff.first_name} {self.leave_request.staff.last_name} "
                f"for {self.leave_request.leave_type.name} in {year}. "
                f"Leave balances must be initialized before requesting leave. "
                f"Contact HR to initialize leave balances."
            )
        
        # Check medical certificate requirement
        if self.leave_request.leave_type.requires_medical_certificate:
            if not self.leave_request.medical_certificate:
                errors.append(f"{self.leave_request.leave_type.name} requires medical certificate")
        
        # Check extended leave
        config = self._get_config()
        if self.leave_request.num_days > config.max_consecutive_leave_days:
            warnings.append(
                f"Extended leave request (> {config.max_consecutive_leave_days} days) "
                "requires special approval"
            )
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
        }
    
    @db_transaction.atomic
    def submit_leave_request(self):
        """
        Submit leave request for approval
        
        Returns:
            Dict with submission result
        """
        # Validate first
        validation = self.validate_leave_request()
        if not validation['is_valid']:
            raise ValidationError(validation['errors'])
        
        # Update status
        self.leave_request.status = 'submitted'
        self.leave_request.submitted_at = timezone.now()
        self.leave_request.save()
        
        # Update pending balance
        self._update_pending_balance(action='add')
        
        return {
            'success': True,
            'leave_request_id': self.leave_request.id,
            'reference_number': self.leave_request.reference_number,
            'warnings': validation['warnings'],
        }
    
    @db_transaction.atomic
    def approve_leave_request(self, approved_by, notes=None):
        """
        Approve leave request
        
        Args:
            approved_by: User approving the leave
            notes: Optional approval notes
            
        Returns:
            LeaveRequest instance
        """
        if self.leave_request.status != 'submitted':
            raise ValidationError("Can only approve submitted leave requests")
        
        # Update status
        self.leave_request.status = 'approved'
        self.leave_request.approved_at = timezone.now()
        self.leave_request.approved_by = approved_by
        self.leave_request.save()
        
        # Update balances
        self._update_pending_balance(action='remove')
        self._update_used_balance(action='add')
        
        # Add to approval chain
        approval_entry = {
            'user_id': approved_by.id,
            'user_name': f"{approved_by.first_name} {approved_by.last_name}",
            'action': 'approved',
            'timestamp': timezone.now().isoformat(),
            'notes': notes or '',
        }
        self.leave_request.approval_chain.append(approval_entry)
        self.leave_request.save(update_fields=['approval_chain'])
        
        return self.leave_request
    
    @db_transaction.atomic
    def reject_leave_request(self, rejected_by, reason):
        """
        Reject leave request
        
        Args:
            rejected_by: User rejecting the leave
            reason: Rejection reason
            
        Returns:
            LeaveRequest instance
        """
        if self.leave_request.status != 'submitted':
            raise ValidationError("Can only reject submitted leave requests")
        
        # Update status
        self.leave_request.status = 'rejected'
        self.leave_request.rejection_reason = reason
        self.leave_request.save()
        
        # Update pending balance
        self._update_pending_balance(action='remove')
        
        # Add to approval chain
        approval_entry = {
            'user_id': rejected_by.id,
            'user_name': f"{rejected_by.first_name} {rejected_by.last_name}",
            'action': 'rejected',
            'timestamp': timezone.now().isoformat(),
            'reason': reason,
        }
        self.leave_request.approval_chain.append(approval_entry)
        self.leave_request.save(update_fields=['approval_chain'])
        
        return self.leave_request
    
    @db_transaction.atomic
    def cancel_leave_request(self, cancelled_by, reason=None):
        """
        Cancel leave request
        
        Args:
            cancelled_by: User cancelling the leave
            reason: Optional cancellation reason
            
        Returns:
            LeaveRequest instance
        """
        if self.leave_request.status not in ['submitted', 'approved']:
            raise ValidationError("Can only cancel submitted or approved leave requests")
        
        old_status = self.leave_request.status
        
        # Update status
        self.leave_request.status = 'cancelled'
        self.leave_request.save()
        
        # Restore balances
        if old_status == 'submitted':
            self._update_pending_balance(action='remove')
        elif old_status == 'approved':
            self._update_used_balance(action='remove')
        
        return self.leave_request
    
    def _update_pending_balance(self, action='add'):
        """Update pending days in leave balance"""
        from hr.models import LeaveBalance
        
        year = self.leave_request.start_date.year
        
        try:
            balance = LeaveBalance.objects.get(
                staff=self.leave_request.staff,
                leave_type=self.leave_request.leave_type,
                year=year
            )
            
            if action == 'add':
                balance.pending_days += self.leave_request.num_days
            else:  # remove
                balance.pending_days -= self.leave_request.num_days
            
            balance.save(update_fields=['pending_days'])
        except LeaveBalance.DoesNotExist:
            # Balance doesn't exist, skip update
            pass
    
    def _update_used_balance(self, action='add'):
        """Update used days in leave balance"""
        from hr.models import LeaveBalance
        
        year = self.leave_request.start_date.year
        
        try:
            balance = LeaveBalance.objects.get(
                staff=self.leave_request.staff,
                leave_type=self.leave_request.leave_type,
                year=year
            )
            
            if action == 'add':
                balance.used_days += self.leave_request.num_days
            else:  # remove
                balance.used_days -= self.leave_request.num_days
            
            balance.save(update_fields=['used_days'])
        except LeaveBalance.DoesNotExist:
            # Balance doesn't exist, skip update
            pass
    
    @staticmethod
    def initialize_leave_balances(staff, year):
        """
        Initialize leave balances for staff for a given year
        
        Args:
            staff: Staff instance
            year: Year to initialize balances for
            
        Returns:
            List of created LeaveBalance instances
        """
        from hr.models import LeaveType, LeaveBalance
        from django.db import IntegrityError, transaction, connection
        import logging
        
        logger = logging.getLogger(__name__)
        
        leave_types = LeaveType.objects.filter(
            branch=staff.branch,
            is_deleted=False
        )
        
        leave_types_list = list(leave_types)
        logger.info(f"Found {len(leave_types_list)} leave types for branch {staff.branch_id}")
        
        balances = []
        created_count = 0
        
        for leave_type in leave_types_list:
            # Check for existing balance first (regardless of owner filter)
            existing = LeaveBalance.all_objects.filter(
                staff=staff,
                leave_type=leave_type,
                year=year,
                is_deleted=False
            ).first()
            
            if existing:
                logger.info(f"Balance already exists: staff={staff.id}, leave_type={leave_type.id}, year={year}")
                balances.append(existing)
                continue
            
            # CRITICAL: Create balance with explicit field values
            try:
                # Ensure tenant is not None
                tenant = staff.tenant
                if tenant is None and hasattr(staff, 'tenant_id') and staff.tenant_id:
                    from users.models import Tenant
                    tenant = Tenant.objects.get(id=staff.tenant_id)
                
                if tenant is None:
                    logger.error(
                        f"CRITICAL: Cannot create balance - staff {staff.id} has no tenant! "
                        f"tenant={staff.tenant}, tenant_id={getattr(staff, 'tenant_id', 'N/A')}"
                    )
                    raise ValueError(f"Staff {staff.id} has no tenant")
                
                balance = LeaveBalance(
                    tenant=tenant,
                    staff=staff,
                    leave_type=leave_type,
                    year=year,
                    branch=staff.branch,
                    owner=staff.owner,
                    entitled_days=leave_type.default_days_per_year,
                    used_days=Decimal('0.00'),
                    pending_days=Decimal('0.00'),
                    carried_over_days=Decimal('0.00'),
                )
                
                # Explicitly save and verify
                balance.save()
                
                # VERIFY IT'S IN DATABASE
                verified = LeaveBalance.all_objects.filter(
                    id=balance.id,
                    is_deleted=False
                ).exists()
                
                if not verified:
                    logger.error(
                        f"CRITICAL: Balance ID {balance.id} was created but not found in database! "
                        f"Staff: {staff.id}, LeaveType: {leave_type.id}, Year: {year}"
                    )
                    raise Exception(f"Balance {balance.id} not persisted to database")
                
                logger.info(
                    f"✓ Created balance ID={balance.id} for staff={staff.id} ({staff.first_name}), "
                    f"leave_type={leave_type.id} ({leave_type.name}), year={year}, "
                    f"tenant={tenant.id if tenant else 'None'}, branch={staff.branch_id}, owner={staff.owner_id}"
                )
                
                balances.append(balance)
                created_count += 1
                
            except IntegrityError as e:
                logger.warning(f"IntegrityError (race condition?): {str(e)}")
                # Handle race condition - balance was created by another process
                balance = LeaveBalance.all_objects.filter(
                    staff=staff,
                    leave_type=leave_type,
                    year=year,
                    is_deleted=False
                ).first()
                if balance:
                    balances.append(balance)
                else:
                    logger.error(f"IntegrityError but no existing balance found: {str(e)}")
                    raise
            except Exception as e:
                logger.error(
                    f"ERROR creating balance: staff={staff.id}, leave_type={leave_type.id}, "
                    f"year={year}, error={str(e)}"
                )
                raise
        
        logger.info(f"initialize_leave_balances complete: created {created_count}, total {len(balances)}")
        return balances
