"""
Management command to seed page actions for the procurement module
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from pages.models import Module, ModulePage
from pages.action_models import PageAction
from users.models import Role, Tenant

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed page actions for procurement and other modules'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Tenant ID to seed actions for'
        )
        parser.add_argument(
            '--owner-email',
            type=str,
            help='Email of the owner user'
        )
    
    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        owner_email = options.get('owner_email')
        
        if not tenant_id and not owner_email:
            self.stdout.write(self.style.ERROR('Please provide either --tenant-id or --owner-email'))
            return
        
        # Get user/tenant
        if owner_email:
            try:
                owner = User.objects.get(email=owner_email)
                tenant = owner.tenant
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User not found: {owner_email}'))
                return
        else:
            try:
                tenant = Tenant.objects.get(id=tenant_id)
                owner = tenant.owner
            except Tenant.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Tenant not found: {tenant_id}'))
                return
        
        self.stdout.write(f'Seeding actions for tenant: {tenant.name}')
        self.stdout.write(f'Owner: {owner.email}')
        
        # Get or create Procurement module
        procurement_module, created = Module.objects.get_or_create(
            owner=owner,
            code='procurement',
            defaults={
                'name': 'Procurement',
                'description': 'Purchase requisitions, orders, and vendor management',
                'icon': 'shopping-cart',
                'color': '#8b5cf6',
                'order': 3,
                'is_active': True,
                'tenant': tenant,
                'branch': owner.branch if hasattr(owner, 'branch') else None,
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created module: {procurement_module.name}'))
        else:
            self.stdout.write(f'  Module exists: {procurement_module.name}')
        
        # Get or create Purchase Requisitions page
        pr_page, created = ModulePage.objects.get_or_create(
            module=procurement_module,
            code='purchase-requisitions',
            defaults={
                'title': 'Purchase Requisitions',
                'description': 'Manage purchase requisitions',
                'icon': 'file-text',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 1,
                'is_active': True,
                'owner': owner,
                'tenant': tenant,
                'branch': owner.branch if hasattr(owner, 'branch') else None,
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created page: {pr_page.title}'))
        
        # Define actions for Purchase Requisitions
        pr_actions = [
            {
                'code': 'pr-view',
                'name': 'View Requisitions',
                'action_type': 'view',
                'description': 'View purchase requisition list',
                'permission_codename': 'procurement.view_purchaserequisition',
                'icon': 'eye',
                'color': '#3b82f6',
                'order': 1,
            },
            {
                'code': 'pr-view-detail',
                'name': 'View Requisition Details',
                'action_type': 'view',
                'description': 'View detailed information of a requisition',
                'permission_codename': 'procurement.view_purchaserequisition',
                'icon': 'file-text',
                'color': '#3b82f6',
                'order': 2,
            },
            {
                'code': 'pr-create',
                'name': 'Create Requisition',
                'action_type': 'create',
                'description': 'Create new purchase requisition',
                'permission_codename': 'procurement.add_purchaserequisition',
                'icon': 'plus',
                'color': '#10b981',
                'order': 3,
            },
            {
                'code': 'pr-edit',
                'name': 'Edit Requisition',
                'action_type': 'edit',
                'description': 'Edit existing purchase requisition',
                'permission_codename': 'procurement.change_purchaserequisition',
                'icon': 'edit',
                'color': '#f59e0b',
                'order': 4,
            },
            {
                'code': 'pr-delete',
                'name': 'Delete Requisition',
                'action_type': 'delete',
                'description': 'Delete purchase requisition',
                'permission_codename': 'procurement.delete_purchaserequisition',
                'icon': 'trash-2',
                'color': '#ef4444',
                'order': 5,
            },
            {
                'code': 'pr-approve',
                'name': 'Approve Requisition',
                'action_type': 'approve',
                'description': 'Approve purchase requisition',
                'permission_codename': 'procurement.approve_purchaserequisition',
                'icon': 'check-circle',
                'color': '#10b981',
                'order': 6,
            },
            {
                'code': 'pr-reject',
                'name': 'Reject Requisition',
                'action_type': 'reject',
                'description': 'Reject purchase requisition',
                'permission_codename': 'procurement.reject_purchaserequisition',
                'icon': 'x-circle',
                'color': '#ef4444',
                'order': 7,
            },
            {
                'code': 'pr-convert-to-po',
                'name': 'Convert to PO',
                'action_type': 'process',
                'description': 'Convert requisition to purchase order',
                'permission_codename': 'procurement.convert_to_po',
                'icon': 'arrow-right',
                'color': '#8b5cf6',
                'order': 8,
            },
            {
                'code': 'pr-submit-approval',
                'name': 'Submit for Approval',
                'action_type': 'submit',
                'description': 'Submit requisition for approval workflow',
                'permission_codename': 'procurement.submit_purchaserequisition',
                'icon': 'send',
                'color': '#3b82f6',
                'order': 9,
            },
        ]
        
        # Create actions
        created_actions = 0
        for action_data in pr_actions:
            action, created = PageAction.objects.get_or_create(
                module=procurement_module,
                page=pr_page,
                code=action_data['code'],
                defaults={
                    **action_data,
                    'owner': owner,
                    'tenant': tenant,
                    'branch': owner.branch if hasattr(owner, 'branch') else None,
                    'is_active': True,
                    'show_in_list': True,
                }
            )
            
            if created:
                created_actions += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created action: {action.name}'))
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Created {created_actions} new actions'))
        
        # Also create Purchase Orders page and actions
        po_page, created = ModulePage.objects.get_or_create(
            module=procurement_module,
            code='purchase-orders',
            defaults={
                'title': 'Purchase Orders',
                'description': 'Manage purchase orders',
                'icon': 'shopping-bag',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 2,
                'is_active': True,
                'owner': owner,
                'tenant': tenant,
                'branch': owner.branch if hasattr(owner, 'branch') else None,
            }
        )
        
        po_actions = [
            {
                'code': 'po-view',
                'name': 'View Orders',
                'action_type': 'view',
                'description': 'View purchase order list',
                'icon': 'eye',
                'order': 1,
            },
            {
                'code': 'po-create',
                'name': 'Create Order',
                'action_type': 'create',
                'description': 'Create new purchase order',
                'icon': 'plus',
                'order': 2,
            },
            {
                'code': 'po-edit',
                'name': 'Edit Order',
                'action_type': 'edit',
                'description': 'Edit existing purchase order',
                'icon': 'edit',
                'order': 3,
            },
            {
                'code': 'po-approve',
                'name': 'Approve Order',
                'action_type': 'approve',
                'description': 'Approve purchase order',
                'icon': 'check-circle',
                'order': 4,
            },
        ]
        
        for action_data in po_actions:
            action, created = PageAction.objects.get_or_create(
                module=procurement_module,
                page=po_page,
                code=action_data['code'],
                defaults={
                    **action_data,
                    'name': action_data['name'],
                    'action_type': action_data['action_type'],
                    'description': action_data['description'],
                    'icon': action_data['icon'],
                    'color': '#3b82f6',
                    'order': action_data['order'],
                    'owner': owner,
                    'tenant': tenant,
                    'branch': owner.branch if hasattr(owner, 'branch') else None,
                    'is_active': True,
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created PO action: {action.name}'))
        
        self.stdout.write(self.style.SUCCESS('\n✅ Seeding complete!'))
