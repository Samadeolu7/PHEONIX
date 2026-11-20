"""
Regression: the Client Groups list endpoint (ClientGroupListSerializer) must
return leader / leader_name / description. The page renders the Leader column
and pre-fills its Edit form from list rows; without these fields a saved
leader showed as "—" ("tried to add leader's name but not coming up") and
re-saving a group blanked its description.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from branches.models import Branch
from clients.models import Client, ClientGroup
from clients.serializers import ClientGroupListSerializer
from users.models import Tenant

User = get_user_model()


class ClientGroupListLeaderTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Co', slug='test-co', is_active=True)
        self.branch = Branch.objects.create(name='Main', code='MAIN', tenant=self.tenant, is_active=True)
        self.user = User.objects.create_user(username='u1', password='x')
        self.user.tenant = self.tenant
        self.user.branch = self.branch
        self.user.save()

    def test_list_serializer_includes_leader_fields(self):
        leader = Client.objects.create(
            first_name='Toyin', last_name='Adelani',
            tenant=self.tenant, branch=self.branch, owner=self.user,
        )
        group = ClientGroup.objects.create(
            name='ASELA', code='ASELA', leader=leader, description='Ibafo',
            tenant=self.tenant, branch=self.branch, owner=self.user,
        )
        data = ClientGroupListSerializer(group).data
        self.assertEqual(data['leader'], leader.id)
        self.assertEqual(data['leader_name'], leader.full_name)
        self.assertEqual(data['description'], 'Ibafo')

    def test_list_serializer_without_leader(self):
        group = ClientGroup.objects.create(
            name='Miracle', code='MIRACLE',
            tenant=self.tenant, branch=self.branch, owner=self.user,
        )
        data = ClientGroupListSerializer(group).data
        self.assertIsNone(data['leader'])
        self.assertIsNone(data['leader_name'])
