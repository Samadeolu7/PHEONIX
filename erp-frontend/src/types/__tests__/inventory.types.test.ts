// Test file to validate inventory types match backend schema
import {
  InventoryItem,
  InventoryStock,
  StockMovement,
  StockAdjustmentRequest,
  StockAdjustment,
  StockTransferRequest,
  StockTransfer,
  validateStockAdjustmentRequest,
  validateStockTransferRequest,
  validateDecimalString,
  formatDecimalString,
  parseDecimalString,
} from '../inventory';

// Test that all required fields are present and have correct types
describe('Inventory Types Schema Compliance', () => {
  test('InventoryItem interface matches backend schema', () => {
    const item: InventoryItem = {
      id: 1,
      sku: 'TEST-001',
      name: 'Test Item',
      barcode: 'TEST123',
      description: 'Test description',
      category: 1,
      category_name: 'Test Category',
      unit_of_measure: 'unit',
      cost_price: '10.50',
      selling_price: '15.75',
      minimum_selling_price: '12.00',
      valuation_method: 'fifo',
      reorder_level: '5.00',
      reorder_quantity: '20.00',
      is_active: true,
      is_sellable: true,
      is_purchasable: true,
      track_serial_numbers: false,
      track_batch_numbers: false,
      track_expiry: false,
      total_stock: '100.00',
      total_available: '95.00',
      total_reserved: '5.00',
      total_value: '1050.00',
      needs_reorder: false,
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    // Verify decimal string fields
    expect(typeof item.cost_price).toBe('string');
    expect(typeof item.selling_price).toBe('string');
    expect(typeof item.total_stock).toBe('string');
    expect(typeof item.total_available).toBe('string');
    expect(typeof item.total_reserved).toBe('string');
    expect(typeof item.total_value).toBe('string');
  });

  test('StockAdjustmentRequest interface matches backend schema', () => {
    const request: StockAdjustmentRequest = {
      requested_by: 1,
      item: 1,
      location: 1,
      adjustment_type: 'increase',
      quantity: '10.50',
      unit_cost: '5.25',
      reason: 'Stock count adjustment',
      notes: 'Cycle count revealed discrepancy',
      status: 'pending',
      approval_notes: '',
    };

    // Verify required fields
    expect(typeof request.requested_by).toBe('number');
    expect(typeof request.item).toBe('number');
    expect(typeof request.location).toBe('number');
    expect(typeof request.adjustment_type).toBe('string');
    expect(typeof request.quantity).toBe('string');
    expect(typeof request.reason).toBe('string');
  });

  test('StockTransferRequest interface matches backend schema', () => {
    const request: StockTransferRequest = {
      requested_by: 1,
      item: 1,
      from_location: 1,
      to_location: 2,
      quantity: '15.75',
      unit_cost: '8.50',
      reason: 'Rebalancing stock',
      notes: 'Moving excess stock',
      reference_number: 'TRF-001',
      status: 'pending',
      approval_notes: '',
    };

    // Verify required fields
    expect(typeof request.requested_by).toBe('number');
    expect(typeof request.item).toBe('number');
    expect(typeof request.from_location).toBe('number');
    expect(typeof request.to_location).toBe('number');
    expect(typeof request.quantity).toBe('string');
    expect(typeof request.reason).toBe('string');
  });

  test('StockMovement interface matches backend schema', () => {
    const movement: StockMovement = {
      id: 1,
      item: 1,
      item_name: 'Test Item',
      item_sku: 'TEST-001',
      from_location: 1,
      from_location_name: 'Warehouse A',
      to_location: 2,
      to_location_name: 'Warehouse B',
      movement_type: 'transfer',
      movement_date: '2026-01-07',
      quantity: '10.00',
      unit_cost: '5.50',
      reference_number: 'TRF-001',
      notes: 'Stock transfer',
      batch_number: 'BATCH001',
      serial_number: 'SN001',
      expiry_date: '2027-01-07',
      created_by_name: 'John Doe',
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    // Verify decimal string fields
    expect(typeof movement.quantity).toBe('string');
    expect(typeof movement.unit_cost).toBe('string');
    expect(movement.movement_type).toBe('transfer');
  });

  test('Validation functions work correctly', () => {
    // Test decimal string validation
    expect(validateDecimalString('10.50')).toBe(true);
    expect(validateDecimalString('0.00')).toBe(true);
    expect(validateDecimalString('-5.25')).toBe(true);
    expect(validateDecimalString('invalid')).toBe(false);
    expect(validateDecimalString('10.555')).toBe(false); // Too many decimal places

    // Test decimal string formatting
    expect(formatDecimalString(10.5)).toBe('10.50');
    expect(formatDecimalString(0)).toBe('0.00');

    // Test decimal string parsing
    expect(parseDecimalString('10.50')).toBe(10.5);
    expect(parseDecimalString('0.00')).toBe(0);
    expect(parseDecimalString('invalid')).toBe(0);
  });

  test('Stock adjustment validation works correctly', () => {
    const validRequest: Partial<StockAdjustmentRequest> = {
      requested_by: 1,
      item: 1,
      location: 1,
      adjustment_type: 'increase',
      quantity: '10.50',
      unit_cost: '5.25',
      reason: 'Stock count adjustment',
    };

    const errors = validateStockAdjustmentRequest(validRequest);
    expect(errors).toHaveLength(0);

    // Test invalid request
    const invalidRequest: Partial<StockAdjustmentRequest> = {
      quantity: 'invalid',
      reason: '',
    };

    const invalidErrors = validateStockAdjustmentRequest(invalidRequest);
    expect(invalidErrors.length).toBeGreaterThan(0);
  });

  test('Stock transfer validation works correctly', () => {
    const validRequest: Partial<StockTransferRequest> = {
      requested_by: 1,
      item: 1,
      from_location: 1,
      to_location: 2,
      quantity: '15.75',
      reason: 'Rebalancing stock',
    };

    const errors = validateStockTransferRequest(validRequest);
    expect(errors).toHaveLength(0);

    // Test invalid request (same from and to location)
    const invalidRequest: Partial<StockTransferRequest> = {
      requested_by: 1,
      item: 1,
      from_location: 1,
      to_location: 1, // Same as from_location
      quantity: '15.75',
      reason: 'Rebalancing stock',
    };

    const invalidErrors = validateStockTransferRequest(invalidRequest);
    expect(invalidErrors).toContain('From location and to location must be different');
  });
});
