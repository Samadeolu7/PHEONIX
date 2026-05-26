// src/services/__tests__/procurementService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { procurementService } from '../procurementService';
import { api } from '../api';

// Mock the API module
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

describe('ProcurementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Purchase Orders', () => {
    const mockPurchaseOrder = {
      id: 1,
      po_number: 'PO-2024-001',
      supplier: 1,
      supplier_name: 'Test Supplier',
      status: 'draft' as const,
      subtotal: '1000.00',
      tax_amount: '100.00',
      total_amount: '1100.00',
      items: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should fetch purchase orders successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockPurchaseOrder],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await procurementService.getPurchaseOrders();

      expect(mockApi.get).toHaveBeenCalledWith('/procurement/purchase-orders/', undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should fetch purchase orders with parameters', async () => {
      const params = { search: 'test', status: 'draft', page: 1 };
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockPurchaseOrder],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await procurementService.getPurchaseOrders(params);

      expect(mockApi.get).toHaveBeenCalledWith('/procurement/purchase-orders/', params);
      expect(result).toEqual(mockResponse);
    });

    it('should fetch single purchase order successfully', async () => {
      mockApi.get.mockResolvedValue(mockPurchaseOrder);

      const result = await procurementService.getPurchaseOrder(1);

      expect(mockApi.get).toHaveBeenCalledWith('/procurement/purchase-orders/1/');
      expect(result).toEqual(mockPurchaseOrder);
    });

    it('should create purchase order successfully', async () => {
      const createData = {
        supplier: 1,
        delivery_location: 1,
        payment_terms: 'net_30' as const,
        items: [
          {
            item_id: 1,
            quantity: 10,
            unit_price: '100.00',
          },
        ],
      };

      mockApi.post.mockResolvedValue(mockPurchaseOrder);

      const result = await procurementService.createPurchaseOrder(createData);

      expect(mockApi.post).toHaveBeenCalledWith('/procurement/purchase-orders/', createData);
      expect(result).toEqual(mockPurchaseOrder);
    });

    it('should update purchase order successfully', async () => {
      const updateData = { notes: 'Updated notes' };
      const updatedPO = { ...mockPurchaseOrder, notes: 'Updated notes' };

      mockApi.patch.mockResolvedValue(updatedPO);

      const result = await procurementService.updatePurchaseOrder(1, updateData);

      expect(mockApi.patch).toHaveBeenCalledWith('/procurement/purchase-orders/1/', updateData);
      expect(result).toEqual(updatedPO);
    });

    it('should delete purchase order successfully', async () => {
      mockApi.delete.mockResolvedValue(undefined);

      await procurementService.deletePurchaseOrder(1);

      expect(mockApi.delete).toHaveBeenCalledWith('/procurement/purchase-orders/1/');
    });

    it('should approve purchase order successfully', async () => {
      const approvedPO = { ...mockPurchaseOrder, status: 'approved' as const };
      mockApi.post.mockResolvedValue(approvedPO);

      const result = await procurementService.approvePurchaseOrder(1, {});

      expect(mockApi.post).toHaveBeenCalledWith('/procurement/purchase-orders/1/approve/', {});
      expect(result).toEqual(approvedPO);
    });

    it('should send purchase order to supplier successfully', async () => {
      const sentPO = { ...mockPurchaseOrder, status: 'sent' as const };
      mockApi.post.mockResolvedValue(sentPO);

      const result = await procurementService.sendPurchaseOrder(1);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/purchase-orders/1/send_to_supplier/',
        {}
      );
      expect(result).toEqual(sentPO);
    });

    it('should cancel purchase order successfully', async () => {
      const cancelledPO = { ...mockPurchaseOrder, status: 'cancelled' as const };
      mockApi.post.mockResolvedValue(cancelledPO);

      const result = await procurementService.cancelPurchaseOrder(1, {});

      expect(mockApi.post).toHaveBeenCalledWith('/procurement/purchase-orders/1/cancel/', {});
      expect(result).toEqual(cancelledPO);
    });
  });

  describe('Suppliers', () => {
    const mockSupplier = {
      id: 1,
      supplier_code: 'SUP-001',
      name: 'Test Supplier',
      contact_person: 'John Doe',
      email: 'john@supplier.com',
      phone: '+1234567890',
      address: '123 Main St',
      tax_id: 'TAX123',
      payment_terms: 'net_30' as const,
      credit_limit: '10000.00',
      is_active: true,
      metadata: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should fetch suppliers successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockSupplier],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await procurementService.getSuppliers();

      expect(mockApi.get).toHaveBeenCalledWith('/procurement/suppliers/', undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should create supplier successfully', async () => {
      const createData = {
        name: 'New Supplier',
        contact_person: 'Jane Doe',
        email: 'jane@newsupplier.com',
        phone: '+0987654321',
      };

      mockApi.post.mockResolvedValue(mockSupplier);

      const result = await procurementService.createSupplier(createData);

      expect(mockApi.post).toHaveBeenCalledWith('/procurement/suppliers/', createData);
      expect(result).toEqual(mockSupplier);
    });
  });
});
