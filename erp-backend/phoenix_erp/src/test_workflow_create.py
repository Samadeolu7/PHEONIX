#!/usr/bin/env python
"""Test create_with_workflow endpoint"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from rest_framework.test import APIClient
from users.models import User
import json

# Get user
user = User.objects.filter(branch__isnull=False, is_active=True).first()
if not user:
    print("❌ No user found")
    sys.exit(1)

print(f"✓ Using user: {user.username}")

# Create API client
client = APIClient()
client.force_authenticate(user=user)

# Test data
data = {
    "department": "IT",
    "request_date": "2026-01-15",
    "required_by_date": "2026-01-28",
    "purpose": "Test with workflow",
    "notes": "Testing items creation",
    "items": [
        {
            "item": None,
            "description": "Test Item 1",
            "quantity": "10",
            "estimated_unit_price": "50.00",
            "notes": "Note 1"
        },
        {
            "item": None,
            "description": "Test Item 2",
            "quantity": "5",
            "estimated_unit_price": "100.00",
            "notes": "Note 2"
        }
    ]
}

print("\n" + "="*60)
print("TEST: Create PR with Workflow")
print("="*60)
print(f"Items in request: {len(data['items'])}")

# Create PR
response = client.post('/api/procurement/purchase-requisitions/create_with_workflow/', data, format='json')

print(f"\nResponse Status: {response.status_code}")
print(f"Response: {json.dumps(response.data, indent=2, default=str)}")

if response.status_code == 201 or response.data.get('success'):
    pr_id = response.data.get('pr_id')
    pr_number = response.data.get('pr_number')
    estimated_total = response.data.get('estimated_total')
    
    print(f"\n✅ PR Created:")
    print(f"   ID: {pr_id}")
    print(f"   Number: {pr_number}")
    print(f"   Estimated Total: ${estimated_total}")
    
    # Now fetch the PR to check if items are there
    print("\n" + "="*60)
    print("FETCHING PR TO CHECK ITEMS")
    print("="*60)
    
    response2 = client.get(f'/api/procurement/purchase-requisitions/{pr_id}/')
    print(f"\nResponse Status: {response2.status_code}")
    
    if response2.status_code == 200:
        pr_data = response2.data
        items = pr_data.get('items', [])
        
        print(f"\n✅ PR Retrieved:")
        print(f"   PR Number: {pr_data.get('pr_number')}")
        print(f"   Estimated Total: ${pr_data.get('estimated_total')}")
        print(f"   Items count: {len(items)}")
        
        if items:
            print(f"\n   📦 Items:")
            for idx, item in enumerate(items, 1):
                print(f"      {idx}. {item.get('description')}")
                print(f"         Qty: {item.get('quantity')} @ ${item.get('estimated_unit_price')}")
                print(f"         Total: ${item.get('total_price')}")
            
            if len(items) == 2:
                print("\n✅ SUCCESS: Items were saved correctly!")
            else:
                print(f"\n⚠ WARNING: Expected 2 items, got {len(items)}")
        else:
            print("\n❌ FAILED: No items returned!")
    else:
        print(f"❌ Failed to retrieve PR: {response2.data}")
else:
    print(f"❌ Failed to create PR: {response.data}")
