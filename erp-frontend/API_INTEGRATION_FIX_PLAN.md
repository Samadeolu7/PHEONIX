# Procurement API Integration Fix Plan

## Overview

This document provides a detailed implementation plan to fix the critical API integration issues identified in the audit. The fixes are prioritized by impact and dependencies.

## Fix Implementation Plan

### Phase 1: Critical Backend Fixes (Immediate)

#### Fix 1.1: Implement Missing Purchase Returns API

**Backend Changes Required:**

1. **Add PurchaseReturnViewSet to views.py**
```python
class PurchaseReturnViewSet(ScopedModelViewSet):
    """
    API endpoint for purchase returns
    """
    serializer_class = PurchaseReturnSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return PurchaseReturn.objects.filter(
            owner=self.request.user.owner,
            branch=self.request.user.branch
        ).select_related('supplier', 'grn')
    
    @transaction.atomic
    def perform_create(self, serializer):
        """Create return"""
        purchase_return = serializer.save(
            owner=self.request.user.owner,
            branch=self.request.user.branch,
            created_by=self.request.user
        )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve purchase return"""
        purchase_return = self.get_object()
        
        purchase_return.status = 'approved'
        purchase_return.approved_by = request.user
        purchase_return.approved_at = timezone.now()
        purchase_return.save()
        
        return Response(self.get_serializer(purchase_return).data)
    
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Process return - reduce inventory and create credit"""
        purchase_return = self.get_object()
        
        if purchase_return.is_posted:
            return Response(
                {'error': 'Return already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Implementation for posting return
        # ... (inventory reduction and accounting entries)
        
        return Response(self.get_serializer(purchase_return).data)
```

2. **Update urls.py to include returns**
```python
router.register(r'returns', PurchaseReturnViewSet, basename='purchasereturn')
```

3. **Update PurchaseReturnSerializer**
```python
class PurchaseReturnSerializer(serializers.ModelSerializer):
    """Purchase return serializer with proper field mapping"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    grn_number = serializers.CharField(source='grn.grn_number', read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', 
        read_only=True
    )
    
    class Meta:
        model = PurchaseReturn
        fields = [
            'id', 'return_number', 'grn', 'grn_number',
            'supplier', 'supplier_name', 'return_date',
            'return_reason', 'status', 'total_amount',
            'refund_method', 'refund_received', 'refund_date',
            'is_posted', 'posted_at', 'notes', 'items',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'return_number', 'is_posted', 'posted_at',
            'created_by', 'created_at', 'updated_at'
        ]
```

#### Fix 1.2: Update Backend Serializers with Missing Fields

**Add computed fields to existing serializers:**

```python
# Update PurchaseOrderSerializer
class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    location_name = serializers.CharField(
        source='delivery_location.name', 
        read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    received_percentage = serializers.SerializerMethodField()
    
    def get_received_percentage(self, obj):
        return obj.received_percentage
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'requisition', 'selected_quote',
            'supplier', 'supplier_name', 'order_date',
            'expected_delivery_date', 'delivery_date',
            'delivery_location', 'location_name',
            'contact_person', 'contact_phone', 'contact_email',
            'payment_terms', 'custom_payment_terms', 'status',
            'subtotal', 'tax_amount', 'shipping_cost', 'discount',
            'total_amount', 'requires_approval', 'approved_by',
            'approved_by_name', 'approved_at', 'acknowledged_at',
            'supplier_po_number', 'notes', 'received_percentage',
            'created_at', 'updated_at'
        ]

# Update PurchaseRequisitionSerializer  
class PurchaseRequisitionSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(
        source='requested_by.get_full_name',
        read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    department_name = serializers.CharField(
        source='department', 
        read_only=True
    )
    
    class Meta:
        model = PurchaseRequisition
        fields = [
            'id', 'pr_number', 'requested_by', 'requested_by_name',
            'department', 'department_name', 'request_date', 'required_by_date',
            'purpose', 'status', 'approved_by', 'approved_by_name',
            'approved_at', 'rejection_reason', 'estimated_total',
            'notes', 'items', 'created_at', 'updated_at'
        ]
```

### Phase 2: Frontend API Service Fixes

#### Fix 2.1: Update Search Parameter Handling

**Replace current parameter serialization:**

