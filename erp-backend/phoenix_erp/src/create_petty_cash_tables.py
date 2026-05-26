"""
Temporary script to create PettyCash tables manually
"""
import os
import django
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.db import connection

def create_tables():
    with connection.cursor() as cursor:
        # Create PettyCashFund table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cash_management_pettycashfund (
                id BIGSERIAL PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                is_deleted BOOLEAN NOT NULL DEFAULT false,
                fund_name VARCHAR(200) NOT NULL,
                fund_code VARCHAR(50) UNIQUE NOT NULL,
                float_amount DECIMAL(18,2) NOT NULL,
                current_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
                replenishment_threshold DECIMAL(18,2) NOT NULL,
                single_transaction_limit DECIMAL(18,2) NOT NULL DEFAULT 5000,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                established_date DATE NOT NULL,
                last_replenishment_date DATE,
                last_audit_date DATE,
                notes TEXT,
                branch_id BIGINT REFERENCES branches_branch(id) ON DELETE SET NULL,
                created_by_id BIGINT REFERENCES users_user(id) ON DELETE RESTRICT,
                custodian_id BIGINT REFERENCES users_user(id) ON DELETE RESTRICT,
                gl_account_id BIGINT REFERENCES accounts_account(id) ON DELETE RESTRICT,
                owner_id BIGINT REFERENCES users_user(id) ON DELETE CASCADE,
                tenant_id BIGINT REFERENCES users_tenant(id) ON DELETE CASCADE
            );
        """)
        print("✓ Created cash_management_pettycashfund")
        
        # Create PettyCashReplenishment table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cash_management_pettycashreplenishment (
                id BIGSERIAL PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                is_deleted BOOLEAN NOT NULL DEFAULT false,
                replenishment_number VARCHAR(50) UNIQUE NOT NULL,
                replenishment_date DATE NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_vouchers_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
                total_receipts_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
                total_variance DECIMAL(18,2) NOT NULL DEFAULT 0,
                replenishment_amount DECIMAL(18,2) NOT NULL,
                fund_balance_before DECIMAL(18,2) NOT NULL,
                fund_balance_after DECIMAL(18,2),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                submitted_at TIMESTAMP WITH TIME ZONE,
                verified_at TIMESTAMP WITH TIME ZONE,
                verification_notes TEXT,
                approved_at TIMESTAMP WITH TIME ZONE,
                approval_notes TEXT,
                rejected_at TIMESTAMP WITH TIME ZONE,
                rejection_reason TEXT,
                posted_at TIMESTAMP WITH TIME ZONE,
                expense_breakdown JSONB DEFAULT '{}',
                notes TEXT,
                approved_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                branch_id BIGINT REFERENCES branches_branch(id) ON DELETE SET NULL,
                created_by_id BIGINT REFERENCES users_user(id) ON DELETE RESTRICT,
                fund_id BIGINT NOT NULL REFERENCES cash_management_pettycashfund(id) ON DELETE RESTRICT,
                journal_entry_id BIGINT REFERENCES transactions_transaction(id) ON DELETE RESTRICT,
                owner_id BIGINT REFERENCES users_user(id) ON DELETE CASCADE,
                posted_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                rejected_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                submitted_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                tenant_id BIGINT REFERENCES users_tenant(id) ON DELETE CASCADE,
                verified_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL
            );
        """)
        print("✓ Created cash_management_pettycashreplenishment")
        
        # Create PettyCashVoucher table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cash_management_pettycashvoucher (
                id BIGSERIAL PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                is_deleted BOOLEAN NOT NULL DEFAULT false,
                voucher_number VARCHAR(50) UNIQUE NOT NULL,
                voucher_date DATE NOT NULL,
                purpose VARCHAR(500) NOT NULL,
                amount DECIMAL(18,2) NOT NULL,
                payee_name VARCHAR(200) NOT NULL,
                payee_phone VARCHAR(20),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                approved_at TIMESTAMP WITH TIME ZONE,
                approval_notes TEXT,
                rejected_at TIMESTAMP WITH TIME ZONE,
                rejection_reason TEXT,
                disbursed_at TIMESTAMP WITH TIME ZONE,
                receipt_date DATE,
                receipt_reference VARCHAR(100),
                receipt_attachment VARCHAR(100),
                retired_at TIMESTAMP WITH TIME ZONE,
                variance DECIMAL(18,2) NOT NULL DEFAULT 0,
                variance_explanation TEXT,
                notes TEXT,
                approved_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                branch_id BIGINT REFERENCES branches_branch(id) ON DELETE SET NULL,
                created_by_id BIGINT REFERENCES users_user(id) ON DELETE RESTRICT,
                disbursed_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                expense_category_id BIGINT,
                fund_id BIGINT NOT NULL REFERENCES cash_management_pettycashfund(id) ON DELETE RESTRICT,
                owner_id BIGINT REFERENCES users_user(id) ON DELETE CASCADE,
                rejected_by_id BIGINT REFERENCES users_user(id) ON DELETE SET NULL,
                replenishment_id BIGINT REFERENCES cash_management_pettycashreplenishment(id) ON DELETE SET NULL,
                requested_by_id BIGINT NOT NULL REFERENCES users_user(id) ON DELETE RESTRICT,
                tenant_id BIGINT REFERENCES users_tenant(id) ON DELETE CASCADE
            );
        """)
        print("✓ Created cash_management_pettycashvoucher")
        
        print("\n✅ All PettyCash tables created successfully!")

if __name__ == '__main__':
    create_tables()
