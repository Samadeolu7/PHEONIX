# Entitlement Flow Testing Guide

This guide provides comprehensive testing instructions for the entitlement management system.

## Prerequisites

Before testing, ensure you have:
1. Backend API running with entitlement endpoints
2. Frontend development server running
3. Test data: clients, invoices, and fee structures
4. Valid authentication token

## Manual Testing Flow

### 1. Navigation Testing

#### Test accessing entitlements list:
```
1. Navigate to: http://localhost:3000/incomes/entitlements
2. Verify: Page loads without errors
3. Verify: Header shows "Fee Entitlements"
4. Verify: "Create New Entitlement" button is visible
5. Verify: Table headers are displayed correctly
```

### 2. Create Entitlement Flow

#### Test creating a new entitlement:
```
1. Click "Create New Entitlement" button
2. Navigate to: /incomes/entitlements/create
3. Fill in the form:
   - Client ID: [existing client ID]
   - Invoice ID: [existing invoice ID]  
   - Fee Structure ID: [existing fee structure ID]
   - Payment Term Type: Select "Minimum Deposit"
   - Total Amount: 250000
   - Minimum Required: 125000
   - Academic Year: 2024-2025
   - Term: 2
   - Access Rules: Configure as needed
4. Click "Create Entitlement"
5. Verify: Success message appears
6. Verify: Redirected to entitlements list
7. Verify: New entitlement appears in the list
```

### 3. View Entitlement Details

#### Test viewing entitlement details:
```
1. From entitlements list, click the "Eye" icon on any entitlement
2. Navigate to: /incomes/entitlements/{id}/view
3. Verify: All tabs are accessible (Overview, Payments, Access, Usage)
4. Verify: Status cards show correct information
5. Verify: Payment progress bar displays correctly
6. Verify: Access level badge shows current status
```

#### Test each tab:
```
Overview Tab:
- Client information displays correctly
- Fee structure information is shown
- Invoice information is present
- Validity period is displayed
- Status and access information is correct

Payments Tab:
- Payment progress bar shows correct percentage
- Payment summary cards display amounts correctly
- Payment history note is shown

Access Tab:
- Current access level is displayed
- Payment percentage is shown
- Access rules information is present
- Service access status is displayed
- Access level history shows activity logs

Usage Tab:
- For prepaid entitlements: usage summary is shown
- Usage progress bar displays correctly
- Recent usage activity table is populated
- For non-prepaid: appropriate message is shown
```

### 4. Edit Entitlement Flow

#### Test editing an entitlement:
```
1. From entitlements list, click the "Edit" icon
2. Navigate to: /incomes/entitlements/{id}/edit
3. Verify: Form is pre-populated with existing data
4. Modify some fields (e.g., minimum required amount)
5. Click "Update Entitlement"
6. Verify: Success message appears
7. Verify: Redirected to entitlements list
8. Verify: Changes are reflected in the list
```

### 5. Payment Recording Flow

#### Test recording a payment:
```
1. From entitlements list or detail page, click "Record Payment"
2. Verify: UnifiedPaymentModal opens
3. Fill in payment details:
   - Amount: [valid amount <= balance]
   - Payment Date: [current date]
   - Payment Method: Select method
   - Reference: [payment reference]
   - Notes: [optional notes]
4. Click "Record Payment"
5. Verify: Success message appears
6. Verify: Modal closes
7. Verify: Entitlement data refreshes
8. Verify: Payment percentage updates
9. Verify: Access level may change based on new percentage
```

### 6. Status Management Flow

#### Test suspending an entitlement:
```
1. Navigate to an active entitlement detail page
2. Click "Suspend" button
3. Verify: Success message appears
4. Verify: Status changes to "Suspended"
5. Verify: Access level changes to "No Access"
6. Verify: "Reactivate" button appears
```

#### Test reactivating an entitlement:
```
1. On a suspended entitlement, click "Reactivate"
2. Verify: Success message appears
3. Verify: Status changes back to "Active"
4. Verify: Access level updates based on payment percentage
5. Verify: "Suspend" button appears again
```

### 7. Search and Filter Testing

#### Test search functionality:
```
1. In the search box, enter a client name
2. Press Enter or click "Apply Filters"
3. Verify: Results are filtered correctly
4. Clear search and verify all results return
```

#### Test status filter:
```
1. Select different status options from dropdown
2. Click "Apply Filters"
3. Verify: Results match selected status
4. Test each status: Pending, Active, Suspended, Completed, Cancelled
```

