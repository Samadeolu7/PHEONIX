"""
Tests for the Office Use Request workflow — the staff-only, no-client
material request replacement (see models_office_use_request.py).

Coverage:
  1. Creation no longer requires a manually-picked expense account.
  2. fulfill() derives the expense account per line from
     item.category.cogs_account, grouping journal lines by distinct account
     rather than requiring one account for the whole request.
  3. Stock is reduced on fulfilment.
  4. Basic workflow state machine (submit / approve / reject).

Run:
    cd erp-backend/phoenix_erp/src
    python manage.py test inventory.tests_office_use_request
"""

from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import InventoryStock
from inventory.models_office_use_request import OfficeUseRequest, OfficeUseRequestItem
from inventory.tests_material_request import (
    _make_user_and_tenant, _make_branch, _make_account,
    _make_inv_category, _make_inv_item, _make_location,
)


def _make_stock(item, location, quantity="100", cost="500.00"):
    return InventoryStock.objects.create(
        item=item, location=location,
        quantity_on_hand=Decimal(quantity),
        quantity_reserved=Decimal("0"),
        quantity_available=Decimal(quantity),
        average_cost=Decimal(cost),
        total_value=Decimal(quantity) * Decimal(cost),
    )


class BaseOURTest(TestCase):
    """Tenant → branch → GL accounts → two distinct categories → items → location."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant, cls.staff = _make_user_and_tenant("our_staff")
        cls.branch = _make_branch(cls.tenant, cls.staff)
        cls.staff.branch = cls.branch
        cls.staff.save()

        cls.inv_account = _make_account(cls.staff, cls.branch, "Inventory Asset", "101-002", "ASSET")
        cls.cogs_stationery = _make_account(cls.staff, cls.branch, "Stationery Expense", "501-010", "EXPENSE")
        cls.cogs_cleaning = _make_account(cls.staff, cls.branch, "Cleaning Expense", "501-011", "EXPENSE")
        cls.sales_account = _make_account(cls.staff, cls.branch, "Sales Income", "401-010", "INCOME")

        cls.cat_stationery = _make_inv_category(
            cls.staff, cls.branch, cls.inv_account, cls.cogs_stationery, cls.sales_account,
            name="Stationery", code="STAT", item_type="Stationery",
        )
        cls.cat_cleaning = _make_inv_category(
            cls.staff, cls.branch, cls.inv_account, cls.cogs_cleaning, cls.sales_account,
            name="Cleaning Supplies", code="CLEAN", item_type="Cleaning",
        )

        cls.pens = _make_inv_item(
            cls.staff, cls.branch, cls.cat_stationery, name="Pens", sku="PEN01",
            cost="50.00", selling="80.00",
        )
        cls.paper = _make_inv_item(
            cls.staff, cls.branch, cls.cat_stationery, name="Paper Ream", sku="PAP01",
            cost="200.00", selling="300.00",
        )
        cls.detergent = _make_inv_item(
            cls.staff, cls.branch, cls.cat_cleaning, name="Detergent", sku="DET01",
            cost="150.00", selling="220.00",
        )

        cls.location = _make_location(cls.staff, cls.branch)

        _make_stock(cls.pens, cls.location, quantity="100", cost="50.00")
        _make_stock(cls.paper, cls.location, quantity="100", cost="200.00")
        _make_stock(cls.detergent, cls.location, quantity="100", cost="150.00")

    def _api_client(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        return client

    def _make_our(self, items, suffix=""):
        our = OfficeUseRequest.objects.create(
            request_number=f"OURTEST{suffix}",
            requested_by=self.staff,
            delivery_location=self.location,
            purpose="Test office use",
            owner=self.staff,
            branch=self.branch,
            tenant=self.tenant,
        )
        for item, qty in items:
            OfficeUseRequestItem.objects.create(
                office_use_request=our, item=item, quantity=Decimal(str(qty))
            )
        return our


OUR_LIST_URL = "/api/inventory/office-use-requests/"


class TestOfficeUseRequestCreate(BaseOURTest):

    def test_api_create_without_expense_account_succeeds(self):
        """Creation no longer requires (or accepts) a manually chosen expense account."""
        api = self._api_client()
        payload = {
            "delivery_location": self.location.id,
            "purpose": "Need pens",
            "notes": "",
            "items": [{"item": self.pens.id, "quantity": "5", "notes": ""}],
        }
        resp = api.post(OUR_LIST_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["status"], "draft")
        self.assertEqual(resp.data["requested_by"], self.staff.id)

    def test_api_requires_at_least_one_item(self):
        api = self._api_client()
        payload = {
            "delivery_location": self.location.id,
            "purpose": "Empty",
            "notes": "",
            "items": [],
        }
        resp = api.post(OUR_LIST_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class TestOfficeUseRequestWorkflow(BaseOURTest):

    def test_submit_approve_workflow(self):
        our = self._make_our([(self.pens, "2")], suffix="WF1")
        our.submit(user=self.staff)
        our.refresh_from_db()
        self.assertEqual(our.status, "submitted")

        our.approve(user=self.staff, notes="ok")
        our.refresh_from_db()
        self.assertEqual(our.status, "approved")
        self.assertEqual(our.approved_by, self.staff)

    def test_reject_requires_reason(self):
        our = self._make_our([(self.pens, "2")], suffix="WF2")
        our.submit(user=self.staff)
        with self.assertRaises(ValidationError):
            our.reject(user=self.staff, reason="")

    def test_fulfill_requires_approved_status(self):
        our = self._make_our([(self.pens, "2")], suffix="WF3")
        with self.assertRaises(ValidationError):
            our.fulfill(user=self.staff)


class TestOfficeUseRequestFulfillAccounting(BaseOURTest):
    """
    Verifies the category-derived accounting: Dr item.category.cogs_account /
    Cr item.category.inventory_account, grouped by distinct account rather
    than a single manually-chosen expense account.
    """

    def _fulfill(self, items, suffix):
        our = self._make_our(items, suffix=suffix)
        our.submit(user=self.staff)
        our.approve(user=self.staff)
        journal_entry = our.fulfill(user=self.staff)
        our.refresh_from_db()
        return our, journal_entry

    def test_fulfill_single_category_produces_one_debit_one_credit_line(self):
        our, je = self._fulfill([(self.pens, "3")], suffix="ACC1")
        self.assertEqual(our.status, "fulfilled")
        lines = list(je.entries.all())
        self.assertEqual(len(lines), 2)

        debit = next(l for l in lines if l.side == l.DEBIT)
        credit = next(l for l in lines if l.side == l.CREDIT)

        self.assertEqual(debit.account_id, self.cogs_stationery.id)
        self.assertEqual(credit.account_id, self.inv_account.id)
        # 3 units * 50.00 average cost = 150.00
        self.assertEqual(debit.amount, Decimal("150.00"))
        self.assertEqual(credit.amount, Decimal("150.00"))

    def test_fulfill_same_category_items_are_grouped(self):
        """Two items from the same category combine into a single Dr/Cr pair."""
        our, je = self._fulfill(
            [(self.pens, "2"), (self.paper, "1")], suffix="ACC2"
        )
        lines = list(je.entries.all())
        self.assertEqual(len(lines), 2)

        debit = next(l for l in lines if l.side == l.DEBIT)
        credit = next(l for l in lines if l.side == l.CREDIT)

        self.assertEqual(debit.account_id, self.cogs_stationery.id)
        self.assertEqual(credit.account_id, self.inv_account.id)
        # (2 * 50.00) + (1 * 200.00) = 300.00
        self.assertEqual(debit.amount, Decimal("300.00"))
        self.assertEqual(credit.amount, Decimal("300.00"))

    def test_fulfill_different_categories_produce_separate_debit_lines(self):
        """Items from different categories post to their own expense accounts."""
        our, je = self._fulfill(
            [(self.pens, "2"), (self.detergent, "1")], suffix="ACC3"
        )
        lines = list(je.entries.all())
        debits = {l.account_id: l.amount for l in lines if l.side == l.DEBIT}
        credits = {l.account_id: l.amount for l in lines if l.side == l.CREDIT}

        self.assertEqual(debits.get(self.cogs_stationery.id), Decimal("100.00"))  # 2 * 50
        self.assertEqual(debits.get(self.cogs_cleaning.id), Decimal("150.00"))    # 1 * 150
        # Both share the same inventory asset account, so it's a single combined credit
        self.assertEqual(credits.get(self.inv_account.id), Decimal("250.00"))

    def test_fulfill_reduces_stock(self):
        our, je = self._fulfill([(self.pens, "4")], suffix="ACC4")
        stock = InventoryStock.objects.get(item=self.pens, location=self.location)
        self.assertEqual(stock.quantity_on_hand, Decimal("96.00"))

    def test_fulfill_insufficient_stock_raises(self):
        our = self._make_our([(self.pens, "9999")], suffix="ACC5")
        our.submit(user=self.staff)
        our.approve(user=self.staff)
        with self.assertRaises(ValidationError):
            our.fulfill(user=self.staff)
