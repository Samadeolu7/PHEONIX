import os
import sys
import django
import argparse

# Ensure src is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

django.setup()

from django.db import connection
from pages.models import Module

parser = argparse.ArgumentParser()
parser.add_argument('--code', default='accounts')
parser.add_argument('--owner', type=int, default=None)
parser.add_argument('--branch', type=int, default=None)
args = parser.parse_args()

code = args.code
owner = args.owner
branch = args.branch

print('Running Module visibility probe for', code, 'owner=', owner, 'branch=', branch)

# Raw DB rows
with connection.cursor() as c:
    sql = "SELECT id, owner_id, branch_id, tenant_id, code, is_deleted FROM modules WHERE code = %s"
    params = [code]
    if owner:
        sql += " AND owner_id = %s"
        params.append(owner)
    if branch:
        sql += " AND branch_id = %s"
        params.append(branch)
    c.execute(sql, params)
    raw = c.fetchall()

print('\nRaw DB rows matching SQL:')
for r in raw:
    print('  ', r)

print('\nORM queries:')
q1 = Module.objects.filter(code=code)
if owner:
    q1 = q1.filter(owner_id=owner)
if branch:
    q1 = q1.filter(branch_id=branch)
print(' Module.objects -> count=', q1.count())
for m in q1[:10]:
    print('  ', m.id, m.owner_id, m.branch_id, getattr(m, 'tenant_id', None), m.code)

try:
    q2 = Module.all_objects.filter(code=code)
    if owner:
        q2 = q2.filter(owner_id=owner)
    if branch:
        q2 = q2.filter(branch_id=branch)
    print(' Module.all_objects -> count=', q2.count())
    for m in q2[:10]:
        print('  ', m.id, m.owner_id, m.branch_id, getattr(m, 'tenant_id', None), m.code)
except Exception as e:
    print(' Module.all_objects query failed:', e)

try:
    q3 = Module.all_objects.all_tenants().filter(code=code)
    if owner:
        q3 = q3.filter(owner_id=owner)
    if branch:
        q3 = q3.filter(branch_id=branch)
    print(' Module.all_objects.all_tenants() -> count=', q3.count())
    for m in q3[:10]:
        print('  ', m.id, m.owner_id, m.branch_id, getattr(m, 'tenant_id', None), m.code)
except Exception as e:
    print(' Module.all_objects.all_tenants() query failed:', e)

print('\nVisibility probe done.')
