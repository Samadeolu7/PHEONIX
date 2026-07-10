# accounts/signals.py
"""
Signal handlers for automatic workflow, form, and report generation,
and automatic chart-of-accounts seeding for new tenants.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction

from accounts.models import Account
from pages.models import Module
import logging
import json
import time

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tenant creation → auto-seed FIRS/IFRS chart of accounts
# ---------------------------------------------------------------------------

@receiver(post_save, sender='users.Tenant')
def seed_chart_of_accounts_for_new_tenant(sender, instance, created, **kwargs):
    """
    Automatically seed the full FIRS/IFRS chart of accounts (parent + child
    accounts) whenever a new Tenant is registered.

    Why this matters
    ----------------
    Parent accounts are **predetermined and constant** across every FIRS/IFRS
    business.  They are the structural group headers (1100 Cash, 1110 Receivables,
    2100 Payables, 4100 Revenue, 5100 Cost of Sales, …).  They never change between
    businesses; only the *children* added under each parent differ per business.

    After this runs, the tenant's chart of accounts is ready and all you need to
    do going forward is create child accounts under the appropriate parent.
    Parent accounts will automatically roll up and summarise balances in financial
    reports (Balance Sheet, P&L, Trial Balance).

    Technical notes
    ---------------
    - Runs via transaction.on_commit() so the Tenant row is fully committed before
      account creation begins — no partial-row race conditions.
    - Skipped during fixture loading (raw=True) to avoid double-seeding in tests.
    - Safe to call multiple times: create_standard_accounts uses get_or_create
      internally, so existing accounts are never duplicated.
    """
    if not created:
        return

    # Skip during fixture loading / data migrations
    if kwargs.get('raw', False):
        return

    def _seed():
        try:
            from accounts.utils.setup_accounts import create_standard_accounts
            created_count, skipped = create_standard_accounts(instance, force=False)
            logger.info(
                "Auto-seeded FIRS chart of accounts for tenant '%s' (ID: %s): "
                "%d accounts created, %d already existed.",
                getattr(instance, 'name', instance.pk),
                instance.pk,
                created_count,
                skipped,
            )
        except Exception as exc:
            logger.exception(
                "Failed to auto-seed chart of accounts for tenant '%s' (ID: %s): %s",
                getattr(instance, 'name', instance.pk),
                instance.pk,
                exc,
            )

    transaction.on_commit(_seed)


# ---------------------------------------------------------------------------
# Account creation → auto-generate workflow / form / report components
# ---------------------------------------------------------------------------

@receiver(post_save, sender=Account)
def generate_account_components(sender, instance, created, **kwargs):
    """
    Automatically generate workflow, form schema, module page, and report
    when a new account is created
    """
    # CRITICAL: Only run on creation, not updates
    if not created:
        return
    
    # Only for PARENT accounts (forms/workflows on parent level, child accounts selected via cascading selector)
    if instance.account_level != Account.LEVEL_PARENT:
        return
    
    # Skip if this is being called during fixture loading or migrations
    if kwargs.get('raw', False):
        return

    # Skip during bulk chart-of-accounts setup (management command / tenant seeding).
    # Generating individual workflow components for every parent account in a
    # 135-account batch would create hundreds of duplicate WorkflowTemplates.
    from common.managers import _thread_locals
    if getattr(_thread_locals, 'skip_account_components', False):
        return
    
    # Use transaction.on_commit to ensure account is fully saved
    def _generate():
        try:
            logger.info(f"Generating components for account: {instance.code}")
            
            # Import here to avoid circular imports
            from automations.models import FormSchema, WorkflowTemplate
            from pages.models import Module, ModulePage
            from reports.services.generator import ReportGenerator
            
            # Get workflow configuration if provided during account creation
            workflow_config = getattr(instance, '_workflow_config', None)
            
            # 1. Generate Form Schema (with contra account field if needed)
            form_schema = _generate_form_schema(instance, workflow_config)
            
            # 2. Get or Create MASTER Workflow Template (reusable across accounts)
            workflow = _get_or_create_master_workflow(instance, workflow_config)
            
            # 3. Link account to master workflow template
            _link_account_to_workflow(instance, workflow, form_schema)
            
            # 3. Generate Module Page (existing)
            module_page = _generate_module_page(instance, form_schema)
            
            # 4. NEW: Generate Report
            report = ReportGenerator.generate_for_account(
                account=instance,
                created_by=instance.created_by
            )
            
            # Fix: Ensure all commonly used fields are in allowed_fields
            if report:
                _ensure_report_allowed_fields(report)
            
            # 5. Link report to module page
            if module_page and report:
                _create_report_page(instance, report, module_page.module)
            
            logger.info(f"Successfully generated all components for {instance.code}")
            
        except Exception as e:
            logger.exception(f"Failed to generate components for {instance.code}: {e}")
    
    transaction.on_commit(_generate)


# def _generate_form_schema(account: Account, workflow_config=None):
#     """Generate form schema for account transactions"""
#     from automations.models import FormSchema
#     from django.utils import timezone
    
#     # Determine transaction type labels
#     if account.account_type in ['ASSET', 'EXPENSE']:
#         debit_label = 'Increase'
#         credit_label = 'Decrease'
#     else:
#         debit_label = 'Decrease'
#         credit_label = 'Increase'
    
#     # Base fields
#     fields = [
#         {
#             'id': 'transaction_date',
#             'name': 'transaction_date',
#             'label': 'Transaction Date',
#             'type': 'date',
#             'required': True,
#             'default': timezone.now().date().isoformat()
#         },
#         {
#             'id': 'amount',
#             'name': 'amount',
#             'label': 'Amount',
#             'type': 'number',
#             'required': True,
#             'validation': {'min': 0.01}
#         },
#         {
#             'id': 'description',
#             'name': 'description',
#             'label': 'Description',
#             'type': 'textarea',
#             'required': True
#         }
#     ]
    
#     # Add contra account selector if configured to be selected on form
#     if workflow_config and workflow_config.get('contraAccountOption') == 'select_on_form':
#         fields.append({
#             'id': 'contra_account_id',
#             'name': 'contra_account_id',
#             'label': 'Payment Method / Source Account',
#             'type': 'account_select',  # Custom field type for account dropdown
#             'required': True,
#             'config': {
#                 'account_types': ['ASSET'],  # Usually Cash/Bank accounts
#                 'placeholder': 'Select payment method or source account'
#             }
#         })
    
#     form_schema = FormSchema.objects.create(
#         owner=account.owner,
#         branch=account.branch,
#         created_by=account.created_by,
#         name=f'{account.name} Transaction',
#         description=f'Record transactions for {account.name}',
#         trigger_event_name=f'transaction.{account.code.replace("-", "_").lower()}',
#         schema={
#             'title': f'{account.name} Transaction',
#             'fields': fields
#         }
#     )
    
#     return form_schema


# accounts/signals.py - FIXED master template creation

def _get_or_create_master_workflow(account: Account, workflow_config=None):
    """Get or create MASTER workflow template - FIXED"""
    from automations.models import WorkflowTemplate, WorkflowType
    
    # Determine template identifier
    account_type_lower = account.account_type.lower()
    has_approval = workflow_config and workflow_config.get('requiresApproval', False)
    is_dynamic_contra = workflow_config and workflow_config.get('contraAccountOption') == 'select_on_form'
    
    # Build template run_sequence scoped to owner so each tenant gets its own
    # uniquely-named template and PostgreSQL sequence.  Without the owner prefix,
    # a globally-unique constraint on run_sequence would collide when:
    #   a) multiple EXPENSE parent accounts are created in one batch (race), OR
    #   b) a second tenant creates its first EXPENSE account.
    template_sequence = f"o{account.owner_id}_{account_type_lower}_transaction"
    if has_approval:
        template_sequence += "_approval"
    if is_dynamic_contra:
        template_sequence += "_dynamic"
    
    logger.info(f"Looking for master template: {template_sequence}")
    
    # Determine transaction sides
    if account.account_type in ['ASSET', 'EXPENSE']:
        main_side = 'DR'
        contra_side = 'CR'
    else:
        main_side = 'CR'
        contra_side = 'DR'
    
    # ALWAYS use data.contra_account_id since we always include the field in form
    # (it may be readonly with pre-selected value, or user-selectable)
    contra_account_id = '${data.contra_account_id}'
    
    # Build transaction entries
    transaction_entries = [
        {
            'account_id': '${data.child_account_id}',  # Child account selected via cascading selector
            'side': main_side,
            'amount': '${data.amount}',
            'description': '${workflow.parent_account_name} - ${data.description}'
        },
        {
            'account_id': contra_account_id,
            'side': contra_side,
            'amount': '${data.amount}',
            'description': '${data.description}'
        }
    ]
    
    # Build workflow steps
    steps = [
        {
            'id': 'create_transaction',
            'name': 'Create Transaction',
            'type': 'transaction',
            'config': {
                'date': '${data.transaction_date}',
                'description': '${data.description}',
                'series_code': 'TXN',
                'transaction_type': 'double_entry',
                'entries': transaction_entries
            }
        }
    ]
    
    # Add approval step if required
    if has_approval:
        approval_role = workflow_config.get('approvalRole', 'manager')
        steps.insert(0, {
            'id': 'request_approval',
            'name': 'Request Approval',
            'type': 'approval',
            'config': {
                'approval_role': approval_role,
                'approval_message': 'Transaction approval required for ${workflow.target_account_name}',
                'timeout_hours': 48
            },
            'next': 'create_transaction'
        })
    
    # Human-readable name
    name_parts = [account.get_account_type_display(), 'Transaction']
    if has_approval:
        name_parts.append('(Approval)')
    if is_dynamic_contra:
        name_parts.append('(Dynamic)')
    
    # Use get_or_create so concurrent account-creation signals (e.g. bulk chart-of-
    # accounts setup) don't race each other.  Django's get_or_create catches the
    # IntegrityError from the unique constraint and retries the get, so only one
    # template is ever created per owner+type combination.
    workflow, was_created = WorkflowTemplate.objects.get_or_create(
        run_sequence=template_sequence,
        defaults={
            'owner': account.owner,
            'branch': account.branch,
            'created_by': account.created_by,
            'name': ' '.join(name_parts),
            'description': f'Master template for {account_type_lower} transactions',
            'trigger_type': 'event',
            'trigger_config': {},
            'workflow_definition': {
                'steps': steps,
                'initial_step': steps[0]['id']
            },
            'workflow_type': 'master_template',
            'access_level': 'private',
            'category': account_type_lower,
            'is_atomic': False,
            'is_locked': False,
            'requires_approval': bool(has_approval),
            'max_execution_time_seconds': 300,
            'max_depth': 3,
            'max_steps': 15,
            'is_active': True,
        }
    )
    
    if was_created:
        logger.info(f"Created master template: {workflow.run_sequence} (ID: {workflow.id})")
    else:
        logger.info(f"Reusing existing master template: {workflow.run_sequence}")
    return workflow


def _generate_form_schema(account: Account, workflow_config=None):
    """Generate form schema for PARENT account - includes child account selector"""
    from automations.models import FormSchema
    from django.utils import timezone
    
    # Base fields with PROPER date default
    fields = [
        {
            'id': 'child_account_id',
            'name': 'child_account_id',
            'label': 'Select Account',
            'type': 'account_select',
            'required': True,
            'metadata': {
                'help_text': f'Select a child account under {account.name}',
                'field_type': 'cascading_account_selector',
                'filter_parent_id': account.id  # Only show children of this parent
            }
        },
        {
            'id': 'transaction_date',
            'name': 'transaction_date',
            'label': 'Transaction Date',
            'type': 'date',
            'required': True,
            'default': timezone.now().date().isoformat()  # YYYY-MM-DD format
        },
        {
            'id': 'amount',
            'name': 'amount',
            'label': 'Amount',
            'type': 'number',
            'required': True,
            'validation': {'min': 0.01}
        },
        {
            'id': 'description',
            'name': 'description',
            'label': 'Description',
            'type': 'textarea',
            'required': True
        }
    ]
    
    # ALWAYS add contra account field - behavior depends on whether it was selected during account creation
    contra_account_id = None
    is_contra_readonly = False
    
    if workflow_config:
        if workflow_config.get('contraAccountOption') == 'select_now':
            # Contra account was selected during account creation - make it read-only
            contra_account_id = workflow_config.get('contraAccountId')
            is_contra_readonly = True
        elif workflow_config.get('contraAccountOption') == 'select_on_form':
            # Contra account will be selected during form submission - make it editable
            is_contra_readonly = False
    
    # Add contra account field (always included for double-entry accounting)
    contra_field = {
        'id': 'contra_account_id',
        'name': 'contra_account_id',
        'label': 'Offset Account (Double Entry)',
        'type': 'account_select',
        'required': True,
        'readonly': is_contra_readonly,
        'metadata': {
            'help_text': 'The offsetting account for double-entry bookkeeping',
            'field_type': 'cascading_account_selector'
        }
    }
    
    # If pre-selected, add the default value
    if contra_account_id:
        contra_field['default'] = contra_account_id
        contra_field['metadata']['pre_selected'] = True
    else:
        contra_field['placeholder'] = 'Select offset account'
    
    fields.append(contra_field)
    
    form_schema = FormSchema.objects.create(
        owner=account.owner,
        branch=account.branch,
        created_by=account.created_by,
        name=f'{account.name} Transaction',
        description=f'Record transactions for {account.name}',
        trigger_event_name=f'transaction.{account.code.replace("-", "_").lower()}',
        schema={
            'title': f'{account.name} Transaction',
            'fields': fields
        }
    )
    
    return form_schema


def _link_account_to_workflow(account: Account, master_template, form_schema):
    """Link PARENT account to master template via binding"""
    from automations.models import WorkflowBinding
    
    workflow_config = getattr(account, '_workflow_config', None)
    contra_account_id = None
    
    if workflow_config and workflow_config.get('contraAccountOption') == 'select_now':
        contra_account_id = workflow_config.get('contraAccountId')
    
    # Create binding - workflow parameters reference the parent account
    binding = WorkflowBinding.objects.create(
        owner=account.owner,
        branch=account.branch,
        created_by=account.created_by,
        form_schema=form_schema,
        workflow_template=master_template,
        parameters={
            'parent_account_id': account.id,  # This is the parent account
            'parent_account_name': account.name,
            'parent_account_code': account.code,
            'contra_account_id': contra_account_id,
            # Child account will be selected via form field (data.child_account_id)
        },
        is_active=True
    )
    
    logger.info(
        f"Created binding: {form_schema.name} → {master_template.name} "
        f"(Binding ID: {binding.id}, Parent Account: {account.code})"
    )
    
    return binding

def _create_master_workflow_template(account: Account, template_code: str, workflow_config=None, has_product=False):
    """Create a new master workflow template with parameterized accounts"""
    from automations.models import WorkflowTemplate
    
    # Determine the appropriate transaction sides for double-entry bookkeeping
    if account.account_type in ['ASSET', 'EXPENSE']:
        # Assets/Expenses: Debit increases
        main_side = 'DR'
        contra_side = 'CR'
    else:  # LIABILITY, EQUITY, INCOME
        # Liabilities/Equity/Income: Credit increases
        main_side = 'CR'
        contra_side = 'DR'
    
    # Determine contra account configuration for MASTER template
    # Master templates use PARAMETERS instead of hardcoded IDs
    is_dynamic_contra = workflow_config and workflow_config.get('contraAccountOption') == 'select_on_form'
    
    if is_dynamic_contra:
        # Dynamic: User selects contra account on form
        contra_account_id = '${data.contra_account_id}'
        contra_description = '${data.description}'
    else:
        # Fixed: Use parameter that will be set when linking account to template
        contra_account_id = '${workflow.contra_account_id}'
        contra_description = '${data.description}'
    
    # Build transaction entries with PARAMETERIZED accounts
    # This allows the template to work with ANY account!
    transaction_entries = [
        {
            'account_id': '${workflow.target_account_id}',  # Parameter: which account to affect
            'side': main_side,
            # Use `data` because `FormSubmission._trigger_workflows` places submitted values
            # under the `data` key in the workflow context.
            'amount': '${data.amount}',
            'description': '${workflow.target_account_name} - ${data.description}'
        },
        {
            'account_id': contra_account_id,  # Parameter or form field
            'side': contra_side,
            'amount': '${data.amount}',
            'description': contra_description
        }
    ]
    
    # Build workflow steps
    steps = [
        {
            'id': 'create_transaction',
            'name': 'Create Transaction',
            'type': 'transaction',
            'on_validation_error': 'send_validation_error' if has_product else None,
            'config': {
                # Ensure transaction step has a date mapping. The form submission payload
                # is provided under `data` in the workflow context, so use that.
                'date': '${data.transaction_date}',
                'description': '${data.description}',
                'series_code': 'TXN',
                'transaction_type': 'double_entry',
                'entries': transaction_entries
            }
        }
    ]
    
    # Add approval step if required
    has_approval = workflow_config and workflow_config.get('requiresApproval', False)
    if has_approval:
        approval_role = workflow_config.get('approvalRole', 'manager')
        steps.insert(0, {
            'id': 'request_approval',
            'name': 'Request Approval',
            'type': 'approval',
            'config': {
                'approval_role': approval_role,
                'approval_message': 'Transaction approval required for ${workflow.target_account_name}',
                'timeout_hours': 48,
                'on_approved': 'create_transaction',
                'on_rejected': 'send_rejection_notification'
            }
        })
        
        steps.append({
            'id': 'send_rejection_notification',
            'name': 'Send Rejection Notification',
            'type': 'notification',
            'config': {
                'notification_type': 'email',
                'recipient': '${user.email}',
                'subject': 'Transaction Rejected - ${workflow.target_account_name}',
                'message': (
                    'Your transaction was rejected by ' + approval_role + ':\\n\\n'
                    'Account: ${workflow.target_account_name}\\n'
                    'Amount: ${form.amount}\\n'
                    'Reason: ${approval.rejection_reason}\\n\\n'
                )
            }
        })
    
    # Add validation error notification step if account has product
    if has_product:
        steps.append({
            'id': 'send_validation_error',
            'name': 'Send Validation Error Notification',
            'type': 'notification',
            'config': {
                'notification_type': 'email',
                'recipient': '${user.email}',
                'subject': 'Transaction Blocked - ${workflow.target_account_name}',
                'message': (
                    'Your transaction was blocked due to product validation failure:\\n\\n'
                    'Account: ${workflow.target_account_name}\\n'
                    'Amount: ${form.amount}\\n'
                    'Reason: ${validation_result.checks[-1].message}\\n\\n'
                    'Please review your transaction and try again or contact support.'
                )
            }
        })
    
    # Generate description for MASTER template
    account_type_name = account.get_account_type_display()
    has_approval = workflow_config and workflow_config.get('requiresApproval', False)
    is_dynamic = workflow_config and workflow_config.get('contraAccountOption') == 'select_on_form'
    
    description_parts = [
        f'🎯 MASTER TEMPLATE for {account_type_name} transactions.',
        'This template is reusable across multiple accounts of this type.',
    ]
    
    if has_approval:
        approval_role = workflow_config.get('approvalRole', 'manager')
        description_parts.append(f'✅ Requires approval from {approval_role}.')
    
    if is_dynamic:
        description_parts.append('💳 Dynamic contra account (user selects on form).')
    else:
        description_parts.append('🔒 Fixed contra account (configured per account).')
    
    if has_product:
        description_parts.append('📊 Includes product validation.')
    
    # Human-readable name
    name_parts = [account_type_name, 'Transaction']
    if has_approval:
        name_parts.append('(Approval)')
    if is_dynamic:
        name_parts.append('(Dynamic)')
    if has_product:
        name_parts.append('(Validated)')
    
    workflow = WorkflowTemplate.objects.create(
        owner=account.owner,
        branch=account.branch,
        created_by=account.created_by,
        code=template_code,
        name=' '.join(name_parts),
        description=' '.join(description_parts),
        trigger_type='event',
        trigger_config={
            'event_pattern': f'transaction.{account.account_type.lower()}.*',  # Matches all events of this type
            'filters': {}
        },
        workflow_definition={
            'steps': steps,
            'initial_step': steps[0]['id']
        },
        workflow_type='master_template',  # Mark as master template
        access_level='private',
        is_atomic=False,
        is_locked=False,
        required_inputs=[
            {
                'name': 'form',
                'type': 'object',
                'description': 'Transaction form data',
                'validation': {'required': True}
            },
            {
                'name': 'workflow',
                'type': 'object',
                'description': 'Workflow parameters (account IDs, names)',
                'validation': {'required': True}
            }
        ],
        outputs=[
            {
                'name': 'transaction_id',
                'type': 'string',
                'description': 'ID of created transaction'
            }
        ],
        max_execution_time_seconds=300,
        max_depth=3,
        max_steps=15,
        is_active=True  # Master templates are always active
    )
    
    return workflow


# def _link_account_to_workflow(account: Account, master_template, form_schema):
#     """Link an account to a master workflow template with specific parameters
    
