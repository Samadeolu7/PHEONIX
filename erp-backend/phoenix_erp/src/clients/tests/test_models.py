from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from clients.models import Client, ClientClassification

from ._helpers import make_client, make_env, make_loan


class ClientModelTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = make_env("clmodel")

    def test_client_creation_generates_id_and_name(self):
        client = make_client(self.user, self.tenant, self.branch, middle_name="Ngozi")
        self.assertTrue(client.client_id)
        self.assertEqual(client.full_name, "Ada Ngozi Obi")
        self.assertEqual(client.name, client.full_name)
        self.assertEqual(str(client), f"Obi, Ada ({client.client_id})")

    def test_invalid_marital_status_rejected(self):
        client = make_client(self.user, self.tenant, self.branch)
        client.marital_status = "invalid_status"
        with self.assertRaises(ValidationError):
            client.full_clean()

    def test_future_date_of_birth_rejected(self):
        client = make_client(self.user, self.tenant, self.branch)
        client.date_of_birth = date.today() + timedelta(days=1)
        with self.assertRaises(ValidationError):
            client.full_clean()

    def test_nin_unique_across_branches(self):
        make_client(self.user, self.tenant, self.branch, nin="12345678901")
        dup = Client(first_name="B", last_name="C", gender="male", phone_primary="0802",
                     nin="12345678901", tenant=self.tenant, owner=self.user, branch=self.branch)
        with self.assertRaises(ValidationError):
            dup.clean()

    def test_soft_deleted_client_hidden_from_default_manager(self):
        client = make_client(self.user, self.tenant, self.branch)
        client.is_deleted = True
        client.save()
        self.assertFalse(Client.objects.filter(pk=client.pk).exists())
        self.assertTrue(Client.all_objects.filter(pk=client.pk).exists())


class ClientDeletionBlockersTests(TestCase):
    """A customer who still owes or holds money must not be deleted."""

    def setUp(self):
        self.user, self.tenant, self.branch = make_env("cldel")
        self.client_obj = make_client(self.user, self.tenant, self.branch)

    def test_no_blockers_for_customer_without_loans_or_savings(self):
        self.assertEqual(self.client_obj.deletion_blockers(), [])

    def test_active_loan_blocks_deletion(self):
        make_loan(self.user, self.branch, self.client_obj, "active")
        blockers = self.client_obj.deletion_blockers()
        self.assertEqual(len(blockers), 1)
        self.assertIn("LN-T-1", blockers[0])

    def test_written_off_loan_blocks_deletion(self):
        make_loan(self.user, self.branch, self.client_obj, "written_off")
        self.assertTrue(self.client_obj.deletion_blockers())

    def test_settled_loans_do_not_block_deletion(self):
        for seq, status in enumerate(("paid_off", "rejected", "cancelled"), start=1):
            make_loan(self.user, self.branch, self.client_obj, status, seq=seq)
        self.assertEqual(self.client_obj.deletion_blockers(), [])


class ClientClassificationTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = make_env("clclass")

    def test_classification_creation(self):
        c = ClientClassification.objects.create(
            name="Premium", code="PREM", description="Premium clients",
            owner=self.user, created_by=self.user, branch=self.branch)
        self.assertEqual(str(c), "Premium")
        self.assertEqual(c.code, "PREM")

    def test_code_unique_per_owner_and_branch(self):
        ClientClassification.objects.create(
            name="First", code="CLASS1", owner=self.user, created_by=self.user, branch=self.branch)
        with self.assertRaises(IntegrityError):
            ClientClassification.objects.create(
                name="Second", code="CLASS1", owner=self.user, created_by=self.user, branch=self.branch)
