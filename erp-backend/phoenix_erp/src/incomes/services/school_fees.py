# incomes/services/school_fees.py
"""
Service layer for school fee management
Provides high-level API for creating invoices, processing payments, and managing entitlements
"""
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP
from dateutil.relativedelta import relativedelta

from incomes.models import (
    Invoice, FeeStructure, FeeEntitlement, 
    PaymentPlan, PaymentPlanInstallment, Income
)
from automations.models import WorkflowRun
from accounts.models import Account


class SchoolFeesService:
    """
    Complete service for school fee management
    """
    
    @staticmethod
    @transaction.atomic
    def create_student_invoice(
        client,
        fee_structure: FeeStructure,
        academic_period: dict,
        payment_term_type: str = 'minimum_deposit',
        minimum_deposit_percent: Decimal = Decimal('0'),
        installment_config: dict = None,
        owner=None,
        branch=None,
        created_by=None
    ) -> tuple[Invoice, FeeEntitlement]:
        """
        Create invoice and entitlement for a student
        
        Args:
            client: Student/Client object
            fee_structure: Fee structure to apply
            academic_period: {"year": "2024-2025", "term": "1"}
            payment_term_type: 'full_upfront', 'minimum_deposit', 'installments', 'prepaid_allocation'
            minimum_deposit_percent: Percentage required upfront (0-100)
            installment_config: {"num_installments": 3, "frequency": "monthly"}
            
        Returns:
            (Invoice, FeeEntitlement) tuple
        """
        # Create invoice
        invoice_number = SchoolFeesService._generate_invoice_number(branch)
        
        invoice = Invoice.objects.create(
            client=client,
            invoice_number=invoice_number,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + relativedelta(months=1),
            description=f"{fee_structure.name} - {academic_period.get('year', '')} Term {academic_period.get('term', '')}",
            amount=fee_structure.base_amount,
            fee_structure=fee_structure,
            status='draft',
            metadata={
                'academic_period': academic_period,
                'fee_structure_id': fee_structure.id
            },
            owner=owner,
            branch=branch,
            created_by=created_by
        )
        
        # Calculate minimum required payment
        if payment_term_type == 'full_upfront':
            minimum_required = fee_structure.base_amount
        elif payment_term_type == 'minimum_deposit':
            minimum_required = (fee_structure.base_amount * minimum_deposit_percent) / 100
        else:
            minimum_required = Decimal('0')
        
        # Determine access rules based on fee type
        access_rules = SchoolFeesService._get_access_rules_for_fee_type(
            fee_structure, 
            payment_term_type
        )
        
        # Create entitlement
        entitlement = FeeEntitlement.objects.create(
            client=client,
            invoice=invoice,
            fee_structure=fee_structure,
            academic_period=academic_period,
            payment_term_type=payment_term_type,
            total_amount=fee_structure.base_amount,
            amount_paid=Decimal('0'),
            minimum_required=minimum_required,
            current_access_level='none',
            access_rules=access_rules,
            status='pending',
            valid_from=timezone.now().date(),
            owner=owner,
            branch=branch,
            created_by=created_by
        )
        
        # Create payment plan if installments
        if payment_term_type == 'installments' and installment_config:
            SchoolFeesService._create_payment_plan(
                entitlement,
                installment_config,
                owner,
                branch,
                created_by
            )
        
        # Mark invoice as sent
        invoice.status = 'sent'
        invoice.save()
        
        # Auto-create inventory allocation if fee structure includes inventory items
        if fee_structure.industry_config.get('fee_components'):
            SchoolFeesService._create_inventory_allocation_from_fee(
                entitlement=entitlement,
                invoice=invoice,
                fee_structure=fee_structure,
                owner=owner,
                branch=branch,
                created_by=created_by
            )
        
        return invoice, entitlement
    
    @staticmethod
    def _get_access_rules_for_fee_type(fee_structure: FeeStructure, payment_term_type: str) -> dict:
        """
        Get default access rules based on fee type
        """
        # Get from fee structure config if exists
        base_rules = fee_structure.industry_config.get('access_rules', {})
        
        # Common rules
        rules = {
            'requires_minimum': payment_term_type in ['minimum_deposit', 'installments'],
            'restrict_on_overdue': True,
            'grace_period_days': 7,
        }
        
        # Fee-specific rules
        fee_code = fee_structure.code.lower()
        
        if 'tuition' in fee_code:
            rules.update({
                'full_access_at_percent': 50,
                'allowed_services': ['classes', 'library', 'sports'],
                'restricted_services': ['exams', 'graduation', 'transcripts']
            })
        
        elif 'uniform' in fee_code:
            rules.update({
                'full_access_at_percent': 100,  # Must pay full
                'allowed_services': [],
                'restricted_services': ['uniform_collection']
            })
        
        elif 'meal' in fee_code or 'cafeteria' in fee_code:
            rules.update({
                'full_access_at_percent': 100,
                'allowed_services': ['cafeteria'],
                'restricted_services': []
            })
        
        elif 'transport' in fee_code or 'bus' in fee_code:
            rules.update({
                'full_access_at_percent': 100,
                'allowed_services': ['transport'],
                'restricted_services': []
            })
        
        # Merge with base rules from config
        rules.update(base_rules)
        
        return rules
    
    @staticmethod
    @transaction.atomic
    def _create_payment_plan(
        entitlement: FeeEntitlement,
        config: dict,
        owner,
        branch,
        created_by
    ) -> PaymentPlan:
        """
        Create payment plan with installments
        """
        num_installments = config.get('num_installments', 3)
        frequency = config.get('frequency', 'monthly')
        down_payment = config.get('down_payment', Decimal('0'))
        
        # Calculate installment amount
        remaining = entitlement.total_amount - down_payment
        installment_amount = remaining / num_installments
        
        # Determine end date
        if frequency == 'weekly':
            end_date = timezone.now().date() + relativedelta(weeks=num_installments)
        elif frequency == 'biweekly':
            end_date = timezone.now().date() + relativedelta(weeks=num_installments * 2)
        else:  # monthly
            end_date = timezone.now().date() + relativedelta(months=num_installments)
        
        plan = PaymentPlan.objects.create(
            entitlement=entitlement,
            plan_name=f"{entitlement.fee_structure.name} - {num_installments} Installments",
            total_amount=entitlement.total_amount,
            down_payment=down_payment,
            number_of_installments=num_installments,
            installment_amount=installment_amount,
            frequency=frequency,
            start_date=timezone.now().date(),
            end_date=end_date,
            status='active',
            late_payment_penalty=config.get('late_penalty', Decimal('0')),
            grace_period_days=config.get('grace_days', 7),
            owner=owner,
            branch=branch,
            created_by=created_by
        )
        
        # Generate schedule
        plan.generate_schedule()
        
        return plan
    
    @staticmethod
    @transaction.atomic
    def process_fee_payment(
        invoice: Invoice,
        amount: Decimal,
        payment_method: str,
        bank_account_id: int,
        user,
        notes: str = ''
    ) -> dict:
        """
        Process a fee payment by triggering the appropriate workflow
        
        Args:
            invoice: Invoice to pay
            amount: Payment amount
            payment_method: 'cash', 'bank_transfer', 'mobile_money', etc.
            bank_account_id: Bank/cash account receiving payment
            user: User making payment
            notes: Additional notes
            
        Returns:
            {
                'success': bool,
                'workflow_run': WorkflowRun,
                'entitlement': FeeEntitlement,
                'message': str
            }
        """
        # Get entitlement
        try:
            entitlement = invoice.entitlements.first()
            if not entitlement:
                raise ValidationError("No entitlement found for this invoice")
        except Exception as e:
            return {
                'success': False,
                'message': f"Error finding entitlement: {str(e)}"
            }
        
        # Validate payment amount
        if amount <= 0:
            return {
                'success': False,
                'message': "Payment amount must be greater than zero"
            }
        
        if amount > invoice.balance:
            return {
                'success': False,
                'message': f"Payment amount ({amount}) exceeds invoice balance ({invoice.balance})"
            }
        
        # Get fee structure to determine workflow
        fee_structure = entitlement.fee_structure
        
        # Find appropriate workflow binding
        from automations.models import WorkflowBinding
        
        # Look for workflow binding based on fee structure category
        binding = WorkflowBinding.objects.filter(
            is_active=True,
            workflow_template__category='school_fees',
            workflow_template__name__icontains=fee_structure.code
        ).first()
        
        if not binding:
            # Fall back to generic fee payment workflow
            binding = WorkflowBinding.objects.filter(
                is_active=True,
                workflow_template__name='Generic Fee Payment'
            ).first()
        
        if not binding:
            return {
                'success': False,
                'message': "No workflow configured for this fee type"
            }
        
        # Prepare context
        context = {
            'data': {
                'invoice_id': invoice.id,
                'invoice_amount': invoice.amount,
                'invoice_balance': invoice.balance,
                'amount': amount,
                'payment_method': payment_method,
                'student_name': invoice.client.full_name,
                'client_id': invoice.client.id,
                'parent_phone': invoice.client.primary_phone,
                'parent_email': invoice.client.email,
                'notes': notes
            },
            'workflow': {
                'bank_account_id': bank_account_id,
                'tuition_income_account_id': fee_structure.category.income_account_id,
                'uniform_income_account_id': fee_structure.category.income_account_id,
                'meal_income_account_id': fee_structure.category.income_account_id,
            }
        }
        
        # Add fee-specific context
        if 'uniform' in fee_structure.code.lower():
            # Add uniform items from metadata
            uniform_items = fee_structure.industry_config.get('uniform_items', [])
            context['data']['uniform_items'] = uniform_items
        
        elif 'meal' in fee_structure.code.lower():
            # Calculate number of meals
            meal_price = fee_structure.industry_config.get('meal_price', Decimal('5.00'))
            num_meals = int(amount / meal_price)
            context['data']['num_meals'] = num_meals
            context['data']['valid_until'] = (
                timezone.now().date() + relativedelta(months=1)
            ).isoformat()
            context['workflow']['meal_plan_fee_structure_id'] = fee_structure.id
        
        # Create workflow run
        run = WorkflowRun.objects.create(
            template=binding.workflow_template,
            binding=binding,
            context=context,
            owner=invoice.owner,
            branch=invoice.branch,
            created_by=user,
            form_submission=None  # Not from form submission
        )
        
        return {
            'success': True,
            'workflow_run': run,
            'entitlement': entitlement,
            'message': f"Payment of {amount} is being processed"
        }
    
    @staticmethod
    def check_student_access(client, service_code: str = None) -> dict:
        """
        Check if student can access a service based on all their entitlements
        
        Args:
            client: Student/Client
            service_code: Service to check (e.g., 'classes', 'exams', 'cafeteria')
            
        Returns:
            {
                'can_access': bool,
                'restrictions': [list of restrictions],
                'entitlements': [list of active entitlements]
            }
        """
        # Get all active entitlements
        entitlements = FeeEntitlement.objects.filter(
            client=client,
            status__in=['active', 'pending']
        )
        
        restrictions = []
        required_entitlements = []
        
        # Check each entitlement
        for entitlement in entitlements:
            can_access, reason = entitlement.can_access_service(service_code)
            
            if not can_access:
                restrictions.append({
                    'fee_type': entitlement.fee_structure.name,
                    'reason': reason,
                    'balance': entitlement.balance
                })
            else:
                required_entitlements.append({
                    'fee_type': entitlement.fee_structure.name,
                    'access_level': entitlement.current_access_level,
                    'balance': entitlement.balance
                })
        
        return {
            'can_access': len(restrictions) == 0,
            'restrictions': restrictions,
            'entitlements': required_entitlements
        }
    
    @staticmethod
    def get_student_fee_summary(client) -> dict:
        """
        Get comprehensive fee summary for a student
        
        Returns:
            {
                'total_invoiced': Decimal,
                'total_paid': Decimal,
                'total_balance': Decimal,
                'active_entitlements': [...],
                'overdue_invoices': [...],
                'payment_plans': [...]
            }
        """
        invoices = Invoice.objects.filter(client=client)
        entitlements = FeeEntitlement.objects.filter(client=client)
        
        # Calculate totals
        total_invoiced = sum(inv.amount for inv in invoices)
        total_paid = sum(inv.amount_paid for inv in invoices)
        total_balance = total_invoiced - total_paid
        
        # Get active entitlements
        active_entitlements = []
        for ent in entitlements.filter(status__in=['active', 'pending']):
            active_entitlements.append({
                'fee_type': ent.fee_structure.name,
                'amount': ent.total_amount,
                'paid': ent.amount_paid,
                'balance': ent.balance,
                'status': ent.status,
                'access_level': ent.current_access_level,
                'payment_percentage': ent.payment_percentage
            })
        
        # Get overdue invoices
        overdue_invoices = []
        for inv in invoices.filter(status__in=['sent', 'partial']):
            if inv.is_overdue:
                overdue_invoices.append({
                    'invoice_number': inv.invoice_number,
                    'description': inv.description,
                    'amount': inv.amount,
                    'balance': inv.balance,
                    'due_date': inv.due_date.isoformat(),
                    'days_overdue': (timezone.now().date() - inv.due_date).days
                })
        
        # Get payment plans
        payment_plans = []
        for ent in entitlements:
            if hasattr(ent, 'payment_plan'):
                plan = ent.payment_plan
                payment_plans.append({
                    'plan_name': plan.plan_name,
                    'total_amount': plan.total_amount,
                    'installment_amount': plan.installment_amount,
                    'frequency': plan.frequency,
                    'next_due_date': plan.installments.filter(
                        status='pending'
                    ).first().due_date.isoformat() if plan.installments.filter(
                        status='pending'
                    ).exists() else None
                })
        
        return {
            'total_invoiced': total_invoiced,
            'total_paid': total_paid,
            'total_balance': total_balance,
            'active_entitlements': active_entitlements,
            'overdue_invoices': overdue_invoices,
            'payment_plans': payment_plans
        }
    
    @staticmethod
    @transaction.atomic
    def _create_inventory_allocation_from_fee(
        entitlement: FeeEntitlement,
        invoice: Invoice,
        fee_structure: FeeStructure,
        owner,
        branch,
        created_by
    ):
        """
        Auto-create inventory allocation when fee includes physical items
        
        Example fee_components in fee_structure.industry_config:
        {
            "fee_components": [
                {
                    "name": "Math Textbook",
                    "amount": 25.00,
                    "inventory_item_id": 1,
                    "quantity": 1
                },
                {
                    "name": "Uniform Set",
                    "amount": 35.00,
                    "inventory_item_id": 3,
                    "quantity": 1
                }
            ]
        }
        """
        from inventory.models import InventoryAllocation, AllocationItem, InventoryItem, InventoryStock
        
        fee_components = fee_structure.industry_config.get('fee_components', [])
        
        # Filter components that have inventory_item_id
        inventory_components = [
            comp for comp in fee_components 
            if comp.get('inventory_item_id')
        ]
        
        if not inventory_components:
            return None  # No inventory items in this fee
        
        # Generate allocation number
        allocation_number = SchoolFeesService._generate_allocation_number(branch)
        
        # Determine allocation type
        allocation_type = 'item_specific'  # Specific items defined
        
        # Create allocation
        allocation = InventoryAllocation.objects.create(
            client=entitlement.client,
            invoice=invoice,
            allocation_number=allocation_number,
            allocation_date=timezone.now().date(),
            allocation_type=allocation_type,
            allocated_amount=invoice.amount,
            consumed_amount=Decimal('0'),
            valid_from=entitlement.valid_from,
            valid_until=entitlement.valid_until,
            status='pending_payment',  # Will activate when minimum payment received
            notes=f"Auto-created from {fee_structure.name}",
            owner=owner,
            branch=branch,
            created_by=created_by
        )
        
        # Link allocation to entitlement
        entitlement.inventory_allocation = allocation
        entitlement.save(update_fields=['inventory_allocation'])
        
        # Create allocation items and reserve stock
        for component in inventory_components:
            try:
                item = InventoryItem.objects.get(
                    id=component['inventory_item_id'],
                    branch=branch
                )
                
                quantity = Decimal(str(component.get('quantity', 1)))
                
                # Create allocation item
                AllocationItem.objects.create(
                    allocation=allocation,
                    item=item,
                    allocated_quantity=quantity,
                    redeemed_quantity=Decimal('0'),
                    notes=component.get('name', item.name),
                    created_by=created_by
                )
                
                # Reserve stock
                stock, _ = InventoryStock.objects.get_or_create(
                    item=item,
                    branch=branch,
                    defaults={
                        'quantity_on_hand': Decimal('0'),
                        'reserved_quantity': Decimal('0'),
                        'owner': owner,
                        'branch': branch,
                        'created_by': created_by
                    }
                )
                
                stock.reserved_quantity += quantity
                stock.save(update_fields=['reserved_quantity'])
                
            except InventoryItem.DoesNotExist:
                # Skip if item not found - log warning in production
                continue
        
        return allocation
    
    @staticmethod
    def _generate_allocation_number(branch) -> str:
        """Generate unique allocation number"""
        from django.db import connection
        from inventory.models import InventoryAllocation
        
        today = timezone.now()
        date_prefix = today.strftime("%Y%m%d")
        
        # Get last allocation for today
        last_allocation = InventoryAllocation.objects.filter(
            allocation_number__startswith=f"ALLOC-{date_prefix}",
            branch=branch
        ).order_by('-allocation_number').first()
        
        if last_allocation:
            # Extract sequence number
            try:
                last_seq = int(last_allocation.allocation_number.split('-')[-1])
                new_seq = last_seq + 1
            except (ValueError, IndexError):
                new_seq = 1
        else:
            new_seq = 1
        
        return f"ALLOC-{date_prefix}-{new_seq:04d}"
    
    @staticmethod
    def _generate_invoice_number(branch) -> str:
        """Generate unique invoice number"""
        from django.db import connection
        
        today = timezone.now()
        year_month = today.strftime("%Y%m")
        
        # Get sequence
        sequence_name = f'invoice_seq_{branch.id}'
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE SEQUENCE IF NOT EXISTS {sequence_name} START 1"
            )
            cursor.execute(f"SELECT nextval('{sequence_name}')")
            seq = cursor.fetchone()[0]
        
        return f"INV-{year_month}-{seq:05d}"