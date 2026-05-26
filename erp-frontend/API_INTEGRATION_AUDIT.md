# Procurement API Integration Audit Report

## Executive Summary

This document provides a comprehensive audit of the procurement system's API integration between the frontend TypeScript interfaces and the backend Django REST API. The audit identifies mismatches, inconsistencies, and areas requiring fixes to ensure proper API contract alignment.

## Audit Date
**Date:** January 7, 2026  
**Auditor:** Kiro AI Assistant  
**Scope:** Procurement module API integration  

## Key Findings Summary

### ✅ **Well-Aligned Areas**
- Basic CRUD operations structure
- Authentication and authorization patterns
- Error handling framework
- Retry logic implementation

### ⚠️ **Critical Mismatches Found**
1. **API Endpoint URLs** - Frontend uses incorrect paths
2. **Field Name Inconsistencies** - Backend vs Frontend naming
3. **Data Type Mismatches** - Decimal handling and serialization
4. **Missing Backend Endpoints** - Frontend expects endpoints that don't exist
5. **Status Enum Misalignments** - Different status values
6. **Serializer Field Mismatches** - Missing or extra fields

---

## Detailed Audit Results

### 1. API Endpoint URL Mismatches

#### **Issue:** Incorrect Base Paths
**Frontend Expects:**
```typescript
// Purchase Orders
/procurement/purchase-orders/

// Requisitions  
/procurement/requisitions/

// GRNs
/procurement/goods-receipts/

// Returns
/procurement/returns/
```

**Backend Provides:**
```python
# From urls.py
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'requisitions', RequisitionViewSet, basename='requisition')  
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'goods-receipts', GoodsReceiptViewSet, basename='goodsreceipt')
# Missing: returns endpoint
```

**Status:** ❌ **CRITICAL** - Missing returns endpoint in backend

---

### 2. Purchase Requisition Model Mismatches

#### **Field Name Inconsistencies**

| Frontend Field | Backend Field | Status | Notes |
|----------------|---------------|---------|-------|
| `pr_number` | `pr_number` | ✅ Match | |
| `department_id` | `department` | ❌ Mismatch | Backend uses string, frontend expects ID |
| `requester_id` | `requested_by` | ❌ Mismatch | Different field names |
| `title` | ❌ Missing | ❌ Missing | Frontend has title field not in backend |
| `purpose` | `justification` | ❌ Mismatch | Different field names |
| `estimated_total` | `total_estimated_cost` | ❌ Mismatch | Different field names |

#### **Status Enum Mismatches**

**Frontend Enums:**
```typescript
export enum RequisitionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted', 
  UNDER_REVIEW = 'under_review',  // ❌ Not in backend
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CONVERTED = 'converted',        // ❌ Backend uses 'po_created'
  CANCELLED = 'cancelled'
}
```

**Backend Choices:**
```python
STATUS_CHOICES = [
    ('draft', 'Draft'),
    ('submitted', 'Submitted'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('po_created', 'PO Created'),  # ❌ Frontend uses 'converted'
    ('cancelled', 'Cancelled'),
]
```

---

### 3. Purchase Order Model Mismatches

#### **Critical Field Mismatches**

| Frontend Field | Backend Field | Status | Issue |
|----------------|---------------|---------|--------|
| `supplier_name` | ❌ Missing | ❌ Missing | Frontend expects this computed field |
| `location_name` | ❌ Missing | ❌ Missing | Frontend expects this computed field |
| `received_percentage` | `received_percentage` | ⚠️ Partial | Backend has property, not serialized field |
| `items[].total_amount` | `items[].total_price` | ❌ Mismatch | Different field names |

#### **Missing Action Endpoints**

**Frontend Expects:**
```typescript
// These methods exist in frontend service
async approvePurchaseOrder(id: number): Promise<PurchaseOrder>
async sendPurchaseOrder(id: number): Promise<PurchaseOrder>  
async cancelPurchaseOrder(id: number): Promise<PurchaseOrder>
```

**Backend Provides:**
```python
@action(detail=True, methods=['post'])
def approve(self, request, pk=None): # ✅ Exists

@action(detail=True, methods=['post'])  
def send_to_supplier(self, request, pk=None): # ✅ Exists

@action(detail=True, methods=['post'])
def cancel(self, request, pk=None): # ✅ Exists
```

**Status:** ✅ **GOOD** - Action endpoints exist

---

### 4. Goods Received Note (GRN) Model Mismatches

#### **Major Structural Differences**

**Frontend Complex Structure:**
```typescript
interface GoodsReceivedNote {
  delivery_information: DeliveryInformation;  // ❌ Complex nested object
  quality_check: QualityCheckInfo;           // ❌ Complex nested object
  batch_tracking: BatchTrackingInfo;         // ❌ Complex nested object
  overall_inspection_status: InspectionStatus; // ❌ Not in backend
}
```

**Backend Flat Structure:**
```python
class GoodsReceivedNote(models.Model):
    delivery_note_number = models.CharField()  # ✅ Flat fields
    vehicle_number = models.CharField()        # ✅ Flat fields
    driver_name = models.CharField()           # ✅ Flat fields
    quality_status = models.CharField()        # ❌ Different from frontend
```

#### **Field Mapping Issues**

| Frontend Field | Backend Field | Status | Issue |
|----------------|---------------|---------|--------|
| `grn_number` | `grn_number` | ✅ Match | |
| `received_date` | `received_date` | ✅ Match | |
| `received_time` | `received_time` | ✅ Match | |
| `delivery_information.delivery_note_number` | `delivery_note_number` | ⚠️ Structure | Nested vs flat |
| `delivery_information.vehicle_number` | `vehicle_number` | ⚠️ Structure | Nested vs flat |
| `overall_inspection_status` | ❌ Missing | ❌ Missing | Frontend field not in backend |
| `quality_status` | `quality_status` | ✅ Match | |

