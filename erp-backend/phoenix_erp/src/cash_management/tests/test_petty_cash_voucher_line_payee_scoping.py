"""
Regression test: creating a bank-transfer petty cash voucher with per-line
Payees must accept staff records that have no branch assigned (branch=NULL),
the same way GET /hr/staff/ (which populates the frontend's Payee dropdown)
returns them as tenant-wide records via OwnerBranchManager.for_user().

Before the fix, PettyCashVoucherSerializer scoped the `lines[].staff` field
to `Staff.objects.filter(branch=branch)` only, so any staff member without a
branch was rejected as an "Invalid pk" — even though they were a selectable
option in the same form. This surfaced to the requester as a generic
"Failed to submit voucher" error.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from accounts.models import Account
from branches.models import Branch
from expenses.models import ExpenseCategory
from cash_management.models import PettyCashFund
from hr.models import Staff

User = get_user_model()


class PettyCashVoucherLinePayeeScopingTests(APITestCase):
    def setUp(self):
        self.requester = User.objects.create_user(
            username='requester', email='requester@example.com', password='testpass123'
        )
        self.branch = Branch.objects.create(name='Main Branch', code='MB01', owner=self.requester)
        self.requester.branch = self.branch
        self.requester.save()

        cash_parent = Account.objects.create(
            code='1100', name='Cash and Cash Equivalents', account_type='ASSET',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.requester, branch=self.branch,
        )
        petty_cash_account = Account.objects.create(
            code='1102', name='Petty Cash', account_type='ASSET',
            account_level='CHILD', parent=cash_parent, allow_manual_entries=True,
            owner=self.requester, branch=self.branch,
        )
        expense_parent = Account.objects.create(
            code='6000', name='Operating Expenses', account_type='EXPENSE',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.requester, branch=self.branch,
        )
        transport_account = Account.objects.create(
            code='6001', name='Transportation Expense', account_type='EXPENSE',
            account_level='CHILD', parent=expense_parent, allow_manual_entries=True,
            owner=self.requester, branch=self.branch,
        )
        self.transport_category = ExpenseCategory.objects.create(
            name='Transportation', code='EXP-TRANS',
            expense_account=transport_account,
            owner=self.requester, branch=self.branch,
        )
        self.fund = PettyCashFund.objects.create(
            fund_name='MoniePoint', fund_code='PC-TEST-BT',
            custodian=self.requester, petty_cash_account=petty_cash_account,
            float_amount=Decimal('100000.00'), current_balance=Decimal('0.00'),
            replenishment_threshold=Decimal('10000.00'),
            single_transaction_limit=Decimal('500000.00'),
            status='active', established_by=self.requester,
            disbursement_mode='bank_transfer',
            owner=self.requester, branch=self.branch,
        )

        # A staff payee with no branch assigned — exactly what GET /hr/staff/
        # returns to any user in any branch as a tenant-wide record.
        self.unbranched_staff = Staff.objects.create(
            first_name='Flora', last_name='Osigbhemhe',
            bank_name='Access Bank', bank_account_number='0123456789',
            owner=self.requester, branch=None,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.requester)

    def test_create_voucher_with_null_branch_line_payee_succeeds(self):
        payload = {
            'fund': self.fund.id,
            'voucher_date': '2026-09-21',
            'purpose': 'Weekly transport exp.',
            'lines': [
                {
                    'expense_category': self.transport_category.id,
                    'description': 'Weekly transport exp.',
                    'amount': '10000.00',
                    'line_order': 0,
                    'staff': self.unbranched_staff.id,
                },
            ],
        }
        response = self.client.post('/api/cash-management/petty-cash-vouchers/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['lines'][0]['staff'], self.unbranched_staff.id)
