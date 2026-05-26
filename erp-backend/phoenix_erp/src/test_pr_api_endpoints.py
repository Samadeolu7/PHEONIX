#!/usr/bin/env python
"""Test PR API endpoints with actual HTTP requests"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from users.models import User, Tenant
from branches.models import Branch
from procurement.models import PurchaseRequisition
from inventory.models import InventoryItem
from datetime import date, timedelta
import json

User = get_user_model()

def setup_test_data():
    """Create test user, tenant, branch"""
    print("\n" + "="*60)
    print("SETTING UP TEST DATA")
    print("="*60)
    
    # Get user with tenant and branch
    user = User.objects.filter(
        tenant__isnull=False,
        branch__isnull=False,
        is_active=True
    ).first()
    
    if not user:
        print("❌ No active user found with tenant and branch")
        sys.exit(1)
    
    tenant = user.tenant
    branch = user.branch
    
    print(f"✓ Using Tenant: {tenant.name}")
    print(f"✓ Using Branch: {branch.name}")
    print(f"✓ Using User: {user.username} ({user.get_full_name()})")
    
    # Get an inventory item if exists
    item = InventoryItem.objects.filter(branch=branch).first()
    if item:
        print(f"✓ Found Inventory Item: {item.name} (ID: {item.id})")
    else:
        print("⚠ No inventory items found (will create PR without item links)")
    
    return user, tenant, branch, item


def test_create_requisition(client, user, branch, item):
    """Test POST /api/procurement/purchase-requisitions/"""
    print("\n" + "="*60)
    print("TEST 1: CREATE REQUISITION")
    print("="*60)
    
    url = '/api/procurement/purchase-requisitions/'
    
    # Prepare request data
    required_date = (date.today() + timedelta(days=14)).isoformat()
    
    data = {
        'purpose': 'Test requisition via API endpoint',
        'required_by_date': required_date,
        'department': 'IT Department',
        'items': [
            {
                'item': item.id if item else None,
                'description': 'Dell Laptop XPS 15 - API Test',
                'quantity': '5.00',
                'estimated_unit_price': '1500.00',
                'notes': 'High priority'
            },
            {
                'item': item.id if item else None,
                'description': 'USB-C Dock - API Test',
                'quantity': '5.00',
                'estimated_unit_price': '150.00',
                'notes': 'For new laptops'
            },
            {
                'item': None,  # Item without inventory link
                'description': 'HDMI Cables - API Test',
                'quantity': '10.00',
                'estimated_unit_price': '15.00',
                'notes': ''
            }
        ]
    }
    
    print(f"\n📤 POST {url}")
    print(f"   Purpose: {data['purpose']}")
    print(f"   Items: {len(data['items'])}")
    print(f"   Department: {data['department']}")
    
    response = client.post(url, data, format='json')
    
    print(f"\n📥 Response Status: {response.status_code}")
    
    if response.status_code != status.HTTP_201_CREATED:
        print(f"❌ FAILED: Expected 201, got {response.status_code}")
        print(f"Response: {json.dumps(response.data, indent=2, default=str)}")
        return None
    
    print("✅ SUCCESS: Requisition created")
    
    pr_data = response.data
    print(f"\n📋 Created PR:")
    print(f"   ID: {pr_data.get('id')}")
    print(f"   PR Number: {pr_data.get('pr_number')}")
    print(f"   Status: {pr_data.get('status')}")
    print(f"   Items count: {len(pr_data.get('items', []))}")
    
    items = pr_data.get('items', [])
    if items:
        print(f"\n   📦 Items returned in create response:")
        for idx, item in enumerate(items, 1):
            print(f"      {idx}. {item.get('description')} - Qty: {item.get('quantity')} @ ${item.get('estimated_unit_price')}")
    else:
        print("   ⚠ WARNING: No items in create response!")
    
    return pr_data


def test_get_requisition(client, pr_id):
    """Test GET /api/procurement/purchase-requisitions/{id}/"""
    print("\n" + "="*60)
    print("TEST 2: GET REQUISITION BY ID")
    print("="*60)
    
    url = f'/api/procurement/purchase-requisitions/{pr_id}/'
    
    print(f"\n📤 GET {url}")
    
    response = client.get(url)
    
    print(f"\n📥 Response Status: {response.status_code}")
    
    if response.status_code != status.HTTP_200_OK:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {json.dumps(response.data, indent=2, default=str)}")
        return None
    
    print("✅ SUCCESS: Requisition retrieved")
    
    pr_data = response.data
    print(f"\n📋 Retrieved PR:")
    print(f"   ID: {pr_data.get('id')}")
    print(f"   PR Number: {pr_data.get('pr_number')}")
    print(f"   Status: {pr_data.get('status')}")
    print(f"   Purpose: {pr_data.get('purpose')}")
    print(f"   Department: {pr_data.get('department')}")
    print(f"   Estimated Total: ${pr_data.get('estimated_total')}")
    
    items = pr_data.get('items', [])
    print(f"\n   📦 Items count: {len(items)}")
    
    if items:
        print(f"   📦 Items details:")
        for idx, item in enumerate(items, 1):
            print(f"      {idx}. ID: {item.get('id')}")
            print(f"         Description: {item.get('description')}")
            print(f"         Quantity: {item.get('quantity')}")
            print(f"         Unit Price: ${item.get('estimated_unit_price')}")
            print(f"         Total: ${item.get('total_price')}")
            if item.get('item'):
                print(f"         Linked Item: {item.get('item_name')} (SKU: {item.get('item_sku')})")
            print()
    else:
        print("   ❌ ERROR: No items returned!")
    
    return pr_data, items


def test_list_requisitions(client):
    """Test GET /api/procurement/purchase-requisitions/"""
    print("\n" + "="*60)
    print("TEST 3: LIST REQUISITIONS")
    print("="*60)
    
    url = '/api/procurement/purchase-requisitions/'
    
    print(f"\n📤 GET {url}")
    
    response = client.get(url)
    
    print(f"\n📥 Response Status: {response.status_code}")
    
    if response.status_code != status.HTTP_200_OK:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {json.dumps(response.data, indent=2, default=str)}")
        return None
    
    print("✅ SUCCESS: Requisitions listed")
    
    results = response.data.get('results', response.data)
    count = len(results) if isinstance(results, list) else response.data.get('count', 0)
    
    print(f"\n📋 Total PRs: {count}")
    
    if results and isinstance(results, list):
        print(f"\n   First PR has items: {len(results[0].get('items', []))} items")
        if results[0].get('items'):
            print(f"   ✅ Items are included in list view")
        else:
            print(f"   ⚠ WARNING: No items in list view")
    
    return results


def run_all_tests():
    """Run all API endpoint tests"""
    print("\n" + "="*70)
    print(" "*15 + "PR API ENDPOINT TESTS")
    print("="*70)
    
    # Setup
    user, tenant, branch, item = setup_test_data()
    
    # Create API client and authenticate
    client = APIClient()
    client.force_authenticate(user=user)
    print(f"\n✓ API Client authenticated as: {user.username}")
    
    # Test 1: Create requisition
    pr_data = test_create_requisition(client, user, branch, item)
    if not pr_data:
        print("\n❌ OVERALL RESULT: FAILED at creation")
        sys.exit(1)
    
    pr_id = pr_data.get('id')
    items_in_create = pr_data.get('items', [])
    
    # Test 2: Get requisition by ID
    pr_retrieved, items_in_get = test_get_requisition(client, pr_id)
    if not pr_retrieved:
        print("\n❌ OVERALL RESULT: FAILED at retrieval")
        sys.exit(1)
    
    # Test 3: List requisitions
    results = test_list_requisitions(client)
    
    # Final validation
    print("\n" + "="*60)
    print("VALIDATION RESULTS")
    print("="*60)
    
    success = True
    
    print(f"\n✓ Created PR ID: {pr_id}")
    print(f"✓ Created PR Number: {pr_data.get('pr_number')}")
    
    if len(items_in_create) == 3:
        print(f"✅ Create response has correct item count: {len(items_in_create)}")
    else:
        print(f"❌ Create response item count mismatch: expected 3, got {len(items_in_create)}")
        success = False
    
    if items_in_get and len(items_in_get) == 3:
        print(f"✅ Get response has correct item count: {len(items_in_get)}")
    else:
        print(f"❌ Get response item count mismatch: expected 3, got {len(items_in_get) if items_in_get else 0}")
        success = False
    
    if items_in_get:
        # Check item fields
        first_item = items_in_get[0]
        required_fields = ['id', 'description', 'quantity', 'estimated_unit_price', 'total_price']
        missing_fields = [f for f in required_fields if f not in first_item]
        
        if not missing_fields:
            print(f"✅ All required fields present in items")
        else:
            print(f"❌ Missing fields in items: {missing_fields}")
            success = False
        
        # Verify total prices are calculated
        for idx, item in enumerate(items_in_get, 1):
            qty = float(item.get('quantity', 0))
            unit_price = float(item.get('estimated_unit_price', 0))
            total = float(item.get('total_price', 0))
            expected_total = qty * unit_price
            
            if abs(total - expected_total) < 0.01:
                print(f"✅ Item {idx} total price correct: {qty} × ${unit_price} = ${total}")
            else:
                print(f"❌ Item {idx} total price incorrect: expected ${expected_total}, got ${total}")
                success = False
    
    # Final result
    print("\n" + "="*60)
    if success:
        print("✅ ALL TESTS PASSED")
        print("="*60)
        print("\n✨ The PR API endpoints work correctly!")
        print("✨ Items are properly saved and retrieved!")
    else:
        print("❌ SOME TESTS FAILED")
        print("="*60)
        sys.exit(1)


if __name__ == '__main__':
    run_all_tests()