---

### 5. Purchase Returns - Complete Mismatch

#### **Critical Issue: Missing Backend Implementation**

**Frontend Expects Full Returns System:**
```typescript
interface PurchaseReturn {
  return_number: string;
  grn_id: number;
  return_reason_category: string;
  refund_method: string;
  items: PurchaseReturnItem[];
}
```

**Backend Status:**
- ❌ **PurchaseReturn model exists but no ViewSet**
- ❌ **No URL routing for returns**
- ❌ **No API endpoints implemented**
- ❌ **Frontend service calls will fail**

---

### 6. Data Type and Serialization Issues

#### **Decimal Field Handling**

**Backend Uses Decimal Strings:**
```python
# Backend serializes decimals as strings
subtotal = models.DecimalField(max_digits=18, decimal_places=2)
# Serialized as: "123.45"
```

**Frontend Expects:**
```typescript
// Frontend correctly expects strings
subtotal: string; // ✅ Correct
tax_amount: string; // ✅ Correct
```

**Status:** ✅ **GOOD** - Decimal handling is correct

#### **Date/DateTime Handling**

**Backend:**
```python
created_at = models.DateTimeField(auto_now_add=True)
# Serialized as: "2026-01-07T10:30:00Z"
```

**Frontend:**
```typescript
created_at: string; // ✅ Correct - ISO string format
```

**Status:** ✅ **GOOD** - Date handling is correct

---

### 7. Search and Filter Parameter Issues

#### **Query Parameter Serialization**

**Current Issue in Frontend:**
```typescript
// This causes object%Object% serialization issues
const searchParams = new URLSearchParams();
Object.entries(params).forEach(([key, value]) => {
  if (value !== null && value !== undefined) {
    searchParams.append(key, String(value)); // ❌ Converts objects to [object Object]
  }
});
```

**Backend Expects:**
```python
# Simple string parameters
status_filter = self.request.query_params.get('status')
supplier_id = self.request.query_params.get('supplier_id')
```

**Status:** ❌ **CRITICAL** - Search functionality broken

---

### 8. Authentication and Authorization

#### **Token Handling**

**Frontend Implementation:**
```typescript
const getHeaders = () => {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  return {
    'Authorization': `Bearer ${token}` // ✅ Correct format
  };
};
```

**Backend Expects:**
```python
permission_classes = [IsAuthenticated] # ✅ Standard DRF auth
```

**Status:** ✅ **GOOD** - Authentication is properly implemented

---

## Priority Fix Plan

### **Priority 1: Critical Fixes (Blocking)**

1. **Implement Missing Returns API**
   - Create `PurchaseReturnViewSet` in backend
   - Add URL routing for returns
   - Implement CRUD operations and actions

2. **Fix Search Parameter Serialization**
   - Update frontend API service to handle complex objects
   - Ensure proper URL encoding

3. **Align Status Enums**
   - Update frontend enums to match backend choices
   - Update status transition logic

### **Priority 2: High Impact Fixes**

4. **Fix Field Name Mismatches**
   - Update backend serializers to include computed fields
   - Align field naming between frontend and backend

5. **Implement Missing Computed Fields**
   - Add `supplier_name`, `location_name` to serializers
   - Add `received_percentage` to serialized output

### **Priority 3: Structure Improvements**

6. **Standardize GRN Structure**
   - Decide on flat vs nested structure
   - Update either frontend or backend to match

7. **Add Missing Validation**
   - Implement frontend validation rules
   - Add backend validation for business rules

---

## Recommended Implementation Steps

### Step 1: Backend Fixes
```python
# 1. Add PurchaseReturnViewSet
class PurchaseReturnViewSet(ScopedModelViewSet):
    serializer_class = PurchaseReturnSerializer
    # ... implementation

# 2. Update serializers with computed fields
class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    location_name = serializers.CharField(source='delivery_location.name', read_only=True)
    received_percentage = serializers.SerializerMethodField()
```

### Step 2: Frontend Fixes
```typescript
// 1. Fix search params handling
const buildQueryString = (params: Record<string, any>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, String(v)));
      } else if (typeof value === 'object') {
        searchParams.append(key, JSON.stringify(value));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });
  return searchParams.toString();
};

// 2. Update status enums
export enum RequisitionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved', 
  REJECTED = 'rejected',
  PO_CREATED = 'po_created', // ✅ Match backend
  CANCELLED = 'cancelled'
}
```

### Step 3: Integration Testing
```typescript
// Add comprehensive API integration tests
describe('Procurement API Integration', () => {
  test('Purchase Order CRUD operations', async () => {
    // Test create, read, update, delete
  });
  
  test('Status transitions work correctly', async () => {
    // Test all status changes
  });
  
  test('Search and filtering works', async () => {
    // Test query parameters
  });
});
```

---

## Conclusion

The procurement API integration has several critical mismatches that need immediate attention. The most critical issues are:

1. **Missing Returns API implementation** - Complete backend implementation needed
2. **Search parameter serialization** - Causing filter functionality to fail  
3. **Status enum misalignments** - Breaking status workflows
4. **Field name inconsistencies** - Causing data mapping issues

Once these fixes are implemented, the procurement system will have a robust and consistent API integration that supports all planned functionality.

## Next Steps

1. Implement Priority 1 fixes immediately
2. Create comprehensive integration tests
3. Update API documentation
4. Perform end-to-end testing
5. Deploy and monitor for issues

---

**Audit Status:** ❌ **CRITICAL ISSUES FOUND**  
**Recommended Action:** **IMMEDIATE FIXES REQUIRED**