#### Test access level filter:
```
1. Select different access levels from dropdown
2. Click "Apply Filters"
3. Verify: Results match selected access level
4. Test each level: No Access, Partial Access, Full Access
```

### 8. Pagination Testing

#### Test pagination (if more than 20 entitlements):
```
1. Verify: Pagination controls appear at bottom
2. Click "Next" button
3. Verify: Next page loads correctly
4. Click "Previous" button
5. Verify: Previous page loads correctly
6. Click specific page numbers
7. Verify: Correct page loads
```

## Error Handling Testing

### 1. Form Validation Testing

#### Test create/edit form validation:
```
1. Try submitting form with empty required fields
2. Verify: Validation errors appear
3. Enter invalid data (negative amounts, etc.)
4. Verify: Appropriate error messages show
5. Enter valid data and verify successful submission
```

### 2. API Error Testing

#### Test network errors:
```
1. Disconnect from internet or stop backend
2. Try to load entitlements list
3. Verify: Error message appears
4. Try to create/edit entitlement
5. Verify: Error handling works correctly
```

### 3. Permission Testing

#### Test unauthorized access:
```
1. Test with invalid/expired token
2. Verify: Proper error handling
3. Verify: Redirect to login if needed
```

## Performance Testing

### 1. Load Testing

#### Test with large datasets:
```
1. Create multiple entitlements (50+)
2. Verify: List loads within reasonable time
3. Verify: Search/filter performance is acceptable
4. Verify: Detail page loads quickly
```

### 2. Memory Testing

#### Test for memory leaks:
```
1. Navigate between pages multiple times
2. Create/edit/view multiple entitlements
3. Monitor browser memory usage
4. Verify: No significant memory leaks
```

## Automated Testing

### 1. Unit Tests

Create unit tests for:
- EntitlementsList component
- EntitlementDetail component  
- EntitlementForm component
- entitlementService functions

### 2. Integration Tests

Create integration tests for:
- Complete entitlement creation flow
- Payment recording flow
- Status management flow
- Search and filter functionality

### 3. E2E Tests

Create end-to-end tests for:
- Full entitlement lifecycle
- User workflows from list to detail to edit
- Payment recording integration

## Test Data Requirements

### Required Test Data:

```json
{
  "clients": [
    {
      "id": 1,
      "full_name": "John Doe",
      "email": "john.doe@example.com"
    }
  ],
  "invoices": [
    {
      "id": 1,
      "invoice_number": "INV-20250201-001",
      "client": 1,
      "amount": "250000.00",
      "status": "draft"
    }
  ],
  "fee_structures": [
    {
      "id": 1,
      "name": "Grade 10 - Term 2 Fees",
      "base_amount": "250000.00"
    }
  ]
}
```

## Common Issues and Solutions

### Issue: "Client ID not found"
**Solution**: Ensure the client exists in the system before creating entitlement

### Issue: "Invoice ID not found"  
**Solution**: Ensure the invoice exists and belongs to the specified client

### Issue: "Fee Structure ID not found"
**Solution**: Ensure the fee structure exists and is active

### Issue: Payment modal not opening
**Solution**: Check that entitlement has a balance > 0

### Issue: Access level not updating after payment
**Solution**: Verify payment was recorded successfully and refresh the page

## Browser Compatibility Testing

Test on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Mobile Responsiveness Testing

Test on:
- Mobile devices (iOS/Android)
- Tablet devices
- Different screen sizes
- Portrait/landscape orientations

## Accessibility Testing

Verify:
- Keyboard navigation works
- Screen reader compatibility
- Color contrast meets standards
- Focus indicators are visible
- ARIA labels are present

## Security Testing

Test:
- Input sanitization
- XSS prevention
- CSRF protection
- Authentication/authorization
- Data validation

## Reporting Issues

When reporting issues, include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser/device information
5. Screenshots/videos if applicable
6. Console errors
7. Network request details

## Test Checklist

- [ ] Navigation works correctly
- [ ] Create entitlement flow works
- [ ] View entitlement details works
- [ ] Edit entitlement flow works
- [ ] Payment recording works
- [ ] Status management works
- [ ] Search and filters work
- [ ] Pagination works
- [ ] Error handling works
- [ ] Form validation works
- [ ] Performance is acceptable
- [ ] Mobile responsive
- [ ] Accessible
- [ ] Secure
- [ ] Cross-browser compatible

## Conclusion

This comprehensive testing approach ensures the entitlement flow works correctly across all scenarios and provides a good user experience. Regular testing should be performed after any changes to the entitlement system.