```typescript
// src/services/api.ts - Enhanced parameter handling
const buildQueryString = (params: Record<string, any>): string => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        // Handle arrays (e.g., status filters)
        value.forEach(v => searchParams.append(key, String(v)));
      } else if (typeof value === 'object' && value instanceof Date) {
        // Handle dates
        searchParams.append(key, value.toISOString().split('T')[0]);
      } else if (typeof value === 'object') {
        // Handle complex objects by flattening
        Object.entries(value).forEach(([subKey, subValue]) => {
          if (subValue !== null && subValue !== undefined) {
            searchParams.append(`${key}__${subKey}`, String(subValue));
          }
        });
      } else {
        searchParams.append(key, String(value));
      }
    }
  });
  
  return searchParams.toString();
};

export const api = {
  get: async (url: string, params?: Record<string, any>) => {
    let requestUrl = url;

    if (params) {
      const queryString = buildQueryString(params);
      if (queryString) {
        requestUrl += `?${queryString}`;
      }
    }

    const response = await fetchWithAuth(requestUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  // ... rest of api methods
};
```

#### Fix 2.2: Update Frontend Types to Match Backend

**Update procurement types:**

```typescript
// src/types/procurement.ts - Align with backend

// Update RequisitionStatus to match backend
export enum RequisitionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PO_CREATED = 'po_created', // ✅ Match backend
  CANCELLED = 'cancelled'
}

// Update PurchaseRequisition interface
export interface PurchaseRequisition {
  id?: number;
  pr_number: string;
  requested_by: number;
  requested_by_name: string; // ✅ Add computed field
  department: string; // ✅ Match backend (string, not ID)
  department_name?: string; // ✅ Add computed field
  request_date: string;
  required_by_date: string;
  purpose: string; // ✅ Match backend field name
  status: RequisitionStatus;
  approved_by?: number;
  approved_by_name?: string; // ✅ Add computed field
  approved_at?: string;
  rejection_reason?: string;
  estimated_total: string; // ✅ Match backend field name
  notes?: string;
  items: RequisitionItem[];
  created_at: string;
  updated_at: string;
}

// Update PurchaseOrder interface
export interface PurchaseOrder {
  id: number;
  po_number: string;
  requisition?: number;
  selected_quote?: number;
  supplier: number;
  supplier_name: string; // ✅ Add computed field
  order_date: string;
  expected_delivery_date?: string;
  delivery_date?: string;
  delivery_location: number;
  location_name: string; // ✅ Add computed field
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  custom_payment_terms?: string;
  status: 'draft' | 'submitted' | 'approved' | 'sent' | 'acknowledged' | 'partially_received' | 'received' | 'cancelled';
  subtotal: string;
  tax_amount: string;
  shipping_cost: string;
  discount: string;
  total_amount: string;
  requires_approval: boolean;
  approved_by?: number;
  approved_by_name?: string; // ✅ Add computed field
  approved_at?: string;
  acknowledged_at?: string;
  supplier_po_number?: string;
  notes?: string;
  received_percentage: string; // ✅ Add computed field
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

// Update GRN to match backend flat structure
export interface GoodsReceivedNote {
  id?: number;
  grn_number: string;
  purchase_order?: number;
  po_number?: string; // ✅ Add computed field
  supplier: number;
  supplier_name: string; // ✅ Add computed field
  received_date: string;
  received_time: string;
  received_location: number;
  location_name: string; // ✅ Add computed field
  received_by: number;
  received_by_name: string; // ✅ Add computed field
  
  // Flatten delivery information
  delivery_note_number?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_phone?: string;
  
  // Supplier invoice details
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  supplier_invoice_amount?: string;
  
  // Quality control
  quality_status: 'pending' | 'passed' | 'failed' | 'partial';
  inspected_by?: number;
  inspection_notes?: string;
  
  total_amount: string;
  is_posted: boolean;
  posted_at?: string;
  posted_by?: number;
  accounts_payable?: number;
  notes?: string;
  
  // Attachments
  delivery_note_attachment?: string;
  photos: string[]; // Array of photo URLs
  
  items: GRNItem[];
  created_at: string;
  updated_at: string;
}

// Add PurchaseReturn interface to match backend
export interface PurchaseReturn {
  id?: number;
  return_number: string;
  grn: number;
  grn_number: string; // ✅ Computed field
  supplier: number;
  supplier_name: string; // ✅ Computed field
  return_date: string;
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  status: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
  total_amount: string;
  refund_method: 'credit_note' | 'cash' | 'replacement';
  refund_received: boolean;
  refund_date?: string;
  is_posted: boolean;
  posted_at?: string;
  notes?: string;
  items: PurchaseReturnItem[];
  created_by: number;
  created_by_name: string; // ✅ Computed field
  created_at: string;
  updated_at: string;
}

export interface PurchaseReturnItem {
  id?: number;
  purchase_return: number;
  grn_item: number;
  item: number;
  quantity_returned: string; // ✅ Decimal string
  unit_cost: string; // ✅ Decimal string
  total_cost: string; // ✅ Decimal string
  reason: string;
}
```

