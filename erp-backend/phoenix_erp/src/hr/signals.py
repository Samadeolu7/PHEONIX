# hr/signals.py
"""
Signal handlers for HR module

Automatically handles:
- Staff ID generation on creation (branch-prefix + sequential counter)
- Leave balance initialization when staff are created
- Default leave types creation
"""

from django.conf import settings
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@receiver(pre_save, sender='hr.Staff')
def auto_assign_staff_id(sender, instance, **kwargs):
    """
    Auto-generate a branch-scoped staff ID before first save.

    Uses HRConfig.get_next_staff_id() which reads the configurable prefix and
    pads the sequential counter (e.g. prefix=MML, padding=3 → MML001).
    """
    if instance.pk:
        # Existing record – do not regenerate ID
        return

    if instance.staff_id:
        # Already provided manually – respect it
        return

    if not instance.branch:
        # Cannot generate until branch is known; leave blank for now
        return

    try:
        from hr.config_models import HRConfig
        config = HRConfig.get_for_branch(instance.branch)
        instance.staff_id = config.get_next_staff_id()
        logger.info(
            f"Assigned staff_id '{instance.staff_id}' for new staff "
            f"({instance.first_name} {instance.last_name})"
        )
    except Exception as exc:
        logger.error(f"Failed to generate staff_id: {exc}", exc_info=True)



@receiver(post_save, sender='hr.Staff')
def auto_initialize_leave_balances(sender, instance, created, **kwargs):
    """
    Automatically initialize leave balances when a new staff member is created
    
    Args:
        sender: The Staff model class
        instance: The staff instance that was saved
        created: Boolean indicating if this is a new record
        **kwargs: Additional arguments
    """
    if not created:
        # Only run for new staff, not updates
        return
    
    # Import here to avoid circular imports
    from hr.services.leave_service import LeaveService
    from hr.models import LeaveType
    
    try:
        # Check if leave types exist for this branch
        leave_types_exist = LeaveType.objects.filter(
            branch=instance.branch,
            is_deleted=False
        ).exists()
        
        if not leave_types_exist:
            # Create default leave types
            logger.info(f"Creating default leave types for branch {instance.branch}")
            create_default_leave_types(instance.branch, instance.owner, instance.tenant)
        
        # Initialize leave balances for current year
        current_year = timezone.now().year
        balances = LeaveService.initialize_leave_balances(instance, current_year)
        
        logger.info(
            f"Auto-initialized {len(balances)} leave balances for staff {instance.id} "
            f"({instance.first_name} {instance.last_name}) for year {current_year}"
        )
        
    except Exception as e:
        # Log error but don't fail staff creation
        logger.error(
            f"Failed to auto-initialize leave balances for staff {instance.id}: {str(e)}",
            exc_info=True
        )


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def auto_create_staff_profile(sender, instance, created, **kwargs):
    """
    Every user is also a staff member. Auto-create a stub Staff profile
    the first time a user account is saved so the payroll / HR modules
    can always find a linked record.

    If a Staff already exists with this user linked (e.g. linked manually
    in the admin before the signal fires) nothing is done.
    """
    if not created:
        return

    try:
        from hr.models import Staff
        if Staff.objects.filter(user=instance).exists():
            return

        branch = getattr(instance, 'branch', None)
        owner = instance  # self-owned until an admin reassigns

        Staff.objects.create(
            user=instance,
            first_name=instance.first_name or instance.username,
            last_name=instance.last_name or '',
            email=instance.email or '',
            branch=branch,
            owner=owner,
        )
        logger.info(
            f"Auto-created Staff profile for user '{instance.username}' (id={instance.pk})"
        )
    except Exception as exc:
        # Never block user creation because of a staff-profile failure
        logger.error(
            f"Failed to auto-create Staff profile for user '{instance.username}': {exc}",
            exc_info=True,
        )


def create_default_leave_types(branch, owner, tenant=None):
    """
    Create default leave types for a branch
    
    Args:
        branch: Branch instance
        owner: User instance (owner)
        tenant: Tenant instance
        
    Returns:
        List of created LeaveType instances
    """
    from hr.models import LeaveType
    
    default_types = [
        {
            'name': 'Annual Leave',
            'code': 'AL',
            'default_days_per_year': 20,
            'is_paid': True,
            'requires_approval': True,
            'description': 'Paid annual leave/vacation days',
        },
        {
            'name': 'Sick Leave',
            'code': 'SL',
            'default_days_per_year': 10,
            'is_paid': True,
            'requires_approval': True,
            'description': 'Paid sick leave for illness',
        },
        {
            'name': 'Personal Leave',
            'code': 'PL',
            'default_days_per_year': 5,
            'is_paid': True,
            'requires_approval': True,
            'description': 'Personal leave for emergencies or personal matters',
        },
        {
            'name': 'Unpaid Leave',
            'code': 'UL',
            'default_days_per_year': 0,
            'is_paid': False,
            'requires_approval': True,
            'description': 'Unpaid leave without salary',
        },
        {
            'name': 'Maternity Leave',
            'code': 'ML',
            'default_days_per_year': 90,
            'is_paid': True,
            'requires_approval': True,
            'description': 'Maternity leave for new mothers',
        },
        {
            'name': 'Paternity Leave',
            'code': 'PTL',
            'default_days_per_year': 14,
            'is_paid': True,
            'requires_approval': True,
            'description': 'Paternity leave for new fathers',
        },
    ]
    
    created_types = []
    for leave_data in default_types:
        # Check if already exists
        existing = LeaveType.objects.filter(
            branch=branch,
            code=leave_data['code'],
            is_deleted=False
        ).first()
        
        if not existing:
            leave_type = LeaveType.objects.create(
                branch=branch,
                owner=owner,
                tenant=tenant,
                **leave_data
            )
            created_types.append(leave_type)
            logger.info(f"Created default leave type: {leave_type.name} ({leave_type.code})")
    
    return created_types
