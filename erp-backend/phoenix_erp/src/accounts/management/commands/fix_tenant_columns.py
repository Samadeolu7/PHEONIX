# accounts/management/commands/fix_tenant_columns.py
"""
Management command to add tenant_id columns to all tables in production.
Run this on your server to fix missing tenant_id columns.
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Add tenant_id columns to all tables that need multi-tenancy support'
    
    def handle(self, *args, **options):
        # List of all tables that need tenant_id
        tables_to_fix = [
            # Accounts app
            'accounts_account',
            'accounts_accountcategory',
            'accounts_accounttransactionpattern',
            'accounts_balancesheetsnapshot',
            'accounts_period',
            
            # Branches app
            'branches_branch',
            
            # Clients app
            'clients_client',
            'clients_clientclassification',
            'clients_clientdocument',
            'clients_clientnote',
            'clients_clientrelationship',
            
            # Expenses app
            'expenses_expense',
            'expenses_expensecategory',
            'expenses_prepaidexpense',
            
            # Inventory app
            'inventory_stockmovement',
            'inventory_stockadjustment',
            'inventory_goodsissued',
            'inventory_invoice',
            'inventory_invoiceitem',
            'inventory_creditnote',
            'inventory_creditnoteitem',
            
            # Incomes app
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
            
            # Procurement app
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
            
            # HR app
            'hr_employee',
            'hr_department',
            'hr_position',
            'hr_payroll',
            'hr_payrollitem',
        ]
        
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.SUCCESS("ADDING TENANT_ID COLUMNS TO ALL TABLES"))
        self.stdout.write("="*70 + "\n")
        
        added_count = 0
        exists_count = 0
        skipped_count = 0
        
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
                    self.stdout.write(f"⊘ {table_name} - Table doesn't exist, skipping")
                    skipped_count += 1
                    continue
                
                # Check if tenant_id column exists
                cursor.execute(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='{table_name}' 
                    AND column_name='tenant_id'
                """)
                tenant_exists = cursor.fetchone()
                
                if not tenant_exists:
                    try:
                        # Add tenant_id column
                        cursor.execute(f"""
                            ALTER TABLE {table_name} 
                            ADD COLUMN tenant_id INTEGER NULL
                        """)
                        
                        # Add foreign key constraint
                        constraint_name = f"{table_name}_tenant_id_fkey"
                        cursor.execute(f"""
                            ALTER TABLE {table_name} 
                            ADD CONSTRAINT {constraint_name}
                            FOREIGN KEY (tenant_id) 
                            REFERENCES users_tenant(id) 
                            ON DELETE CASCADE
                        """)
                        
                        # Add index
                        index_name = f"{table_name}_tenant_id_idx"
                        cursor.execute(f"""
                            CREATE INDEX {index_name} 
                            ON {table_name}(tenant_id)
                        """)
                        
                        self.stdout.write(self.style.SUCCESS(f"✓ {table_name} - tenant_id column added"))
                        added_count += 1
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"✗ {table_name} - Error: {str(e)}"))
                else:
                    self.stdout.write(f"• {table_name} - tenant_id already exists")
                    exists_count += 1
        
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.SUCCESS("SUMMARY:"))
        self.stdout.write(f"  ✓ Added: {added_count}")
        self.stdout.write(f"  • Already existed: {exists_count}")
        self.stdout.write(f"  ⊘ Skipped (table not found): {skipped_count}")
        self.stdout.write("="*70 + "\n")
        
        if added_count > 0:
            self.stdout.write(self.style.WARNING("\n⚠️  IMPORTANT: Restart your application server!"))
            self.stdout.write("   sudo systemctl restart gunicorn")
