# Resource & Voucher Management Testing Guide

## 🧪 Manual Testing Checklist

### **Resource Management Testing**
1. **Navigate to `/newpages`** and click "Resources List"
2. **Test Resource Creation:**
   - Click "Create Resource" 
   - Fill in all required fields
   - Test validation (try submitting with missing fields)
   - Submit and verify success message
3. **Test Resource List:**
   - Verify resources appear in the list
   - Test search functionality
   - Test filtering by status
   - Test sorting by different columns
4. **Test Resource Detail:**
   - Click on a resource to view details
   - Verify all information displays correctly
   - Test edit functionality
   - Test status toggle (active/inactive)

### **Voucher Management Testing**
1. **Navigate to `/newpages`** and click "Vouchers List"
2. **Test Voucher Creation:**
   - Click "Create Voucher"
   - Select a resource from dropdown
   - Choose beneficiary type and details
   - Set expiry date (try different dates)
   - Submit and verify creation
3. **Test Voucher List:**
   - Verify vouchers appear with correct status
   - Test filtering by status and expiry
   - Test search functionality
4. **Test Voucher Detail:**
   - Click on a voucher to view details
   - Verify usage progress bar
   - Test edit functionality
   - Test cancel voucher with reason
5. **Test Expiring Vouchers Dashboard:**
   - Navigate to "Expiring Vouchers"
   - Test different time filters (1, 3, 7, 14, 30 days)
   - Verify vouchers are grouped by urgency
   - Test actions (view, edit, cancel)

### **Resource Consumption Testing**
1. **Navigate to "Record New Consumption"**
2. **Test Prepaid Flow:**
   - Select "Prepaid" payment flow
   - Choose a resource (should load from real API)
   - Select a voucher (should load from real API)
   - Fill consumption details
   - Submit and verify
3. **Test Postpaid Flow:**
   - Select "Postpaid" payment flow
   - Choose resource and supplier
   - Fill consumption details
   - Submit and verify

## 🔍 API Integration Verification

### **Check Network Tab:**
1. Open browser DevTools → Network tab
2. Navigate through the new pages
3. Verify API calls are made to correct endpoints:
   - `/api/expenses/resources/` 
   - `/api/expenses/prepaid-vouchers/`
   - `/api/expenses/resource-consumption/`

### **Expected API Endpoints:**
- ✅ GET `/api/expenses/resources/` - List resources
- ✅ POST `/api/expenses/resources/` - Create resource
- ✅ GET `/api/expenses/resources/{id}/` - Get resource detail
- ✅ PUT `/api/expenses/resources/{id}/` - Update resource
- ✅ GET `/api/expenses/prepaid-vouchers/` - List vouchers
- ✅ POST `/api/expenses/prepaid-vouchers/` - Create voucher
- ✅ GET `/api/expenses/prepaid-vouchers/{id}/` - Get voucher detail
- ✅ PUT `/api/expenses/prepaid-vouchers/{id}/` - Update voucher
- ✅ POST `/api/expenses/prepaid-vouchers/{id}/cancel/` - Cancel voucher
- ✅ GET `/api/expenses/prepaid-vouchers/expiring/` - Get expiring vouchers

## 🐛 Common Issues to Check

### **If Resources Don't Load:**
- Check if backend endpoint `/api/expenses/resources/` exists
- Verify authentication tokens are valid
- Check browser console for errors

### **If Vouchers Don't Load:**
- Check if backend endpoint `/api/expenses/prepaid-vouchers/` exists
- Verify resource relationships are properly configured
- Check for CORS issues

### **If Forms Don't Submit:**
- Check validation errors in browser console
- Verify all required fields are filled
- Check network tab for API response errors

## 📊 Success Criteria

### **✅ Resource Management:**
- [ ] Can create new resources
- [ ] Can view resource list with filtering
- [ ] Can view individual resource details
- [ ] Can edit existing resources
- [ ] Can toggle resource status

### **✅ Voucher Management:**
- [ ] Can create new vouchers
- [ ] Can view voucher list with status filtering
- [ ] Can view individual voucher details with usage progress
- [ ] Can edit existing vouchers
- [ ] Can cancel vouchers with reason
- [ ] Expiring vouchers dashboard shows correct alerts

### **✅ Integration:**
- [ ] Resource consumption form uses real resource/voucher data
- [ ] All API calls return expected data
- [ ] Error handling works properly
- [ ] Loading states display correctly
- [ ] Navigation between pages works smoothly

## 🎯 Performance Checks

### **Page Load Times:**
- [ ] Resource list loads within 2 seconds
- [ ] Voucher list loads within 2 seconds
- [ ] Detail pages load within 1 second
- [ ] Form submissions complete within 3 seconds

### **User Experience:**
- [ ] No broken links or 404 errors
- [ ] Consistent styling across all pages
- [ ] Responsive design works on mobile
- [ ] Loading spinners appear during API calls
- [ ] Success/error messages display properly