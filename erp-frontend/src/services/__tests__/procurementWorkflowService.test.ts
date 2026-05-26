// Tests for Procurement Workflow Service
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import procurementWorkflowService from '../procurementWorkflowService';
import { procurementService } from '../procurementService';

// Mock the procurement service
vi.mock('../procurementService', () => ({
  procurementService: {
    updatePurchaseRequisition: vi.fn(),
    updateGRN: vi.fn(),
    updatePurchaseReturn: vi.fn(),
    sendNotification: vi.fn(),
    startWorkflow: vi.fn(),
    connectToAutomationWorkflow: vi.fn(),
  },
}));

describe('ProcurementWorkflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Event Triggering', () => {
    it('should trigger status change events', () => {
      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.triggerStatusChange(
          'requisition',
          123,
          'draft',
          'submitted',
          456,
          { test: 'metadata' }
        );
      }).not.toThrow();
    });

    it('should trigger custom events', () => {
      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.triggerCustomEvent('grn', 789, 'quality_check_completed', {
          inspection_result: 'passed',
        });
      }).not.toThrow();
    });
  });

  describe('Rule Management', () => {
    it('should add custom rules', () => {
      const customRule = {
        id: 'test-rule',
        entity_type: 'requisition' as const,
        trigger_event: 'test_event',
        conditions: [{ field: 'status', operator: 'equals', value: 'test' }],
        target_status: 'new_status',
        is_active: true,
      };

      procurementWorkflowService.addRule(customRule);
      const rules = procurementWorkflowService.getRules('requisition');

      expect(rules).toContainEqual(customRule);
    });

    it('should remove rules', () => {
      const customRule = {
        id: 'test-rule-to-remove',
        entity_type: 'requisition' as const,
        trigger_event: 'test_event',
        conditions: [],
        target_status: 'new_status',
        is_active: true,
      };

      procurementWorkflowService.addRule(customRule);
      procurementWorkflowService.removeRule('test-rule-to-remove', 'requisition');

      const rules = procurementWorkflowService.getRules('requisition');
      expect(rules.find(r => r.id === 'test-rule-to-remove')).toBeUndefined();
    });

    it('should get rules for entity type', () => {
      const rules = procurementWorkflowService.getRules('requisition');
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0); // Should have default rules
    });
  });

  describe('Integration Helpers', () => {
    it('should handle requisition submission', () => {
      const requisition = {
        id: 123,
        requester_id: 456,
        department_id: 789,
        total_estimated_cost: '1000.00',
        priority: 'high' as any,
      };

      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.handleRequisitionSubmission(requisition as any, 999);
      }).not.toThrow();
    });

    it('should handle requisition approval', () => {
      const requisition = {
        id: 123,
        status: 'under_review' as any,
      };

      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.handleRequisitionApproval(
          requisition as any,
          999,
          'Approved for processing'
        );
      }).not.toThrow();
    });

    it('should handle GRN posting', () => {
      const grn = {
        id: 123,
        total_amount: '5000.00',
        supplier: 456,
      };

      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.handleGRNPosting(grn as any, 999);
      }).not.toThrow();
    });

    it('should handle return completion', () => {
      const returnItem = {
        id: 123,
        status: 'approved' as any,
        total_return_value: '500.00',
      };

      // Test that the method doesn't throw an error
      expect(() => {
        procurementWorkflowService.handleReturnCompletion(returnItem as any, 999);
      }).not.toThrow();
    });
  });

  describe('Workflow and Automation Integration', () => {
    it('should start workflow for entity', async () => {
      const mockResult = { id: 'workflow-123', status: 'pending' };
      (procurementService.startWorkflow as any).mockResolvedValue(mockResult);

      const result = await procurementWorkflowService.startWorkflow(
        'requisition',
        123,
        'approval',
        { test: 'data' }
      );

      expect(procurementService.startWorkflow).toHaveBeenCalledWith({
        entity_type: 'requisition',
        entity_id: 123,
        workflow_type: 'approval',
        trigger_data: { test: 'data' },
      });

      expect(result).toEqual(mockResult);
    });

    it('should connect to automation system', async () => {
      const mockResult = { run_id: 'automation-run-456' };
      (procurementService.connectToAutomationWorkflow as any).mockResolvedValue(mockResult);

      const result = await procurementWorkflowService.connectToAutomation('grn', 789, 123, {
        automation: 'data',
      });

      expect(procurementService.connectToAutomationWorkflow).toHaveBeenCalledWith({
        entity_type: 'grn',
        entity_id: 789,
        automation_template_id: 123,
        trigger_data: { automation: 'data' },
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('Error Handling', () => {
    it('should handle workflow start errors gracefully', async () => {
      const error = new Error('Workflow start failed');
      (procurementService.startWorkflow as any).mockRejectedValue(error);

      await expect(procurementWorkflowService.startWorkflow('requisition', 123)).rejects.toThrow(
        'Workflow start failed'
      );
    });

    it('should handle automation connection errors gracefully', async () => {
      const error = new Error('Automation connection failed');
      (procurementService.connectToAutomationWorkflow as any).mockRejectedValue(error);

      await expect(procurementWorkflowService.connectToAutomation('grn', 789, 123)).rejects.toThrow(
        'Automation connection failed'
      );
    });
  });
});
