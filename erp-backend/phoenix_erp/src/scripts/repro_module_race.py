import threading
import os
import django
import time
import sys

# Ensure project src is on PYTHONPATH
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.db import IntegrityError
from pages.models import Module
from django.contrib.auth import get_user_model

User = get_user_model()

def worker(owner_id, branch_id, created_by_id):
    try:
        mod, created = Module.all_objects.get_or_create(
            owner_id=owner_id,
            branch_id=branch_id,
            code='accounts',
            defaults={
                'tenant_id': None,
                'name': 'Accounts',
                'description': 'Chart of Accounts Management',
                'icon': 'book',
                'color': '#2563eb',
                'order': 0,
                'is_deleted': False,
                'is_active': True,
                'created_by_id': created_by_id,
                'required_permission': ''
            }
        )
        print('worker done', threading.current_thread().name, 'created=', created, 'id=', getattr(mod,'id',None))
    except IntegrityError as ie:
        print('IntegrityError in thread', threading.current_thread().name, ie)


if __name__ == '__main__':
    # pick a valid user and branch from DB
    user = User.objects.first()
    if not user:
        print('No users found')
        exit(1)
    owner_id = user.id
    # try to find a branch id from pages or branches app
    from branches.models import Branch
    branch = Branch.objects.first()
    if not branch:
        print('No branch found')
        exit(1)
    branch_id = branch.id
    created_by_id = user.id

    threads = []
    for i in range(8):
        t = threading.Thread(target=worker, args=(owner_id, branch_id, created_by_id), name=f'w{i}')
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print('Done')
