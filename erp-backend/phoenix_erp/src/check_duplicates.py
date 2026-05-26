import os
import sys
import django

# Add the src directory to the Python path
sys.path.insert(0, r'D:\Users\User\Desktop\PHEONIX-ERP\erp-backend\phoenix_erp\src')
os.environ['DJANGO_SETTINGS_MODULE'] = 'phoenix_erp.settings'
django.setup()

from inventory.models import StockTransferRequest

print('Total transfer requests:', StockTransferRequest.objects.count())
pending = StockTransferRequest.objects.filter(
    status='pending', 
    item_id=1, 
    from_location_id=1, 
    to_location_id=2, 
    reference_number='REF'
)
print('Matching pending requests with REF:', pending.count())
for req in pending:
    print(f'  - ID: {req.id}, Request#: {req.request_number}')
    print(f'    Item: {req.item.name}, From: {req.from_location.name}, To: {req.to_location.name}')
    print(f'    Quantity: {req.quantity}, Unit Cost: {req.unit_cost}')
    print(f'    Reason: {req.reason}, Notes: {req.notes}')
    print(f'    Reference: {req.reference_number}')
    print()

# Also check for any with empty reference_number
empty_ref = StockTransferRequest.objects.filter(
    status='pending',
    item_id=1,
    from_location_id=1,
    to_location_id=2,
    reference_number=''
)
print('Pending requests with empty reference_number:', empty_ref.count())