#     This creates a lightweight "binding" that says:
#     'When form X is submitted, trigger master template Y with these parameters'
#     """
#     from automations.models import WorkflowBinding
    
#     # Get contra account ID if configured
#     workflow_config = getattr(account, '_workflow_config', None)
#     contra_account_id = None
#     if workflow_config and workflow_config.get('contraAccountOption') == 'select_now':
#         contra_account_id = workflow_config.get('contraAccountId')
    
#     # Create binding
#     WorkflowBinding.objects.create(
#         owner=account.owner,
#         branch=account.branch,
#         created_by=account.created_by,
        
#         # Link form to master template
#         form_schema=form_schema,
#         workflow_template=master_template,
        
#         # Account-specific parameters
#         parameters={
#             'target_account_id': account.id,
#             'target_account_name': account.name,
#             'target_account_code': account.code,
#             'contra_account_id': contra_account_id,  # None if dynamic
#         },
        
#         is_active=True
#     )


def _generate_module_page(account: Account, form_schema):
    """Generate module page for the transaction form"""
    from pages.models import Module, ModulePage
    from django.db import IntegrityError

    # Use managers that bypass tenant filtering to avoid thread-local tenant mismatches
    # `all_tenants()` returns a queryset without tenant filtering
    module_qs = Module.all_objects.all_tenants()
    page_qs = ModulePage.all_objects.all_tenants()

    # Race-safe get-or-create for Accounts module using unscoped manager
    owner_id = account.owner_id
    branch_id = account.branch_id
    tenant_id = getattr(account, 'tenant_id', None) or getattr(account.owner, 'tenant_id', None)
    created_by_id = getattr(account.created_by, 'id', None)

    # Retry loop to handle concurrent creation races
    # Use a PostgreSQL advisory lock to serialize creation attempts for the same
    # (owner, branch, code) tuple. This prevents the classic race where two
    # transactions both don't see an uncommitted row and try to insert.
    from django.db import connection

    def _lock_key(*parts):
        # Deterministic 63-bit-ish key from components
        raw = '::'.join(str(p) for p in parts)
        return abs(hash(raw)) % (2 ** 62)

    lock_key = _lock_key('modules', owner_id, branch_id, 'accounts')
    accounts_module = None
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT pg_advisory_lock(%s)', [lock_key])
        # Once we hold the lock, do a simple get_or_create. This serializes
        # concurrent creators so only one will perform the insert.
        try:
            # Nested atomic() creates a savepoint so a collision here only
            # rolls back this attempt, not the whole outer transaction.
            with transaction.atomic():
                accounts_module, created = module_qs.get_or_create(
                    owner_id=owner_id,
                    branch_id=branch_id,
                    code='accounts',
                    defaults={
                        'tenant_id': tenant_id,
                        'name': 'Accounts',
                        'description': 'Chart of Accounts Management',
                        'icon': 'book',
                        'color': '#2563eb',
                        'order': 0,
                        'is_deleted': False,
                        'is_active': True,
                        'created_by_id': created_by_id,
                        'required_permission': ''
                    }
                )
        except IntegrityError:
            # If insert still failed, attempt to fetch the existing record
            logger.info(
                'IntegrityError creating accounts Module (owner=%s branch=%s) after lock, fetching',
                owner_id, branch_id
            )
            accounts_module = module_qs.filter(
                owner_id=owner_id,
                branch_id=branch_id,
                code='accounts'
            ).first()
    finally:
        try:
            with connection.cursor() as cur:
                cur.execute('SELECT pg_advisory_unlock(%s)', [lock_key])
        except Exception:
            logger.exception('Failed to release advisory lock for modules %s', lock_key)
    if accounts_module is None:
        # Diagnostic: inspect DB directly to understand why creation failed
        try:
            from django.db import connection
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT id, owner_id, branch_id, tenant_id, code, is_deleted FROM modules WHERE code = %s AND (owner_id = %s OR branch_id = %s)",
                    ['accounts', owner_id, branch_id]
                )
                rows = cur.fetchall()
            logger.error('Module diagnostics: raw DB rows matching code=accounts owner/branch: %s', rows)
        except Exception:
            logger.exception('Failed to run diagnostics query for modules')
        raise IntegrityError(f'Failed to create or locate accounts module for owner={owner_id} branch={branch_id}')

    page_code = f'{account.code.replace("-", "_").lower()}_transaction'

    # Race-safe get-or-create for ModulePage (unique per module+code) using unscoped manager
    module_id = getattr(accounts_module, 'id')
    page_tenant_id = getattr(account, 'tenant_id', None) or getattr(account.owner, 'tenant_id', None)

    page_config_json = {
        'form_schema_id': form_schema.id,
        'submitEndpoint': '/api/form-submissions/',
        'successUrl': f'/accounts/{account.id}'
    }

    module_page = None
    # Serialize ModulePage creation using advisory lock keyed by module+page_code
    page_lock_key = _lock_key('module_page', module_id, page_code)
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT pg_advisory_lock(%s)', [page_lock_key])
        try:
            # Nested atomic() creates a savepoint so a collision here only
            # rolls back this attempt, not the whole outer transaction.
            with transaction.atomic():
                module_page, created = page_qs.get_or_create(
                    module_id=module_id,
                    code=page_code,
                    defaults={
                        'owner_id': owner_id,
                        'branch_id': branch_id,
                        'tenant_id': page_tenant_id,
                        'created_by_id': created_by_id,
                        'title': f'{account.name} Transaction',
                        'description': f'Record transactions for {account.name}',
                        'icon': 'file-text',
                        'page_type': 'form',
                        'page_config': page_config_json,
                        'show_in_menu': True,
                        'is_deleted': False,
                        'is_active': True
                    }
                )
        except IntegrityError:
            logger.info('IntegrityError creating ModulePage after lock, fetching (module=%s code=%s)', module_id, page_code)
            module_page = page_qs.filter(module_id=module_id, code=page_code).first()
    finally:
        try:
            with connection.cursor() as cur:
                cur.execute('SELECT pg_advisory_unlock(%s)', [page_lock_key])
        except Exception:
            logger.exception('Failed to release advisory lock for module_page %s', page_lock_key)
    if module_page is None:
        raise IntegrityError(f'Failed to create or locate module page (module={module_id} code={page_code})')

    return module_page


