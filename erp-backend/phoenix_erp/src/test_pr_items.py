#!/usr/bin/env python
"""Test if PR endpoint returns items correctly"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from procurement.views import PurchaseRequisitionViewSet
from users.models import User
from procurement.models import PurchaseRequisition

factory = APIRequestFactory()
user = User.objects.filter(branch__isnull=False).first()

if not user:
    print("❌ No user with branch found")
    exit(1)

print(f"✓ User: {user}, Branch: {user.branch}")

pr = PurchaseRequisition.objects.first()
if not pr:
    print("❌ No PR found")
    exit(1)

print(f"✓ PR: {pr.pr_number}, Items in DB: {pr.items.count()}")

# Test retrieve endpoint
request = factory.get(f'/api/procurement/requisitions/{pr.id}/')
request.user = user
force_authenticate(request, user=user)

view = PurchaseRequisitionViewSet.as_view({'get': 'retrieve'})
response = view(request, pk=pr.id)

print(f"✓ Response Status: {response.status_code}")

if response.status_code == 200:
    items_count = len(response.data.get('items', []))
    print(f"✓ Items in Response: {items_count}")
    
    if items_count > 0:
        first_item = response.data['items'][0]
        print(f"✓ First item keys: {list(first_item.keys())}")
        print(f"✓ First item: id={first_item.get('id')}, description={first_item.get('description')}, quantity={first_item.get('quantity')}")
        print("\n✅ SUCCESS: PR endpoint returns items correctly!")
    else:
        print("\n❌ FAIL: No items returned")
else:
    print(f"\n❌ FAIL: Response status {response.status_code}")
    print(f"Response data: {response.data}")
