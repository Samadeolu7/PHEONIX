from users.models import Tenant, Role
from django.apps import apps

def get_branch_model():
    return apps.get_model('branches', 'Branch')

def get_tenant_model():
    return apps.get_model('users', 'Tenant')