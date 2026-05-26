// Test file for workflow API service methods
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { procurementService } from '../procurementService';
import { api } from '../api';
import { ErrorHandler } from '../../utils/errorHandler';
import {
  WorkflowRequisitionData,
  WorkflowRequisitionResponse,
  RequisitionToPOConversionData,
} from '../../types/procurement';

// Mock the dependencies
vi.mock('../api');
vi.mock('../../utils/errorHandler');

const mockApi = api as any;
const mockErrorHandler = ErrorHandler as any;

describe('ProcurementService - Workflow API Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRequisitionWithWorkflow', () => {
    it('should create requisition with workflow successfully', async () => {
      // Arrange
      const workflowData: WorkflowRequisitionData = {
        department: 'IT',
        purpose: 'Office equipment',
        required_by_date: '2026-02-15',
        items: [
          {
            item: 1,
            quantity: 10,
            estimated_unit_price: '50.00',
          },
        ],
      };

      const expectedResponse: WorkflowRequisitionResponse = {
        pr_id: 123,
        pr_number: 'PR-2026-001',
        workflow_run_id: 456,
        status: 'submitted',
      };

      mockErrorHandler.withRetry.mockResolvedValue(expectedResponse);

      // Act
      const result = await procurementService.createRequisitionWithWorkflow(workflowData);

      // Assert
      expect(mockErrorHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'create-requisition-with-workflow'
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should handle workflow creation errors', async () => {
      // Arrange
      const workflowData: WorkflowRequisitionData = {
        department: 'IT',
        purpose: 'Office equipment',
        required_by_date: '2026-02-15',
        items: [
          {
            item: 1,
            quantity: 10,
            estimated_unit_price: '50.00',
          },
        ],
      };

      const error = new Error('Workflow system unavailable');
      mockErrorHandler.withRetry.mockRejectedValue(error);

      // Act & Assert
      await expect(procurementService.createRequisitionWithWorkflow(workflowData)).rejects.toThrow(
        'Workflow system unavailable'
      );
    });
  });

  describe('convertRequisitionToPOWithDetails', () => {
    it('should convert requisition to PO with details successfully', async () => {
      // Arrange
      const requisitionId = 123;
      const conversionData: RequisitionToPOConversionData = {
        supplier: 1,
        delivery_location: 1,
        expected_delivery_date: '2026-02-20',
      };

      const expectedPO = {
        id: 456,
        po_number: 'PO-2026-001',
        supplier: 1,
        delivery_location: 1,
        expected_delivery_date: '2026-02-20',
        status: 'draft',
      };

      mockErrorHandler.withRetry.mockResolvedValue(expectedPO);

      // Act
      const result = await procurementService.convertRequisitionToPOWithDetails(
        requisitionId,
        conversionData
      );

      // Assert
      expect(mockErrorHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'convert-requisition-with-details'
      );
      expect(result).toEqual(expectedPO);
    });

    it('should handle conversion errors', async () => {
      // Arrange
      const requisitionId = 123;
      const conversionData: RequisitionToPOConversionData = {
        supplier: 1,
        delivery_location: 1,
        expected_delivery_date: '2026-02-20',
      };

      const error = new Error('Requisition not approved');
      mockErrorHandler.withRetry.mockRejectedValue(error);

      // Act & Assert
      await expect(
        procurementService.convertRequisitionToPOWithDetails(requisitionId, conversionData)
      ).rejects.toThrow('Requisition not approved');
    });
  });

  describe('API endpoint validation', () => {
    it('should call correct endpoint for workflow creation', async () => {
      // Arrange
      const workflowData: WorkflowRequisitionData = {
        department: 'IT',
        purpose: 'Office equipment',
        required_by_date: '2026-02-15',
        items: [
          {
            item: 1,
            quantity: 10,
            estimated_unit_price: '50.00',
          },
        ],
      };

      mockErrorHandler.withRetry.mockImplementation(async operation => {
        return await operation();
      });

      mockApi.post.mockResolvedValue({
        pr_id: 123,
        pr_number: 'PR-2026-001',
        workflow_run_id: 456,
        status: 'submitted',
      });

      // Act
      await procurementService.createRequisitionWithWorkflow(workflowData);

      // Assert
      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/requisitions/create_with_workflow/',
        workflowData
      );
    });

    it('should call correct endpoint for PO conversion with details', async () => {
      // Arrange
      const requisitionId = 123;
      const conversionData: RequisitionToPOConversionData = {
        supplier: 1,
        delivery_location: 1,
        expected_delivery_date: '2026-02-20',
      };

      mockErrorHandler.withRetry.mockImplementation(async operation => {
        return await operation();
      });

      mockApi.post.mockResolvedValue({
        id: 456,
        po_number: 'PO-2026-001',
      });

      // Act
      await procurementService.convertRequisitionToPOWithDetails(requisitionId, conversionData);

      // Assert
      expect(mockApi.post).toHaveBeenCalledWith(
        `/procurement/requisitions/${requisitionId}/convert-to-po/`,
        conversionData
      );
    });
  });
});
