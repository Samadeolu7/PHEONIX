# inventory/tests/test_stock_transfer_workflow.py
"""
Tests for the multi-branch stock transfer workflow: pending -> approved /
rejected -> dispatched -> acknowledged / short_received (or disputed).

Coverage:
  1. State machine — valid and invalid transitions.
  2. Same-branch transfer: no GL entry on full receipt; shrinkage-only entry
     on a short receipt.
  3. Cross-branch transfer: Due-from/Due-to clearing entries on dispatch and
     acknowledgment, always fully clearing the pair even on a short receipt.
  4. SKU auto-link-or-create for the destination branch's own item record.
  5. Due-from/Due-to account idempotency across repeated transfers between
     the same branch pair (reuses interbranch.services' account registry).
  6. API-level permission gating (dispatch requires approval authority;
     acknowledge requires destination-branch effective scope).

Run:
    cd erp-backend/phoenix_erp/src
    python manage.py test inventory.tests.test_stock_transfer_workflow
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from inventory.models import (
    InventoryCategory, InventoryItem, Location, InventoryStock,
    StockTransferRequest,
)


def _make_tenant_owner(username="owner"):
    user = User.objects.create_user(
        username=username, password="pass1234", email=f"{username}@test.com",
    )
    tenant = Tenant.objects.create(name=f"Tenant-{username}", slug=f"t-{username}")
    tenant.owner = user
    tenant.save()
    user.tenant = tenant
    user.save()
    return tenant, user


def _make_branch(tenant, owner, name, code):
    branch = Branch.objects.create(name=name, code=code, tenant=tenant, owner=owner)
    return branch


def _make_account(owner, branch, name, code, account_type):
    parent = Account.objects.create(
        name=f"{name} (Parent)", code=f"P{code}", account_type=account_type,
        account_level="PARENT", owner=owner, branch=branch, tenant=owner.tenant,
    )
    return Account.objects.create(
        name=name, code=code, account_type=account_type, account_level="CHILD",
        parent=parent, owner=owner, branch=branch, tenant=owner.tenant,
    )


def _make_category(owner, branch, inv_acc, cogs_acc, name="Widgets", code="WID"):
    return InventoryCategory.objects.create(
        name=name, code=code, inventory_account=inv_acc, cogs_account=cogs_acc,
        owner=owner, branch=branch, tenant=owner.tenant,
    )


def _make_item(owner, branch, category, name="Widget", sku="WID-001", cost="100.00"):
    return InventoryItem.objects.create(
        name=name, sku=sku, category=category,
        cost_price=Decimal(cost), selling_price=Decimal(cost) * 2,
        owner=owner, branch=branch, tenant=owner.tenant,
    )


def _make_location(owner, branch, name="Main Store", code="LOC1"):
    return Location.objects.create(name=name, code=code, owner=owner, branch=branch, tenant=owner.tenant)


def _make_stock(item, location, quantity="100", cost="100.00"):
    return InventoryStock.objects.create(
        item=item, location=location,
        quantity_on_hand=Decimal(quantity), quantity_reserved=Decimal("0"),
        quantity_available=Decimal(quantity), average_cost=Decimal(cost),
        total_value=Decimal(quantity) * Decimal(cost),
    )


class BaseTransferTest(TestCase):
    """
    Two branches (A, B) of one tenant, each with their own item/category/GL
    accounts.

    Uses per-test setUp() (not setUpTestData()) deliberately: account
    lookups go through get_or_create_child_account's module-level
    _ACCOUNT_CACHE (accounts/utils/account_creation.py), which is a plain
    process-lifetime dict, not reset between test methods. setUpTestData's
    shared class-level branch/owner would let one test's cached (and then
    rolled-back) Account PK leak into the next test as a stale reference,
    raising Account.DoesNotExist. Fresh branch/owner per test sidesteps it
    entirely since the cache key includes branch_id.
    """

    def setUp(self):
        self.tenant, self.owner = _make_tenant_owner("txowner")

        self.branch_a = _make_branch(self.tenant, self.owner, "Branch A", "BRA")
        self.branch_b = _make_branch(self.tenant, self.owner, "Branch B", "BRB")

        self.inv_acc_a = _make_account(self.owner, self.branch_a, "Inventory A", "1201", "ASSET")
        self.cogs_acc_a = _make_account(self.owner, self.branch_a, "COGS A", "5101", "EXPENSE")
        self.cat_a = _make_category(self.owner, self.branch_a, self.inv_acc_a, self.cogs_acc_a)
        self.item_a = _make_item(self.owner, self.branch_a, self.cat_a)
        self.loc_a = _make_location(self.owner, self.branch_a, "Store A", "STA")
        self.loc_a2 = _make_location(self.owner, self.branch_a, "Store A2", "STA2")
        _make_stock(self.item_a, self.loc_a, quantity="100", cost="100.00")

        self.inv_acc_b = _make_account(self.owner, self.branch_b, "Inventory B", "1202", "ASSET")
        self.cogs_acc_b = _make_account(self.owner, self.branch_b, "COGS B", "5102", "EXPENSE")
        self.loc_b = _make_location(self.owner, self.branch_b, "Store B", "STB")

        # A plain (non-elevated) staff user at Branch A, used for permission tests.
        self.staff_a = User.objects.create_user(
            username="staff_a", password="pass1234", email="staff_a@test.com",
        )
        self.staff_a.tenant = self.tenant
        self.staff_a.branch = self.branch_a
        self.staff_a.save()

    def _api(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def _make_transfer(self, from_location, to_location, item=None, quantity="10", suffix=""):
        tr = StockTransferRequest.objects.create(
            request_number=f"TRFTEST{suffix}",
            requested_by=self.owner,
            item=item or self.item_a,
            from_location=from_location,
            to_location=to_location,
            quantity=Decimal(quantity),
            reason="test",
            owner=self.owner,
            branch=from_location.branch,
            tenant=self.tenant,
        )
        return tr


class TestStateMachine(BaseTransferTest):

    def test_approve_from_pending_succeeds(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM1")
        tr.approve(user=self.owner)
        tr.refresh_from_db()
        self.assertEqual(tr.status, "approved")
        self.assertEqual(tr.approved_by, self.owner)

    def test_approve_from_non_pending_raises(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM2")
        tr.approve(user=self.owner)
        with self.assertRaises(ValidationError):
            tr.approve(user=self.owner)

    def test_reject_from_pending_succeeds(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM3")
        tr.reject(user=self.owner, notes="no stock")
        tr.refresh_from_db()
        self.assertEqual(tr.status, "rejected")

    def test_dispatch_requires_approved_status(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM4")
        with self.assertRaises(ValidationError):
            tr.dispatch(user=self.owner)

    def test_acknowledge_requires_dispatched_status(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM5")
        tr.approve(user=self.owner)
        with self.assertRaises(ValidationError):
            tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("10"))

    def test_dispute_requires_dispatched_status_and_reason(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM6")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        with self.assertRaises(ValidationError):
            tr.dispute(user=self.owner, reason="")
        tr.dispute(user=self.owner, reason="wrong item")
        tr.refresh_from_db()
        self.assertEqual(tr.status, "disputed")

    def test_acknowledge_quantity_out_of_range_raises(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SM7")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        with self.assertRaises(ValidationError):
            tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("11"))
        with self.assertRaises(ValidationError):
            tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("-1"))


class TestSameBranchAccounting(BaseTransferTest):

    def test_full_receipt_posts_no_gl_entry(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="SB1")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        self.assertIsNone(tr.dispatch_journal_entry)

        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("10"))
        self.assertEqual(tr.status, "acknowledged")
        self.assertIsNone(tr.acknowledgment_journal_entry)

        stock_a = InventoryStock.objects.get(item=self.item_a, location=self.loc_a)
        stock_a2 = InventoryStock.objects.get(item=tr.destination_item, location=self.loc_a2)
        self.assertEqual(stock_a.quantity_on_hand, Decimal("90.00"))
        self.assertEqual(stock_a2.quantity_on_hand, Decimal("10.00"))
        # Same branch -> destination_item is literally the same InventoryItem row
        self.assertEqual(tr.destination_item_id, self.item_a.id)

    def test_short_receipt_posts_shrinkage_only(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, quantity="10", suffix="SB2")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("6"))

        self.assertEqual(tr.status, "short_received")
        self.assertEqual(tr.variance_quantity, Decimal("4.00"))
        self.assertIsNotNone(tr.acknowledgment_journal_entry)

        lines = list(tr.acknowledgment_journal_entry.entries.all())
        self.assertEqual(len(lines), 2)
        debit = next(l for l in lines if l.side == l.DEBIT)
        credit = next(l for l in lines if l.side == l.CREDIT)
        self.assertEqual(debit.account.name, "Transfer Shrinkage")
        self.assertEqual(debit.amount, Decimal("400.00"))  # 4 * 100
        self.assertEqual(credit.account_id, self.inv_acc_a.id)
        self.assertEqual(credit.amount, Decimal("400.00"))


class TestCrossBranchAccounting(BaseTransferTest):

    def test_dispatch_posts_due_from_entry(self):
        tr = self._make_transfer(self.loc_a, self.loc_b, quantity="5", suffix="XB1")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)

        self.assertIsNotNone(tr.dispatch_journal_entry)
        je = tr.dispatch_journal_entry
        self.assertEqual(je.branch_id, self.branch_a.id)
        lines = list(je.entries.all())
        self.assertEqual(len(lines), 2)
        debit = next(l for l in lines if l.side == l.DEBIT)
        credit = next(l for l in lines if l.side == l.CREDIT)
        self.assertIn("Due from", debit.account.name)
        self.assertEqual(debit.account.branch_id, self.branch_a.id)
        self.assertEqual(credit.account_id, self.inv_acc_a.id)
        self.assertEqual(debit.amount, Decimal("500.00"))  # 5 * 100
        self.assertEqual(credit.amount, Decimal("500.00"))

        stock_a = InventoryStock.objects.get(item=self.item_a, location=self.loc_a)
        self.assertEqual(stock_a.quantity_on_hand, Decimal("95.00"))

    def test_full_acknowledgment_clears_clearing_pair(self):
        tr = self._make_transfer(self.loc_a, self.loc_b, quantity="5", suffix="XB2")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("5"))

        self.assertEqual(tr.status, "acknowledged")
        self.assertIsNotNone(tr.acknowledgment_journal_entry)
        je = tr.acknowledgment_journal_entry
        self.assertEqual(je.branch_id, self.branch_b.id)
        lines = list(je.entries.all())
        self.assertEqual(len(lines), 2)
        debit = next(l for l in lines if l.side == l.DEBIT)
        credit = next(l for l in lines if l.side == l.CREDIT)
        self.assertIn("Due to", credit.account.name)
        self.assertEqual(credit.account.branch_id, self.branch_b.id)
        self.assertEqual(debit.amount, Decimal("500.00"))
        self.assertEqual(credit.amount, Decimal("500.00"))

        # Due-from (source, an asset on Branch A's own books) and Due-to
        # (destination, a liability on Branch B's own books) are two
        # separate Account rows in two separate branches' trial balances —
        # each correctly KEEPS its real ₦500 balance (that's the actual
        # inter-branch receivable/payable until a real settlement clears
        # it, out of scope here). They only "net to zero" if you sum them
        # together across both branches, not within either book alone.
        due_from_account = tr.dispatch_journal_entry.entries.filter(
            side=tr.dispatch_journal_entry.entries.model.DEBIT
        ).first().account
        due_from_account.refresh_from_db()
        self.assertEqual(due_from_account.balance, Decimal("500.00"))
        credit.account.refresh_from_db()
        self.assertEqual(credit.account.balance, Decimal("500.00"))
        self.assertEqual(due_from_account.balance, credit.account.balance)

    def test_short_receipt_still_fully_clears_pair_via_shrinkage(self):
        tr = self._make_transfer(self.loc_a, self.loc_b, quantity="5", suffix="XB3")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("3"))

        self.assertEqual(tr.status, "short_received")
        self.assertEqual(tr.variance_quantity, Decimal("2.00"))

        je = tr.acknowledgment_journal_entry
        self.assertEqual(je.branch_id, self.branch_b.id)
        lines = list(je.entries.all())
        self.assertEqual(len(lines), 3)
        debits = {l.account.name: l.amount for l in lines if l.side == l.DEBIT}
        credits = {l.account.name: l.amount for l in lines if l.side == l.CREDIT}

        # destination_item's category is auto-created fresh (new SKU at Branch B),
        # so its inventory account comes from the SYSTEM_ACCOUNTS registry rather
        # than the self.inv_acc_b fixture created directly in setUp().
        dest_inventory_account_name = tr.destination_item.category.inventory_account.name
        self.assertEqual(debits.get(dest_inventory_account_name), Decimal("300.00"))  # 3 * 100 actual received
        self.assertEqual(debits.get("Transfer Shrinkage"), Decimal("200.00"))  # 2 * 100 shortfall
        due_to_credit = next(v for k, v in credits.items() if "Due to" in k)
        self.assertEqual(due_to_credit, Decimal("500.00"))  # full dispatched value clears the pair

        # Destination's Due-to liability matches the source's Due-from
        # asset exactly (both 500.00) despite the short receipt -- the
        # shortfall was absorbed by the destination's own Transfer
        # Shrinkage expense instead of leaving a mismatched inter-branch
        # balance between the two branches' books.
        due_to_account = next(l.account for l in lines if l.side == l.CREDIT and "Due to" in l.account.name)
        due_to_account.refresh_from_db()
        self.assertEqual(due_to_account.balance, Decimal("500.00"))
        due_from_account = next(
            l.account for l in tr.dispatch_journal_entry.entries.all() if l.side == l.DEBIT
        )
        due_from_account.refresh_from_db()
        self.assertEqual(due_from_account.balance, due_to_account.balance)

    def test_repeated_transfers_reuse_same_clearing_accounts(self):
        """Two separate transfers between the same branch pair must not create duplicate Due-from/Due-to accounts."""
        tr1 = self._make_transfer(self.loc_a, self.loc_b, quantity="1", suffix="XB4A")
        tr1.approve(user=self.owner)
        tr1.dispatch(user=self.owner)

        tr2 = self._make_transfer(self.loc_a, self.loc_b, quantity="2", suffix="XB4B")
        tr2.approve(user=self.owner)
        tr2.dispatch(user=self.owner)

        due_from_1 = next(l.account for l in tr1.dispatch_journal_entry.entries.all() if l.side == l.DEBIT)
        due_from_2 = next(l.account for l in tr2.dispatch_journal_entry.entries.all() if l.side == l.DEBIT)
        self.assertEqual(due_from_1.id, due_from_2.id)

    def test_sku_auto_creates_destination_item_and_category(self):
        tr = self._make_transfer(self.loc_a, self.loc_b, quantity="5", suffix="XB5")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("5"))

        dest_item = tr.destination_item
        self.assertIsNotNone(dest_item)
        self.assertNotEqual(dest_item.id, self.item_a.id)
        self.assertEqual(dest_item.sku, self.item_a.sku)
        self.assertEqual(dest_item.branch_id, self.branch_b.id)
        self.assertEqual(dest_item.name, self.item_a.name)

        dest_category = dest_item.category
        self.assertEqual(dest_category.branch_id, self.branch_b.id)
        self.assertEqual(dest_category.code, self.cat_a.code)
        self.assertNotEqual(dest_category.id, self.cat_a.id)
        self.assertEqual(dest_category.inventory_account.branch_id, self.branch_b.id)
        self.assertEqual(dest_category.cogs_account.branch_id, self.branch_b.id)

    def test_sku_reuses_existing_destination_item(self):
        """If Branch B already stocks this SKU, acknowledge must reuse it, not create a duplicate."""
        cat_b = _make_category(self.owner, self.branch_b, self.inv_acc_b, self.cogs_acc_b, code="WID")
        existing_dest_item = _make_item(
            self.owner, self.branch_b, cat_b, name="Existing Widget",
            sku=self.item_a.sku, cost="120.00",
        )
        tr = self._make_transfer(self.loc_a, self.loc_b, quantity="5", suffix="XB6")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)
        tr.acknowledge(user=self.owner, actual_quantity_received=Decimal("5"))

        self.assertEqual(tr.destination_item_id, existing_dest_item.id)


class TestApiPermissions(BaseTransferTest):

    def test_dispatch_requires_approval_authority(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="API1")
        tr.approve(user=self.owner)

        api = self._api(self.staff_a)
        resp = api.post(f"/api/inventory/transfers/{tr.id}/dispatch/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        owner_api = self._api(self.owner)
        resp = owner_api.post(f"/api/inventory/transfers/{tr.id}/dispatch/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_execute_endpoint_retired(self):
        tr = self._make_transfer(self.loc_a, self.loc_a2, suffix="API2")
        tr.approve(user=self.owner)
        tr.dispatch(user=self.owner)

        api = self._api(self.owner)
        resp = api.post(f"/api/inventory/transfers/{tr.id}/execute/")
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_create_allows_cross_branch_to_location(self):
        """The create endpoint must accept a to_location in a different branch."""
        api = self._api(self.owner)
        resp = api.post("/api/inventory/transfers/", {
            "item_id": self.item_a.id,
            "from_location_id": self.loc_a.id,
            "to_location_id": self.loc_b.id,
            "quantity": "3",
            "reason": "cross-branch API test",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["data"]["from_branch"], self.branch_a.id)
        self.assertEqual(resp.data["data"]["to_branch"], self.branch_b.id)