#### Fix 2.3: Update Procurement Service Methods

**Fix service method signatures and endpoints:**

```typescript
// src/services/procurementService.ts - Updated methods

class ProcurementService {
  // Fix Purchase Requisition methods
  async getPurchaseRequisitions(params?: {
    search?: string;
    status?: string;
    department?: string; // ✅ Changed from department_id
    requested_by?: number; // ✅ Changed from requester_id
    date_from?: string;
    date_to?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<PurchaseRequisition>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/requisitions/', params),
      'fetch purchase requisitions'
    );
  }

  // Fix Purchase Order methods - endpoints are correct
  async getPurchaseOrders(params?: {
    search?: string;
    status?: string;
    supplier_id?: number; // ✅ Keep as supplier_id (backend expects this)
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<PurchaseOrder>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/purchase-orders/', params),
      'fetch purchase orders'
    );
  }

  // Fix GRN methods - endpoints are correct
  async getGRNs(params?: {
    search?: string;
    quality_status?: string; // ✅ Changed from status
    supplier_id?: number;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<GoodsReceivedNote>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/goods-receipts/', params),
      'fetch goods received notes'
    );
  }

  // Add Purchase Returns methods (new)
  async getPurchaseReturns(params?: {
    search?: string;
    status?: string;
    supplier_id?: number;
    return_reason?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<PurchaseReturn>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/returns/', params),
      'fetch purchase returns'
    );
  }

  async getPurchaseReturn(id: number): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/returns/${id}/`),
      `fetch purchase return ${id}`
    );
  }

  async createPurchaseReturn(data: CreatePurchaseReturnData): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/returns/', data),
      'create purchase return'
    );
  }

  async updatePurchaseReturn(id: number, data: Partial<CreatePurchaseReturnData>): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/returns/${id}/`, data),
      `update purchase return ${id}`
    );
  }

  async deletePurchaseReturn(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/returns/${id}/`),
      `delete purchase return ${id}`
    );
  }

  // Purchase Return Actions
  async approvePurchaseReturn(id: number): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/returns/${id}/approve/`, {}),
      `approve purchase return ${id}`
    );
  }

  async processPurchaseReturn(id: number): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/returns/${id}/process/`, {}),
      `process purchase return ${id}`
    );
  }
}
```

### Phase 3: Integration Testing

#### Fix 3.1: Create API Integration Tests

```typescript
// src/services/__tests__/procurementService.integration.test.ts

