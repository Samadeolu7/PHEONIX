# accounts/management/commands/populate_tenant_data.py
"""
Management command to populate tenant_id for all existing records.
Run this after adding tenant_id columns to restore access to your data.
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Populate tenant_id for all existing records to restore data access'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Tenant ID to assign to all records (default: 16 for Default Organization)',
            default=16
        )
    
    def handle(self, *args, **options):
        tenant_id = options['tenant_id']
        
        # List of all tables that need tenant_id populated
        tables_to_fix = [
            'accounts_account',
            'accounts_accountcategory',
            'accounts_accounttransactionpattern',
            'accounts_balancesheetsnapshot',
            'accounts_period',
            'branches_branch',
            'clients_client',
            'clients_clientclassification',
            'clients_clientdocument',
            'clients_clientnote',
            'clients_clientrelationship',
            'expenses_expense',
            'expenses_expensecategory',
            'expenses_prepaidexpense',
            'inventory_stockmovement',
            'inventory_stockadjustment',
            'inventory_goodsissued',
            'inventory_invoice',
            'inventory_invoiceitem',
            'inventory_creditnote',
            'inventory_creditnoteitem',
            'incomes_income',
            'incomes_incomecategory',
            'incomes_feestructure',
            'incomes_invoice',
            'incomes_academicyear',
            'incomes_academicterm',
            'incomes_discountprogram',
            'incomes_applieddiscount',
            'incomes_discountapplication',
            'incomes_feeentitlement',
            'incomes_paymentplan',
            'incomes_paymentplaninstallment',
            'incomes_incomeaccountingconfig',
            'incomes_incomecategoryaccountoverride',
            'incomes_entitlementpaymentlog',
            'incomes_entitlementstatuslog',
            'incomes_entitlementusagelog',
            'procurement_supplier',
            'procurement_purchaserequisition',
            'procurement_purchaserequisitionitem',
            'procurement_purchaseorder',
            'procurement_purchaseorderitem',
            'procurement_goodsreceivednote',
            'procurement_goodsreceivednoteitem',
            'procurement_purchasereturn',
            'procurement_purchasereturnitem',
            'procurement_supplierquote',
            'procurement_supplierquoteitem',
            'procurement_procurementconfig',
            'hr_employee',
            'hr_department',
            'hr_position',
            'hr_payroll',
            'hr_payrollitem',
        ]
        
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.SUCCESS(f"POPULATING TENANT_ID = {tenant_id} FOR ALL EXISTING RECORDS"))
        self.stdout.write("="*70 + "\n")
        
        total_updated = 0
        
        with connection.cursor() as cursor:
            for table_name in tables_to_fix:
                # Check if table exists
                cursor.execute(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = '{table_name}'
                    )
                """)
                table_exists = cursor.fetchone()[0]
                
                if not table_exists:
                    continue
                
                # Check if tenant_id column exists
                cursor.execute(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='{table_name}' 
                    AND column_name='tenant_id'
                """)
                has_tenant_column = cursor.fetchone()
                
                if not has_tenant_column:
                    continue
                
                try:
                    # Update all NULL tenant_id records
                    cursor.execute(f"""
                        UPDATE {table_name} 
                        SET tenant_id = %s 
                        WHERE tenant_id IS NULL
                    """, [tenant_id])
                    
                    updated = cursor.rowcount
                    if updated > 0:
                        self.stdout.write(self.style.SUCCESS(f"✓ {table_name} - Updated {updated} records"))
                        total_updated += updated
                    else:
                        self.stdout.write(f"• {table_name} - No records to update")
                        
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"✗ {table_name} - Error: {str(e)}"))
        
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.SUCCESS(f"TOTAL RECORDS UPDATED: {total_updated}"))
        self.stdout.write("="*70 + "\n")
        
        if total_updated > 0:
            self.stdout.write(self.style.SUCCESS("\n✅ Your data should now be accessible!"))
            self.stdout.write(self.style.WARNING("⚠️  Restart your application server:"))
            self.stdout.write("   sudo systemctl restart gunicorn\n")