def _ensure_report_allowed_fields(report):
    """Ensure report has all necessary fields in allowed_fields to prevent validation errors"""
    # Comprehensive field list covering all potential report needs
    required_fields = [
        # Basic TransactionEntry fields
        'id', 'date', 'created_at', 'updated_at',
        'amount', 'description', 'reference', 'side', 
        'balance', 'running_balance',
        
        # Account relationship fields (from TransactionEntry.account)
        'account', 'account_id', 
        'account__name', 'account__code', 'account__account_type',
        'account__parent', 'account__parent__name', 'account__parent__code',
        'account__account_level', 'account__is_active',
        
        # Transaction relationship fields (from TransactionEntry.transaction)
        'transaction', 'transaction_id',
        'transaction__id', 'transaction__date',
        'transaction__description', 'transaction__reference', 'transaction__reference_number',
        'transaction__transaction_type', 'transaction__status',
        'transaction__created_at', 'transaction__updated_at',
        'transaction__created_by', 'transaction__created_by__id',
        'transaction__created_by__username', 'transaction__created_by__email',
        'transaction__created_by__first_name', 'transaction__created_by__last_name',
        
        # Direct fields that might be used in filters/columns
        'transaction_date', 'reference_number', 'debit_amount', 'credit_amount',
        
        # User/Creator fields (from TransactionEntry.created_by)
        'created_by', 'created_by__id', 'created_by__username', 'created_by__email',
        'created_by__first_name', 'created_by__last_name',
        
        # Branch fields (from TransactionEntry.branch)
        'branch', 'branch_id', 'branch__id',
        'branch__name', 'branch__code', 'branch__is_active',
        
        # Owner fields
        'owner', 'owner__id', 'owner__username', 'owner__email',
        
        # Client relationship fields (if applicable)
        'client', 'client__id', 'client__full_name', 'client__email',
        'client__phone_number', 'client__client_code',
        
        # Common aggregation/calculation fields
        'month', 'year', 'quarter', 'deposits', 'withdrawals',
    ]
    
    # Get current allowed fields
    current_allowed = report.allowed_fields or []
    
    # Add missing fields
    updated_fields = list(set(current_allowed + required_fields))
    
    # Update report
    report.allowed_fields = updated_fields
    report.save(update_fields=['allowed_fields'])
    
    logger.info(f"Updated allowed_fields for report {report.code}: {len(updated_fields)} fields")


def _create_report_page(account: Account, report, module: 'Module'):
    """Create a module page for viewing the report"""
    from pages.models import ModulePage
    
    page_code = f'{account.code.replace("-", "_").lower()}_report'
    
    report_page = ModulePage.objects.create(
        module=module,
        owner=account.owner,
        branch=account.branch,
        created_by=account.created_by,
        code=page_code,
        title=f'{account.name} Report',
        description=f'View comprehensive report for {account.name}',
        icon='bar-chart',
        page_type='report',
        page_config={
            'report_id': report.id,
            'report_code': report.code,
            'default_parameters': {
                'start_date': 'current_month_start',
                'end_date': 'today'
            },
            'show_export': True,
            'show_refresh': True,
            'show_parameters': True
        },
        show_in_menu=True,
        is_active=True
    )
    
    return report_page