describe('Procurement API Integration Tests', () => {
  beforeEach(() => {
    // Setup test environment
    jest.clearAllMocks();
  });

  describe('Purchase Requisitions', () => {
    test('should fetch requisitions with correct parameters', async () => {
      const mockResponse = {
        count: 1,
        results: [{
          id: 1,
          pr_number: 'PR-001',
          requested_by: 1,
          requested_by_name: 'John Doe',
          department: 'IT',
          status: 'draft'
        }]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const service = new ProcurementService();
      const result = await service.getPurchaseRequisitions({
        status: 'draft',
        department: 'IT'
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/procurement/requisitions/?status=draft&department=IT'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    test('should handle status transitions correctly', async () => {
      // Test requisition approval
      const mockRequisition = {
        id: 1,
        status: 'approved',
        approved_by: 1,
        approved_by_name: 'Manager'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRequisition)
      });

      const service = new ProcurementService();
      const result = await service.approveRequisition(1, {
        comments: 'Approved',
        action: 'approve'
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/procurement/requisitions/1/approve/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            comments: 'Approved',
            action: 'approve'
          })
        })
      );
    });
  });

  describe('Purchase Orders', () => {
    test('should create PO with correct data structure', async () => {
      const createData = {
        supplier: 1,
        delivery_location: 1,
        payment_terms: 'net_30' as const,
        items: [{
          item_id: 1,
          quantity: 10,
          unit_price: '25.50'
        }]
      };

      const mockResponse = {
        id: 1,
        po_number: 'PO-001',
        supplier: 1,
        supplier_name: 'Test Supplier',
        ...createData
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const service = new ProcurementService();
      const result = await service.createPurchaseOrder(createData);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/procurement/purchase-orders/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(createData)
        })
      );
    });
  });

  describe('Purchase Returns', () => {
    test('should create return with correct data', async () => {
      const createData = {
        grn: 1,
        return_date: '2026-01-07',
        return_reason: 'damaged' as const,
        refund_method: 'credit_note' as const,
        items: [{
          grn_item: 1,
          quantity_returned: '5',
          unit_cost: '25.50',
          reason: 'Damaged on arrival'
        }]
      };

      const mockResponse = {
        id: 1,
        return_number: 'RET-001',
        ...createData
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const service = new ProcurementService();
      const result = await service.createPurchaseReturn(createData);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 errors correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      const service = new ProcurementService();
      
      await expect(service.getPurchaseOrder(999)).rejects.toThrow('HTTP 404');
    });

    test('should retry on 500 errors', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ 
          ok: true, 
          json: () => Promise.resolve({ id: 1 })
        });

      const service = new ProcurementService();
      const result = await service.getPurchaseOrder(1);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ id: 1 });
    });
  });
});
```

### Phase 4: Validation and Testing

#### Fix 4.1: Update Component Integration

**Update components to use corrected types:**

```typescript
// Example: Update PurchaseOrderListPage
import { PurchaseOrder, PurchaseOrderFilters } from '../types/procurement';

const PurchaseOrderListPage: React.FC = () => {
  const [filters, setFilters] = useState<PurchaseOrderFilters>({
    status: undefined,
    supplier_id: undefined, // ✅ Use correct field name
    search: ''
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: () => procurementService.getPurchaseOrders(filters)
  });

  // Component implementation...
};
```

#### Fix 4.2: Add Runtime Validation

```typescript
// src/utils/apiValidation.ts - Runtime validation helpers

export const validateApiResponse = <T>(
  data: any, 
  expectedFields: (keyof T)[]
): data is T => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return expectedFields.every(field => 
    data.hasOwnProperty(field)
  );
};

export const validatePurchaseOrder = (data: any): data is PurchaseOrder => {
  return validateApiResponse<PurchaseOrder>(data, [
    'id', 'po_number', 'supplier', 'supplier_name', 
    'status', 'total_amount', 'created_at'
  ]);
};

// Use in service methods
async getPurchaseOrder(id: number): Promise<PurchaseOrder> {
  const data = await api.get(`/procurement/purchase-orders/${id}/`);
  
  if (!validatePurchaseOrder(data)) {
    throw new Error('Invalid purchase order data received from API');
  }
  
  return data;
}
```

## Implementation Timeline

### Week 1: Backend Fixes
- [ ] Day 1-2: Implement PurchaseReturnViewSet
- [ ] Day 3-4: Update serializers with computed fields  
- [ ] Day 5: Add URL routing and test endpoints

### Week 2: Frontend Fixes
- [ ] Day 1-2: Fix search parameter handling
- [ ] Day 3-4: Update TypeScript interfaces
- [ ] Day 5: Update service methods

### Week 3: Testing and Validation
- [ ] Day 1-3: Create integration tests
- [ ] Day 4-5: End-to-end testing and bug fixes

### Week 4: Deployment and Monitoring
- [ ] Day 1-2: Deploy fixes to staging
- [ ] Day 3-4: Production deployment
- [ ] Day 5: Monitor and address any issues

## Success Criteria

✅ **All API endpoints return expected data structures**  
✅ **Search and filtering functionality works correctly**  
✅ **Status transitions work as expected**  
✅ **Purchase returns system is fully functional**  
✅ **No more object%Object% serialization issues**  
✅ **All integration tests pass**  
✅ **Frontend components display data correctly**

## Risk Mitigation

1. **Backup current working functionality** before making changes
2. **Implement changes incrementally** with testing at each step
3. **Use feature flags** to enable/disable new functionality
4. **Monitor error rates** during deployment
5. **Have rollback plan** ready if issues arise

This fix plan addresses all critical API integration issues and provides a clear path to a fully functional procurement system.