/**
 * Service Endpoint Verification Tests
 *
 * This test suite verifies that all services are using the correct API endpoints
 * as specified in the requirements and design documents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { procurementService } from '../../services/procurementService';
import { inventoryService } from '../../services/inventoryService';
import { api } from '../../services/api';

// Mock the api service
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Service Endpoint Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Procurement Service Endpoints', () => {
    it('should use correct endpoint for submitRequisition', async () => {
      const mockResponse = { id: 1, status: 'submitted' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      await procurementService.submitRequisition(1);

      expect(api.post).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/submit/', {});
    });

    it('should use correct endpoint for convertRequisitionToPO', async () => {
      const mockResponse = { id: 1, po_number: 'PO-001' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      await procurementService.convertRequisitionToPO(1);

      expect(api.post).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/create_po/', {});
    });

    it('should use correct endpoint for getPurchaseRequisitions', async () => {
      const mockResponse = { count: 0, results: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await procurementService.getPurchaseRequisitions();

      expect(api.get).toHaveBeenCalledWith('/procurement/purchase-requisitions/', {
        params: undefined,
      });
    });

    it('should use correct endpoint for getPurchaseRequisition', async () => {
      const mockResponse = { id: 1, pr_number: 'PR-001' };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await procurementService.getPurchaseRequisition(1);

      expect(api.get).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/');
    });
  });

  describe('Inventory Service Endpoints', () => {
    it('should use correct endpoint for getItemStockLevels', async () => {
      const mockResponse = { count: 0, results: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await inventoryService.getItemStockLevels(1);

      expect(api.get).toHaveBeenCalledWith('/inventory/items/1/stock/', { params: undefined });
    });

    it('should use correct endpoint for getItemMovements', async () => {
      const mockResponse = { count: 0, results: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await inventoryService.getItemMovements(1);

      expect(api.get).toHaveBeenCalledWith('/inventory/items/1/movements/', { params: undefined });
    });

    it('should use correct endpoint for createStockAdjustment', async () => {
      const mockResponse = { id: 1, request_number: 'ADJ-001' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const adjustmentData = {
        requested_by: 1,
        item: 1,
        location: 1,
        adjustment_type: 'increase' as const,
        quantity: '10.00',
        reason: 'Test adjustment',
      };

      await inventoryService.createStockAdjustment(adjustmentData);

      expect(api.post).toHaveBeenCalledWith('/inventory/adjustments/', adjustmentData);
    });

    it('should use correct endpoint for createStockTransfer', async () => {
      const mockResponse = { id: 1, transfer_number: 'TRF-001' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const transferData = {
        requested_by: 1,
        item: 1,
        from_location: 1,
        to_location: 2,
        quantity: '10.00',
        reason: 'Test transfer',
      };

      await inventoryService.createStockTransfer(transferData);

      expect(api.post).toHaveBeenCalledWith('/inventory/transfers/', transferData);
    });

    it('should use correct endpoint for getItems', async () => {
      const mockResponse = { count: 0, results: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await inventoryService.getItems({ search: 'test' });

      expect(api.get).toHaveBeenCalledWith('/inventory/items/', { params: { search: 'test' } });
    });

    it('should use correct endpoint for getItem', async () => {
      const mockResponse = { id: 1, name: 'Test Item' };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await inventoryService.getItem(1);

      expect(api.get).toHaveBeenCalledWith('/inventory/items/1/');
    });

    it('should use correct endpoint for getLocations', async () => {
      const mockResponse = { count: 0, results: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await inventoryService.getLocations();

      expect(api.get).toHaveBeenCalledWith('/inventory/locations/', { params: undefined });
    });
  });

  describe('Service Method Existence', () => {
    it('should have all required procurement service methods', () => {
      expect(typeof procurementService.submitRequisition).toBe('function');
      expect(typeof procurementService.convertRequisitionToPO).toBe('function');
      expect(typeof procurementService.getPurchaseRequisitions).toBe('function');
      expect(typeof procurementService.getPurchaseRequisition).toBe('function');
      expect(typeof procurementService.createPurchaseRequisition).toBe('function');
      expect(typeof procurementService.updatePurchaseRequisition).toBe('function');
      expect(typeof procurementService.deletePurchaseRequisition).toBe('function');
      expect(typeof procurementService.approveRequisition).toBe('function');
      expect(typeof procurementService.rejectRequisition).toBe('function');
    });

    it('should have all required inventory service methods', () => {
      expect(typeof inventoryService.getItemStockLevels).toBe('function');
      expect(typeof inventoryService.getItemMovements).toBe('function');
      expect(typeof inventoryService.createStockAdjustment).toBe('function');
      expect(typeof inventoryService.createStockTransfer).toBe('function');
      expect(typeof inventoryService.getItems).toBe('function');
      expect(typeof inventoryService.getItem).toBe('function');
      expect(typeof inventoryService.getLocations).toBe('function');
      expect(typeof inventoryService.createItem).toBe('function');
      expect(typeof inventoryService.updateItem).toBe('function');
      expect(typeof inventoryService.deleteItem).toBe('function');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors in procurement service methods', async () => {
      const mockError = new Error('Network error');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(procurementService.submitRequisition(1)).rejects.toThrow();
    });

    it('should handle errors in inventory service methods', async () => {
      const mockError = new Error('Network error');
      vi.mocked(api.get).mockRejectedValue(mockError);

      await expect(inventoryService.getItemStockLevels(1)).rejects.toThrow();
    });
  });

  describe('Request Data Format Validation', () => {
    it('should send stock adjustment data in correct format', async () => {
      const mockResponse = { id: 1, request_number: 'ADJ-001' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const adjustmentData = {
        requested_by: 1,
        item: 1,
        location: 1,
        adjustment_type: 'increase' as const,
        quantity: '10.00', // Should be string format
        unit_cost: '5.00', // Should be string format
        reason: 'Test adjustment',
        notes: 'Test notes',
        status: 'pending' as const,
      };

      await inventoryService.createStockAdjustment(adjustmentData);

      expect(api.post).toHaveBeenCalledWith('/inventory/adjustments/', adjustmentData);

      // Verify the data format
      const callArgs = vi.mocked(api.post).mock.calls[0];
      const sentData = callArgs[1];
      expect(typeof sentData.quantity).toBe('string');
      expect(typeof sentData.unit_cost).toBe('string');
      expect(sentData.adjustment_type).toBe('increase');
    });

    it('should send stock transfer data in correct format', async () => {
      const mockResponse = { id: 1, transfer_number: 'TRF-001' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const transferData = {
        requested_by: 1,
        item: 1,
        from_location: 1,
        to_location: 2,
        quantity: '10.00', // Should be string format
        unit_cost: '5.00', // Should be string format
        reason: 'Test transfer',
        notes: 'Test notes',
        reference_number: 'TRF-001',
        status: 'pending' as const,
      };

      await inventoryService.createStockTransfer(transferData);

      expect(api.post).toHaveBeenCalledWith('/inventory/transfers/', transferData);

      // Verify the data format
      const callArgs = vi.mocked(api.post).mock.calls[0];
      const sentData = callArgs[1];
      expect(typeof sentData.quantity).toBe('string');
      expect(typeof sentData.unit_cost).toBe('string');
      expect(sentData.from_location).toBe(1);
      expect(sentData.to_location).toBe(2);
    });
  });
});
