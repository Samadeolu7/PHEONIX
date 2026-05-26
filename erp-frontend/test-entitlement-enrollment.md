# Entitlement Enrollment Testing

## Quick Manual Test Steps

### Step 1: Prepare Test Data
Before testing, ensure you have:
```
- At least 1 client in the system
- At least 1 invoice for that client  
- At least 1 fee structure
- Backend API running on expected port
- Frontend running on http://localhost:3000
```

### Step 2: Test Navigation
1. Open browser and go to: `http://localhost:3000/incomes/entitlements`
2. ✅ Verify: Page loads without errors
3. ✅ Verify: "Fee Entitlements" title is visible
4. ✅ Verify: "Create New Entitlement" button is present

### Step 3: Test Create Flow
1. Click "Create New Entitlement" button
2. ✅ Verify: Form page loads (`/incomes/entitlements/create`)
3. Fill in the form with test data:
   ```
   Client ID: 1
   Invoice ID: 1
   Fee Structure ID: 1
   Payment Term Type: Minimum Deposit (select the radio button)
   Total Amount: 250000
   Minimum Required: 125000
   Academic Year: 2024-2025
   Term: 2
   ```
4. Click "Create Entitlement"
5. ✅ Verify: Success message appears
6. ✅ Verify: Redirected to entitlements list
7. ✅ Verify: New entitlement appears in the table

### Step 4: Test View Details
1. Find the created entitlement in the list
2. Click the "Eye" (view) icon
3. ✅ Verify: Detail page loads (`/incomes/entitlements/{id}/view`)
4. ✅ Verify: All information displays correctly
5. Test each tab:
   - **Overview**: Client info, fee structure, invoice details
   - **Payments**: Payment progress, summary cards
   - **Access**: Access level, service status
   - **Usage**: Usage history (if applicable)

### Step 5: Test Edit Flow
1. From entitlements list, click "Edit" icon
2. ✅ Verify: Edit form loads with existing data
3. Modify the "Minimum Required" amount
4. Click "Update Entitlement"
5. ✅ Verify: Success message appears
6. ✅ Verify: Changes are saved and visible

### Step 6: Test Payment Recording
1. Go to entitlement detail page
2. Click "Record Payment" button
3. ✅ Verify: Payment modal opens
4. Fill in payment details:
   ```
   Amount: 50000
   Payment Date: Today's date
   Payment Method: Bank Transfer
   Reference: TEST-PAY-001
   Notes: Test payment
   ```
5. Click "Record Payment"
6. ✅ Verify: Success message appears
7. ✅ Verify: Payment percentage updates
8. ✅ Verify: Access level may change

### Step 7: Test Status Management
1. On an active entitlement detail page
2. Click "Suspend" button
3. ✅ Verify: Status changes to "Suspended"
4. ✅ Verify: Access level changes to "No Access"
5. Click "Reactivate" button
6. ✅ Verify: Status changes back to "Active"

### Step 8: Test Search and Filters
1. Go back to entitlements list
2. Use search box to search for client name
3. ✅ Verify: Results are filtered correctly
4. Test status filter dropdown
5. ✅ Verify: Filtering works as expected
6. Test access level filter
7. ✅ Verify: Results match selected filter

## Browser Console Testing

Open browser console and run:

```javascript
// Load the test script
const script = document.createElement('script');
script.src = '/test-entitlement-flow.js';
document.head.appendChild(script);

// Wait a moment, then run tests
setTimeout(() => {
  runEntitlementTests();
}, 2000);
```

## API Testing with Browser Network Tab

1. Open browser Developer Tools
2. Go to Network tab
3. Perform entitlement operations
4. ✅ Verify: API calls are made to correct endpoints
5. ✅ Verify: Responses are successful (200/201 status codes)
6. ✅ Verify: Request/response data is correct

### Expected API Calls:
- `GET /api/incomes/entitlements/` - List entitlements
- `POST /api/incomes/entitlements/` - Create entitlement
- `GET /api/incomes/entitlements/{id}/` - Get entitlement details
- `PUT /api/incomes/entitlements/{id}/` - Update entitlement
- `POST /api/incomes/entitlements/{id}/record_payment/` - Record payment
- `POST /api/incomes/entitlements/{id}/suspend/` - Suspend entitlement
- `POST /api/incomes/entitlements/{id}/reactivate/` - Reactivate entitlement

## Error Testing

### Test Invalid Data:
1. Try creating entitlement with invalid client ID
2. ✅ Verify: Error message appears
3. Try negative amounts
4. ✅ Verify: Validation prevents submission

### Test Network Errors:
1. Disconnect internet/stop backend
2. Try to load entitlements
3. ✅ Verify: Error handling works gracefully

## Performance Testing

### Test with Multiple Entitlements:
1. Create 20+ entitlements
2. ✅ Verify: List loads within 3 seconds
3. ✅ Verify: Search/filter is responsive
4. ✅ Verify: Pagination works correctly

## Mobile Testing

1. Open browser developer tools
2. Switch to mobile device simulation
3. Test all flows on mobile viewport
4. ✅ Verify: Responsive design works
5. ✅ Verify: Touch interactions work
6. ✅ Verify: Forms are usable on mobile

## Accessibility Testing

1. Use keyboard only (no mouse)
2. ✅ Verify: Can navigate entire flow with Tab/Enter
3. ✅ Verify: Focus indicators are visible
4. Use screen reader (if available)
5. ✅ Verify: Content is readable by screen reader

## Common Issues and Solutions

### Issue: "Client not found" error
**Solution**: Ensure client exists in database with the ID you're using

### Issue: "Invoice not found" error  
**Solution**: Ensure invoice exists and belongs to the specified client

### Issue: Page doesn't load
**Solution**: Check browser console for JavaScript errors

### Issue: API calls failing
**Solution**: Verify backend is running and accessible

### Issue: Authentication errors
**Solution**: Ensure you're logged in with valid token

### Issue: Form validation not working
**Solution**: Check that all required fields are filled correctly

## Test Checklist

- [ ] Navigation to entitlements list works
- [ ] Create new entitlement works
- [ ] View entitlement details works  
- [ ] Edit entitlement works
- [ ] Record payment works
- [ ] Suspend/reactivate works
- [ ] Search functionality works
- [ ] Filter functionality works
- [ ] Pagination works (if applicable)
- [ ] Error handling works
- [ ] Form validation works
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] API calls successful
- [ ] Performance acceptable

## Success Criteria

✅ **All manual test steps pass**
✅ **No JavaScript errors in console**
✅ **All API calls return successful responses**
✅ **UI is responsive and accessible**
✅ **Error handling works gracefully**
✅ **Performance is acceptable (< 3 seconds load time)**

## Next Steps

After manual testing passes:
1. Run automated tests (if available)
2. Test with real data volumes
3. Perform security testing
4. Test cross-browser compatibility
5. Get user acceptance testing feedback