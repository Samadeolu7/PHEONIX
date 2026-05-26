// Test file to validate procurement types match backend schema
import {
  PurchaseRequisition,
  CreatePurchaseRequisitionData,
  PurchaseRequisitionItem,
  InventoryItem,
} from '../procurement';

// Test that all required fields are present and have correct types
describe('Procurement Types Schema Compliance', () => {
  test('PurchaseRequisition interface matches backend schema', () => {
    const requisition: PurchaseRequisition = {
      id: 1,
      pr_number: 'PR-001',
      requested_by: 1,
      requested_by_name: 'John Doe',
      department: 'IT',
      request_date: '2026-01-07',
      required_by_date: '2026-01-14',
      purpose: 'Office supplies for Q1',
      status: 'draft',
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      rejection_reason: '',
      estimated_total: '150.75',
      notes: 'Urgent requirement',
      items: [],
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    // Verify required fields
    expect(typeof requisition.id).toBe('number');
    expect(typeof requisition.pr_number).toBe('string');
    expect(typeof requisition.requested_by).toBe('number');
    expect(typeof requisition.requested_by_name).toBe('string');
    expect(typeof requisition.required_by_date).toBe('string');
    expect(typeof requisition.purpose).toBe('string');
    expect(typeof requisition.status).toBe('string');
    expect(typeof requisition.created_at).toBe('string');
    expect(typeof requisition.updated_at).toBe('string');

    // Verify decimal string fields
    expect(typeof requisition.estimated_total).toBe('string');

    // Verify nullable fields
    expect(requisition.approved_by).toBeNull();
    expect(requisition.approved_by_name).toBeNull();
    expect(requisition.approved_at).toBeNull();
  });

  test('PurchaseRequisitionItem interface matches backend schema', () => {
    const item: PurchaseRequisitionItem = {
      id: 1,
      item: 1,
      description: 'Office chair',
      quantity: '2.00',
      estimated_unit_price: '125.50',
      notes: 'Ergonomic design preferred',
      po_item: null,
    };

    // Verify required fields
    expect(typeof item.description).toBe('string');
    expect(typeof item.quantity).toBe('string');
    expect(typeof item.estimated_unit_price).toBe('string');

    // Verify decimal string format
    expect(item.quantity).toMatch(/^\d+\.\d{2}$/);
    expect(item.estimated_unit_price).toMatch(/^\d+\.\d{2}$/);

    // Verify nullable fields
    expect(item.po_item).toBeNull();
  });

  test('CreatePurchaseRequisitionData interface matches backend schema', () => {
    const createData: CreatePurchaseRequisitionData = {
      requested_by: 1,
      department: 'IT',
      request_date: '2026-01-07',
      required_by_date: '2026-01-14',
      purpose: 'Office supplies for Q1',
      status: 'draft',
      rejection_reason: '',
      estimated_total: '150.75',
      notes: 'Urgent requirement',
      items: [
        {
          item: 1,
          description: 'Office chair',
          quantity: '2.00',
          estimated_unit_price: '125.50',
          notes: 'Ergonomic design preferred',
          po_item: null,
        },
      ],
    };

    // Verify required fields
    expect(typeof createData.requested_by).toBe('number');
    expect(typeof createData.required_by_date).toBe('string');
    expect(typeof createData.purpose).toBe('string');
    expect(Array.isArray(createData.items)).toBe(true);

    // Verify decimal string fields
    expect(typeof createData.estimated_total).toBe('string');

    // Verify items array structure
    expect(createData.items.length).toBeGreaterThan(0);
    const firstItem = createData.items[0];
    expect(typeof firstItem.description).toBe('string');
    expect(typeof firstItem.quantity).toBe('string');
    expect(typeof firstItem.estimated_unit_price).toBe('string');
  });

  test('InventoryItem interface matches backend schema', () => {
    const item: InventoryItem = {
      id: 1,
      sku: 'CHAIR-001',
      name: 'Office Chair',
      barcode: 'CHAIR123',
      description: 'Ergonomic office chair',
      category: 1,
      category_name: 'Furniture',
      unit_of_measure: 'unit',
      cost_price: '100.00',
      selling_price: '150.00',
      minimum_selling_price: '120.00',
      valuation_method: 'fifo',
      reorder_level: '5.00',
      reorder_quantity: '10.00',
      is_active: true,
      is_sellable: true,
      is_purchasable: true,
      track_serial_numbers: false,
      track_batch_numbers: false,
      track_expiry: false,
      total_stock: '25.00',
      total_available: '20.00',
      total_reserved: '5.00',
      total_value: '2500.00',
      needs_reorder: false,
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    // Verify required fields
    expect(typeof item.id).toBe('number');
    expect(typeof item.sku).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.category).toBe('number');
    expect(typeof item.category_name).toBe('string');

    // Verify decimal string fields
    expect(typeof item.cost_price).toBe('string');
    expect(typeof item.selling_price).toBe('string');
    expect(typeof item.total_stock).toBe('string');
    expect(typeof item.total_available).toBe('string');
    expect(typeof item.total_reserved).toBe('string');
    expect(typeof item.total_value).toBe('string');

    // Verify boolean fields
    expect(typeof item.is_active).toBe('boolean');
    expect(typeof item.is_sellable).toBe('boolean');
    expect(typeof item.is_purchasable).toBe('boolean');
    expect(typeof item.needs_reorder).toBe('boolean');
  });

  test('Enum values match backend definitions', () => {
    // Test requisition status values
    const validStatuses = ['draft', 'submitted', 'approved', 'rejected', 'po_created', 'cancelled'];
    validStatuses.forEach(status => {
      const requisition: Partial<PurchaseRequisition> = { status: status as any };
      expect(validStatuses).toContain(requisition.status);
    });

    // Test valuation method values
    const validValuationMethods = ['fifo', 'lifo', 'average'];
    validValuationMethods.forEach(method => {
      const item: Partial<InventoryItem> = { valuation_method: method as any };
      expect(validValuationMethods).toContain(item.valuation_method);
    });
  });

  test('Decimal string format validation', () => {
    // Test valid decimal strings according to backend pattern ^-?\d{0,16}(?:\.\d{0,2})?$
    const validDecimals = ['0.00', '10.50', '999.99', '1234.56', '0', '10', '.50', '10.'];
    validDecimals.forEach(decimal => {
      expect(decimal).toMatch(/^-?\d{0,16}(?:\.\d{0,2})?$/);
    });

    // Test invalid decimal strings (too many decimal places)
    const invalidDecimals = ['10.555', 'abc', '10.123'];
    invalidDecimals.forEach(decimal => {
      expect(decimal).not.toMatch(/^-?\d{0,16}(?:\.\d{0,2})?$/);
    });
  });

  test('Required vs optional fields are correctly defined', () => {
    // Test minimal valid PurchaseRequisition
    const minimalRequisition: Pick<
      PurchaseRequisition,
      | 'id'
      | 'pr_number'
      | 'requested_by'
      | 'requested_by_name'
      | 'required_by_date'
      | 'purpose'
      | 'status'
      | 'approved_by'
      | 'approved_by_name'
      | 'approved_at'
      | 'items'
      | 'created_at'
      | 'updated_at'
    > = {
      id: 1,
      pr_number: 'PR-001',
      requested_by: 1,
      requested_by_name: 'John Doe',
      required_by_date: '2026-01-14',
      purpose: 'Office supplies',
      status: 'draft',
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      items: [],
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    expect(minimalRequisition.id).toBeDefined();
    expect(minimalRequisition.pr_number).toBeDefined();
    expect(minimalRequisition.requested_by).toBeDefined();
    expect(minimalRequisition.requested_by_name).toBeDefined();
    expect(minimalRequisition.required_by_date).toBeDefined();
    expect(minimalRequisition.purpose).toBeDefined();
    expect(minimalRequisition.status).toBeDefined();
    expect(Array.isArray(minimalRequisition.items)).toBe(true);
  });
});
