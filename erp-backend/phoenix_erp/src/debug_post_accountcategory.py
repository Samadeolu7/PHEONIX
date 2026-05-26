import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from users.models import Tenant, User
from branches.models import Branch
from rest_framework.test import APIClient

# Setup data similar to the test
tenant = Tenant.objects.create(name='Debug Org', slug='debugorg')
branch = Branch.objects.create(name='Main Branch', code='DBG01', tenant=tenant)
user = User.objects.create_user(username='dbguser', email='dbg@example.com', password='pass', tenant=tenant, branch=branch)

client = APIClient()
client.force_authenticate(user=user)

resp = client.post('/api/accounts/account-classifications/', {'section': 5, 'name': 'Expense Category Debug'}, format='json')
print('Status:', resp.status_code)
print('Data:', resp.data)
