"""
Regression tests for bank transfer / bank payment approval permissions.

Covers the fixes made after an investigation found bank transfer approval
did not follow the RolePermissionPolicy permission-setup system:

1. BankTransferViewSet.reject() now requires the same approval authority as
   approve()/second_approve() (previously anyone who could view a transfer
   could reject it).
2. Cashier-destined transfers (destination_type == 'cashier') can only ever
   be approved/rejected by the actual destination cashier — a hard
   invariant that no role, rank, or RolePermissionPolicy grant may override.
   Bank-directed transfers (bank-to-bank, cashier-to-bank) ARE governed by
   the permission-setup system.
3. IsApprover/can_user_approve() is now scoped to the calling view's
   module/page instead of resolving with module=None, page=None.
4. can_user_approve() no longer treats is_staff as a blanket approval
   bypass — only is_superuser does.
5. BankTransferViewSet.get_permissions() now exempts approve/second_approve/
   reject from the auto-appended HasActionPermission, which would otherwise
   require can_approve on banks:bank-transfers for ALL transfer types —
   a grant migrate_bank_transfer_policies.py deliberately withholds from
   branch managers, and ordinary cashiers/account managers never had at all.
   Left in place, it would 403 those three approval paths before the view
   body's _check_approval_permission ever ran, regardless of transfer type.

Most tests call BankTransferViewSet._check_approval_permission() directly
with unsaved BankAccount/CashierAccount instances (only the cashier/
account_manager FK identity matters for these checks — no GL account or
chart-of-accounts setup is needed) rather than going through the full HTTP
stack, keeping these tests fast and independent of unrelated app wiring.
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status

from banks.models import BankAccount, BankTransfer
from banks.views import BankTransferViewSet
from cash_management.models import CashierAccount
from common.approval_permissions import IsApprover, can_user_approve

User = get_user_model()


def _request(user):
    return SimpleNamespace(user=user)


class BankTransferApprovalPermissionTests(TestCase):
    """Tests for BankTransferViewSet._check_approval_permission()."""

    def setUp(self):
        self.viewset = BankTransferViewSet()

        self.outsider = User.objects.create_user(username='outsider', password='x')
        self.destination_cashier = User.objects.create_user(username='dest_cashier', password='x')
        self.other_cashier = User.objects.create_user(username='other_cashier', password='x')
        self.account_manager = User.objects.create_user(username='acct_mgr', password='x')
        self.superuser = User.objects.create_superuser(username='root', password='x', email='root@test.com')

        self.destination_cashier_account = CashierAccount(cashier=self.destination_cashier)
        self.account_manager_bank_account = BankAccount(account_manager=self.account_manager)

    # ── Cashier-to-cashier: hard invariant, never overridable ──────────────

    def test_cashier_to_cashier_destination_cashier_may_approve(self):
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='cashier',
            destination_cashier_account=self.destination_cashier_account,
        )
        result = self.viewset._check_approval_permission(_request(self.destination_cashier), transfer)
        self.assertIsNone(result)

    def test_cashier_to_cashier_destination_cashier_may_reject(self):
        # reject() runs the exact same check as approve() — this is Fix 2's
        # regression test: previously reject() had no permission check at all.
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='cashier',
            destination_cashier_account=self.destination_cashier_account,
        )
        result = self.viewset._check_approval_permission(_request(self.destination_cashier), transfer)
        self.assertIsNone(result)

    def test_cashier_to_cashier_other_user_forbidden(self):
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='cashier',
            destination_cashier_account=self.destination_cashier_account,
        )
        result = self.viewset._check_approval_permission(_request(self.other_cashier), transfer)
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_to_cashier_superuser_cannot_bypass(self):
        """No role, rank, or grant — not even is_superuser — may approve a
        transfer landing in another person's cashier account on their behalf."""
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='cashier',
            destination_cashier_account=self.destination_cashier_account,
        )
        result = self.viewset._check_approval_permission(_request(self.superuser), transfer)
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)

    # ── Cashier-to-bank: destination account manager only ──────────────────

    def test_cashier_to_bank_account_manager_may_approve(self):
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='bank',
            destination_bank_account=self.account_manager_bank_account,
        )
        result = self.viewset._check_approval_permission(_request(self.account_manager), transfer)
        self.assertIsNone(result)

    def test_cashier_to_bank_other_user_forbidden(self):
        transfer = BankTransfer(
            source_type='cashier',
            destination_type='bank',
            destination_bank_account=self.account_manager_bank_account,
        )
        result = self.viewset._check_approval_permission(_request(self.outsider), transfer)
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)

    # ── Bank-to-bank: governed by RolePermissionPolicy.can_approve ─────────

    def test_bank_to_bank_user_with_no_grant_forbidden(self):
        """This is the area the permission-setup system is meant to govern —
        a user with no RolePermissionPolicy grant (and no role at all) must
        default-deny, not fall back to any implicit bypass."""
        transfer = BankTransfer(source_type='bank', destination_type='bank')
        result = self.viewset._check_approval_permission(_request(self.outsider), transfer)
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)

    # ── Bank-to-cashier: role-gated, never reachable via second_approve ────

    def test_bank_to_cashier_user_without_role_forbidden(self):
        transfer = BankTransfer(source_type='bank', destination_type='cashier')
        result = self.viewset._check_approval_permission(_request(self.outsider), transfer)
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)

    def test_second_approve_skips_bank_to_cashier_branch(self):
        """allow_bank_to_cashier=False (used by second_approve()) must fall
        through to the bank-to-bank PermissionResolver check instead of the
        looser bank-to-cashier role check, even though destination_type here
        happens to be 'cashier' — mirrors the original inline logic exactly,
        which never actually reaches this combination in practice because
        second_approve() itself blocks all cashier-destined transfers first."""
        transfer = BankTransfer(source_type='bank', destination_type='cashier')
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_approve=False)
            result = self.viewset._check_approval_permission(
                _request(self.outsider), transfer, allow_bank_to_cashier=False,
            )
        mock_resolve.assert_called_once()
        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, status.HTTP_403_FORBIDDEN)


