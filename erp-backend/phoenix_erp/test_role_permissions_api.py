"""
Quick test script to verify the Role Permissions API is working
Run this after seeding actions:
python test_role_permissions_api.py
"""
import requests
import json

BASE_URL = 'http://localhost:8000/api/pages'

# You'll need a valid auth token - get it from your login
# For testing, you can get it from the browser's localStorage or network tab
AUTH_TOKEN = 'your-auth-token-here'

headers = {
    'Authorization': f'Bearer {AUTH_TOKEN}',
    'Content-Type': 'application/json'
}

def test_matrix_endpoint():
    """Test the permission matrix endpoint"""
    print("\n" + "="*60)
    print("Testing Permission Matrix Endpoint")
    print("="*60)
    
    url = f'{BASE_URL}/role-action-permissions/matrix/'
    print(f"\nGET {url}")
    
    try:
        response = requests.get(url, headers=headers)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                matrix = data.get('data', {})
                
                print(f"\n✓ Success!")
                print(f"\nModules: {len(matrix.get('modules', []))}")
                for module in matrix.get('modules', []):
                    print(f"  - {module['name']} ({module['code']})")
                    for page in module.get('pages', []):
                        print(f"    └─ {page['title']}: {len(page['actions'])} actions")
                
                print(f"\nRoles: {len(matrix.get('roles', []))}")
                for role in matrix.get('roles', []):
                    print(f"  - {role['name']}")
                
                print(f"\nPermissions: {len(matrix.get('permissions', {}))} mappings")
                
                return True
            else:
                print(f"\n✗ Error: {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"\n✗ HTTP Error {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"\n✗ Exception: {e}")
        return False


def test_bulk_update():
    """Test bulk update endpoint"""
    print("\n" + "="*60)
    print("Testing Bulk Update Endpoint")
    print("="*60)
    
    # First get the matrix to get role and action IDs
    matrix_url = f'{BASE_URL}/role-action-permissions/matrix/'
    response = requests.get(matrix_url, headers=headers)
    
    if response.status_code != 200:
        print("Cannot test bulk update - matrix endpoint failed")
        return False
    
    matrix = response.json().get('data', {})
    roles = matrix.get('roles', [])
    modules = matrix.get('modules', [])
    
    if not roles or not modules:
        print("Cannot test bulk update - no roles or modules found")
        return False
    
    # Get first role and first action
    role_id = roles[0]['id']
    first_module = modules[0]
    
    if not first_module.get('pages') or not first_module['pages'][0].get('actions'):
        print("Cannot test bulk update - no actions found")
        return False
    
    action_id = first_module['pages'][0]['actions'][0]['id']
    
    # Create test update
    test_update = {
        'updates': [
            {
                'role_id': role_id,
                'action_id': action_id,
                'can_view': True,
                'can_create': True,
                'can_edit': False,
                'can_delete': False
            }
        ]
    }
    
    url = f'{BASE_URL}/role-action-permissions/bulk-update/'
    print(f"\nPOST {url}")
    print(f"Data: {json.dumps(test_update, indent=2)}")
    
    try:
        response = requests.post(url, headers=headers, json=test_update)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✓ Success!")
            print(f"Message: {data.get('message')}")
            print(f"Created: {data.get('created')}")
            print(f"Updated: {data.get('updated')}")
            return True
        else:
            print(f"\n✗ HTTP Error {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"\n✗ Exception: {e}")
        return False


def main():
    print("\n" + "="*60)
    print("Role Permissions API Test Suite")
    print("="*60)
    print("\nNote: You need to set a valid AUTH_TOKEN in this script")
    print("Get it from your browser's localStorage or network tab after logging in")
    
    if AUTH_TOKEN == 'your-auth-token-here':
        print("\n✗ Please set AUTH_TOKEN before running this test!")
        print("\nAlternatively, you can test using curl:")
        print(f"\ncurl -H 'Authorization: Bearer YOUR_TOKEN' \\")
        print(f"  {BASE_URL}/role-action-permissions/matrix/")
        return
    
    # Run tests
    results = []
    
    results.append(("Matrix Endpoint", test_matrix_endpoint()))
    results.append(("Bulk Update Endpoint", test_bulk_update()))
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status} - {test_name}")
    
    total = len(results)
    passed = sum(1 for _, p in results if p)
    print(f"\nPassed: {passed}/{total}")


if __name__ == '__main__':
    main()
