from rest_framework.test import APITestCase

from clients.models import Client, ClientClassification

from ._helpers import make_client, make_env, make_loan


def _rows(data):
    return data["results"] if isinstance(data, dict) and "results" in data else data


class ClientAPITests(APITestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = make_env("clapi")
        self.client.force_authenticate(user=self.user)
        # The tenant owner is a director: writes need a branch selected.
        self.headers = {"HTTP_X_BRANCH_ID": str(self.branch.pk)}

    def test_create_client(self):
        resp = self.client.post("/api/clients/clients/", {
            "first_name": "John", "last_name": "Doe", "gender": "male",
            "phone_primary": "08030000000", "marital_status": "single",
            "client_type": "pr",  # prospects pay registration fees on conversion
            "date_of_birth": "1990-01-01",
        }, format="json", **self.headers)
        self.assertEqual(resp.status_code, 201, resp.content)
        client = Client.objects.get(phone_primary="08030000000")
        self.assertEqual(client.full_name, "John Doe")
        self.assertEqual(client.branch_id, self.branch.pk)
        self.assertEqual(client.owner_id, self.user.pk)

    def test_list_clients(self):
        for i in range(3):
            make_client(self.user, self.tenant, self.branch, phone_primary=f"0801000000{i}")
        resp = self.client.get("/api/clients/clients/", **self.headers)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(_rows(resp.data)), 3)

    def test_update_client(self):
        client = make_client(self.user, self.tenant, self.branch)
        resp = self.client.patch(f"/api/clients/clients/{client.pk}/", {
            "last_name": "Updated", "marital_status": "married",
        }, format="json", **self.headers)
        self.assertEqual(resp.status_code, 200, resp.content)
        client.refresh_from_db()
        self.assertEqual(client.last_name, "Updated")
        self.assertEqual(client.marital_status, "married")

    def test_delete_client_soft_deletes(self):
        client = make_client(self.user, self.tenant, self.branch)
        resp = self.client.delete(f"/api/clients/clients/{client.pk}/", **self.headers)
        self.assertEqual(resp.status_code, 204, resp.content)
        self.assertTrue(Client.all_objects.get(pk=client.pk).is_deleted)
        self.assertFalse(Client.objects.filter(pk=client.pk).exists())

    def test_delete_refused_while_customer_has_an_open_loan(self):
        client = make_client(self.user, self.tenant, self.branch)
        make_loan(self.user, self.branch, client, "active")
        resp = self.client.delete(f"/api/clients/clients/{client.pk}/", **self.headers)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("cannot be deleted", str(resp.content))
        self.assertFalse(Client.all_objects.get(pk=client.pk).is_deleted)


class ClientClassificationAPITests(APITestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = make_env("clcls")
        self.client.force_authenticate(user=self.user)
        self.headers = {"HTTP_X_BRANCH_ID": str(self.branch.pk)}

    def test_classification_crud(self):
        resp = self.client.post("/api/clients/classifications/", {
            "name": "VIP", "code": "VIP", "description": "Very important",
        }, format="json", **self.headers)
        self.assertEqual(resp.status_code, 201, resp.content)
        pk = resp.data["id"]

        resp = self.client.get("/api/clients/classifications/", **self.headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(_rows(resp.data)), 1)

        resp = self.client.patch(f"/api/clients/classifications/{pk}/", {"name": "VIP Clients"},
                                 format="json", **self.headers)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["name"], "VIP Clients")

        resp = self.client.delete(f"/api/clients/classifications/{pk}/", **self.headers)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(ClientClassification.objects.filter(pk=pk).exists())