class BankTransferGetPermissionsTests(TestCase):
    """Fix 5: approve/second_approve/reject must bypass the auto-appended
    HasActionPermission (which would require can_approve on
    banks:bank-transfers regardless of transfer type) and rely solely on
    _check_approval_permission()'s own per-transfer-type logic."""

    def _permission_classes(self, action):
        viewset = BankTransferViewSet()
        viewset.action = action
        return [type(p) for p in viewset.get_permissions()]

    def test_approve_reject_second_approve_skip_has_action_permission(self):
        from permissions.permission_classes import HasActionPermission

        for action in ('approve', 'second_approve', 'reject'):
            classes = self._permission_classes(action)
            self.assertNotIn(
                HasActionPermission, classes,
                f'{action} must not be gated by the blanket can_approve check',
            )

    def test_other_actions_still_use_has_action_permission(self):
        from permissions.permission_classes import HasActionPermission

        for action in ('list', 'create', 'update', 'destroy', 'submit'):
            classes = self._permission_classes(action)
            self.assertIn(
                HasActionPermission, classes,
                f'{action} should still be gated by the standard can_view/create/edit/delete check',
            )


class IsApproverScopingTests(TestCase):
    """Fix 3: IsApprover/can_user_approve() must resolve against the calling
    view's module/page, not module=None/page=None (which only matches a
    role-wide global grant, and otherwise silently falls through to a
    different, unintended resolution path)."""

    def setUp(self):
        self.user = User.objects.create_user(username='approver', password='x')

    def test_is_approver_passes_view_module_page_to_resolver(self):
        view = SimpleNamespace(permission_module='banks', permission_page='bank-payments')
        request = _request(self.user)

        # can_user_approve() imports PermissionResolver from permissions.services
        # inside the function body (deferred import), so the class must be
        # patched at its defining module, not at common.approval_permissions.
        with patch('permissions.services.PermissionResolver') as mock_resolver:
            mock_resolver._is_wildcard.return_value = False
            mock_resolver.resolve.return_value = SimpleNamespace(can_approve=True)
            result = IsApprover().has_permission(request, view)

        mock_resolver.resolve.assert_called_once_with(
            self.user, module='banks', page='bank-payments', action='approve',
        )
        self.assertTrue(result)

    def test_is_approver_with_no_module_page_hints_resolves_unscoped(self):
        """A view with no permission_module/permission_page set degrades to
        the old unscoped behaviour rather than erroring — documents the
        fallback rather than asserting it's ideal."""
        view = SimpleNamespace()
        request = _request(self.user)

        with patch('permissions.services.PermissionResolver') as mock_resolver:
            mock_resolver._is_wildcard.return_value = False
            mock_resolver.resolve.return_value = SimpleNamespace(can_approve=False)
            IsApprover().has_permission(request, view)

        mock_resolver.resolve.assert_called_once_with(
            self.user, module=None, page=None, action='approve',
        )


class CanUserApproveBypassTests(TestCase):
    """Fix 4: is_staff alone must no longer grant blanket approval authority;
    is_superuser remains the only legitimate break-glass bypass."""

    def test_is_staff_alone_does_not_bypass(self):
        user = User.objects.create_user(username='staffer', password='x', is_staff=True)
        self.assertFalse(can_user_approve(user, module='banks', page='bank-payments'))

    def test_is_superuser_still_bypasses(self):
        user = User.objects.create_superuser(username='root2', password='x', email='root2@test.com')
        self.assertTrue(can_user_approve(user, module='banks', page='bank-payments'))

    def test_plain_user_with_no_grant_denied(self):
        user = User.objects.create_user(username='plain', password='x')
        self.assertFalse(can_user_approve(user, module='banks', page='bank-payments'))
