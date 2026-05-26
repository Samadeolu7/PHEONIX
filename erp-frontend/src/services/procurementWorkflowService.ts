// Procurement Workflow Service - Handles automatic status updates and workflow integration
import { procurementService } from './procurementService';
import { automationService } from './automationService';
import {
  RequisitionStatus,
  GRNStatus,
  ReturnStatus,
  PurchaseRequisition,
  GoodsReceivedNote,
  PurchaseReturn,
} from '../types/procurement';
import {
  WorkflowStatusInfo,
  AutoStatusUpdateConfig,
  EmailNotificationConfig,
  WorkflowEntityType,
} from '../types/procurementWorkflow';

export interface WorkflowTriggerEvent {
  entity_type: WorkflowEntityType;
  entity_id: number;
  event_type: string;
  old_status?: string;
  new_status?: string;
  user_id?: number;
  metadata?: Record<string, any>;
}

export interface AutoStatusRule {
  id: string;
  entity_type: WorkflowEntityType;
  trigger_event: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  target_status: string;
  notification_config?: EmailNotificationConfig;
  delay_minutes?: number;
  is_active: boolean;
}

class ProcurementWorkflowService {
  private autoStatusRules: Map<string, AutoStatusRule[]> = new Map();
  private eventQueue: WorkflowTriggerEvent[] = [];
  private processing = false;

  constructor() {
    this.initializeDefaultRules();
    this.startEventProcessor();
  }

  // Initialize default auto-status rules for procurement workflows
  private initializeDefaultRules() {
    const defaultRules: AutoStatusRule[] = [
      // Requisition Rules
      {
        id: 'req-submit-to-review',
        entity_type: 'requisition',
        trigger_event: 'status_changed',
        conditions: [{ field: 'new_status', operator: 'equals', value: 'submitted' }],
        target_status: 'under_review',
        notification_config: {
          template_name: 'requisition_submitted',
          recipients: [
            { type: 'role', identifier: 'procurement_manager', name: 'Procurement Manager' },
          ],
          subject: 'New Purchase Requisition Submitted for Review',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        delay_minutes: 0,
        is_active: true,
      },
      {
        id: 'req-approved-notification',
        entity_type: 'requisition',
        trigger_event: 'status_changed',
        conditions: [{ field: 'new_status', operator: 'equals', value: 'approved' }],
        target_status: 'approved',
        notification_config: {
          template_name: 'requisition_approved',
          recipients: [{ type: 'user', identifier: 'requester_id', name: 'Requester' }],
          subject: 'Purchase Requisition Approved',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        is_active: true,
      },
      {
        id: 'req-rejected-notification',
        entity_type: 'requisition',
        trigger_event: 'status_changed',
        conditions: [{ field: 'new_status', operator: 'equals', value: 'rejected' }],
        target_status: 'rejected',
        notification_config: {
          template_name: 'requisition_rejected',
          recipients: [{ type: 'user', identifier: 'requester_id', name: 'Requester' }],
          subject: 'Purchase Requisition Rejected',
          variables: {},
          priority: 'high',
          send_immediately: true,
        },
        is_active: true,
      },

      // GRN Rules
      {
        id: 'grn-quality-check-complete',
        entity_type: 'grn',
        trigger_event: 'quality_check_completed',
        conditions: [{ field: 'overall_inspection_status', operator: 'equals', value: 'passed' }],
        target_status: 'posted',
        notification_config: {
          template_name: 'grn_quality_passed',
          recipients: [
            { type: 'role', identifier: 'inventory_manager', name: 'Inventory Manager' },
            { type: 'role', identifier: 'accounts_payable', name: 'Accounts Payable' },
          ],
          subject: 'GRN Quality Check Passed - Ready for Posting',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        is_active: true,
      },
      {
        id: 'grn-posted-notification',
        entity_type: 'grn',
        trigger_event: 'posted_to_inventory',
        conditions: [{ field: 'posted_to_inventory', operator: 'equals', value: true }],
        target_status: 'posted',
        notification_config: {
          template_name: 'grn_posted',
          recipients: [
            { type: 'user', identifier: 'received_by_id', name: 'Receiver' },
            { type: 'role', identifier: 'procurement_manager', name: 'Procurement Manager' },
          ],
          subject: 'GRN Posted to Inventory Successfully',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        is_active: true,
      },

      // Return Rules
      {
        id: 'return-approved-process',
        entity_type: 'return',
        trigger_event: 'status_changed',
        conditions: [{ field: 'new_status', operator: 'equals', value: 'approved' }],
        target_status: 'approved',
        notification_config: {
          template_name: 'return_approved',
          recipients: [
            { type: 'user', identifier: 'created_by_id', name: 'Return Creator' },
            { type: 'role', identifier: 'warehouse_manager', name: 'Warehouse Manager' },
          ],
          subject: 'Purchase Return Approved - Ready for Processing',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        is_active: true,
      },
      {
        id: 'return-completed-notification',
        entity_type: 'return',
        trigger_event: 'status_changed',
        conditions: [{ field: 'new_status', operator: 'equals', value: 'completed' }],
        target_status: 'completed',
        notification_config: {
          template_name: 'return_completed',
          recipients: [
            { type: 'user', identifier: 'created_by_id', name: 'Return Creator' },
            { type: 'role', identifier: 'accounts_payable', name: 'Accounts Payable' },
          ],
          subject: 'Purchase Return Completed',
          variables: {},
          priority: 'normal',
          send_immediately: true,
        },
        is_active: true,
      },
    ];

    // Group rules by entity type for efficient lookup
    defaultRules.forEach(rule => {
      const entityRules = this.autoStatusRules.get(rule.entity_type) || [];
      entityRules.push(rule);
      this.autoStatusRules.set(rule.entity_type, entityRules);
    });
  }

  // Start the event processor that handles queued workflow events
  private startEventProcessor() {
    setInterval(() => {
      if (!this.processing && this.eventQueue.length > 0) {
        this.processEventQueue();
      }
    }, 1000); // Process every second
  }

  // Process queued workflow events
  private async processEventQueue() {
    if (this.processing || this.eventQueue.length === 0) return;

    this.processing = true;
    const event = this.eventQueue.shift();

    if (event) {
      try {
        await this.processWorkflowEvent(event);
      } catch (error) {
        console.error('Error processing workflow event:', error);
      }
    }

    this.processing = false;
  }

  // Process a single workflow event
  private async processWorkflowEvent(event: WorkflowTriggerEvent) {
    const rules = this.autoStatusRules.get(event.entity_type) || [];
    const applicableRules = rules.filter(
      rule => rule.is_active && rule.trigger_event === event.event_type
    );

    for (const rule of applicableRules) {
      if (await this.evaluateConditions(rule.conditions, event)) {
        await this.executeRule(rule, event);
      }
    }
  }

  // Evaluate rule conditions against the event
  private async evaluateConditions(
    conditions: Array<{ field: string; operator: string; value: any }>,
    event: WorkflowTriggerEvent
  ): Promise<boolean> {
    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(condition.field, event);

      if (!this.evaluateCondition(fieldValue, condition.operator, condition.value)) {
        return false;
      }
    }
    return true;
  }

  // Get field value from event or entity data
  private getFieldValue(field: string, event: WorkflowTriggerEvent): any {
    // Check event properties first
    if (field in event) {
      return (event as any)[field];
    }

    // Check metadata
    if (event.metadata && field in event.metadata) {
      return event.metadata[field];
    }

    return undefined;
  }

  // Evaluate a single condition
  private evaluateCondition(fieldValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'greater_than':
        return fieldValue > expectedValue;
      case 'less_than':
        return fieldValue < expectedValue;
      case 'contains':
        return String(fieldValue).includes(String(expectedValue));
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      default:
        return false;
    }
  }

  // Execute a rule (status update + notification)
  private async executeRule(rule: AutoStatusRule, event: WorkflowTriggerEvent) {
    try {
      // Update status if different from target
      if (rule.target_status && event.new_status !== rule.target_status) {
        await this.updateEntityStatus(event.entity_type, event.entity_id, rule.target_status);
      }

      // Send notification if configured
      if (rule.notification_config) {
        await this.sendRuleNotification(rule.notification_config, event);
      }

      // Log rule execution
      console.log(`Executed workflow rule: ${rule.id} for ${event.entity_type} ${event.entity_id}`);
    } catch (error) {
      console.error(`Failed to execute workflow rule ${rule.id}:`, error);
    }
  }

  // Update entity status
  private async updateEntityStatus(
    entityType: WorkflowEntityType,
    entityId: number,
    status: string
  ) {
    try {
      switch (entityType) {
        case 'requisition':
          await procurementService.updatePurchaseRequisition(entityId, {
            status: status as RequisitionStatus,
          });
          break;
        case 'grn':
          await procurementService.updateGRN(entityId, { status: status as GRNStatus });
          break;
        case 'return':
          await procurementService.updatePurchaseReturn(entityId, {
            status: status as ReturnStatus,
          });
          break;
      }
    } catch (error) {
      console.error(`Failed to update ${entityType} ${entityId} status to ${status}:`, error);
      throw error;
    }
  }

  // Send notification based on rule configuration
  private async sendRuleNotification(config: EmailNotificationConfig, event: WorkflowTriggerEvent) {
    try {
      // Enhance notification variables with event data
      const enhancedConfig = {
        ...config,
        variables: {
          ...config.variables,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          event_type: event.event_type,
          old_status: event.old_status,
          new_status: event.new_status,
          user_id: event.user_id,
          timestamp: new Date().toISOString(),
          ...event.metadata,
        },
      };

      await procurementService.sendNotification(enhancedConfig);
    } catch (error) {
      console.error('Failed to send rule notification:', error);
      throw error;
    }
  }

  // Public API methods

  // Trigger a workflow event
  public triggerEvent(event: WorkflowTriggerEvent) {
    this.eventQueue.push(event);
  }

  // Trigger status change event
  public triggerStatusChange(
    entityType: WorkflowEntityType,
    entityId: number,
    oldStatus: string,
    newStatus: string,
    userId?: number,
    metadata?: Record<string, any>
  ) {
    this.triggerEvent({
      entity_type: entityType,
      entity_id: entityId,
      event_type: 'status_changed',
      old_status: oldStatus,
      new_status: newStatus,
      user_id: userId,
      metadata,
    });
  }

  // Trigger custom event
  public triggerCustomEvent(
    entityType: WorkflowEntityType,
    entityId: number,
    eventType: string,
    metadata?: Record<string, any>
  ) {
    this.triggerEvent({
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      metadata,
    });
  }

  // Add custom rule
  public addRule(rule: AutoStatusRule) {
    const entityRules = this.autoStatusRules.get(rule.entity_type) || [];
    entityRules.push(rule);
    this.autoStatusRules.set(rule.entity_type, entityRules);
  }

  // Remove rule
  public removeRule(ruleId: string, entityType: WorkflowEntityType) {
    const entityRules = this.autoStatusRules.get(entityType) || [];
    const filteredRules = entityRules.filter(rule => rule.id !== ruleId);
    this.autoStatusRules.set(entityType, filteredRules);
  }

  // Get rules for entity type
  public getRules(entityType: WorkflowEntityType): AutoStatusRule[] {
    return this.autoStatusRules.get(entityType) || [];
  }

  // Start workflow for entity
  public async startWorkflow(
    entityType: WorkflowEntityType,
    entityId: number,
    workflowType: string = 'approval',
    triggerData: Record<string, any> = {}
  ): Promise<WorkflowStatusInfo> {
    try {
      const result = await procurementService.startWorkflow({
        entity_type: entityType,
        entity_id: entityId,
        workflow_type: workflowType,
        trigger_data: triggerData,
      });

      // Trigger workflow started event
      this.triggerCustomEvent(entityType, entityId, 'workflow_started', {
        workflow_type: workflowType,
        workflow_id: result.id,
      });

      return result;
    } catch (error) {
      console.error(`Failed to start workflow for ${entityType} ${entityId}:`, error);
      throw error;
    }
  }

  // Connect to automation system
  public async connectToAutomation(
    entityType: WorkflowEntityType,
    entityId: number,
    automationTemplateId: number,
    triggerData: Record<string, any> = {}
  ) {
    try {
      const result = await procurementService.connectToAutomationWorkflow({
        entity_type: entityType,
        entity_id: entityId,
        automation_template_id: automationTemplateId,
        trigger_data: triggerData,
      });

      // Trigger automation connected event
      this.triggerCustomEvent(entityType, entityId, 'automation_connected', {
        automation_template_id: automationTemplateId,
        automation_run_id: result.run_id,
      });

      return result;
    } catch (error) {
      console.error(`Failed to connect ${entityType} ${entityId} to automation:`, error);
      throw error;
    }
  }

  // Integration helpers for existing procurement actions

  // Helper for requisition submission
  public async handleRequisitionSubmission(requisition: PurchaseRequisition, userId?: number) {
    this.triggerStatusChange('requisition', requisition.id!, 'draft', 'submitted', userId, {
      requester_id: requisition.requester_id,
      department_id: requisition.department_id,
      total_estimated_cost: requisition.total_estimated_cost,
      priority: requisition.priority,
    });
  }

  // Helper for requisition approval
  public async handleRequisitionApproval(
    requisition: PurchaseRequisition,
    userId?: number,
    comments?: string
  ) {
    this.triggerStatusChange(
      'requisition',
      requisition.id!,
      requisition.status,
      'approved',
      userId,
      {
        approver_id: userId,
        approval_comments: comments,
        approved_at: new Date().toISOString(),
      }
    );
  }

  // Helper for GRN posting
  public async handleGRNPosting(grn: GoodsReceivedNote, userId?: number) {
    this.triggerCustomEvent('grn', grn.id!, 'posted_to_inventory', {
      posted_by_id: userId,
      posted_at: new Date().toISOString(),
      total_amount: grn.total_amount,
      supplier_id: grn.supplier,
    });
  }

  // Helper for return completion
  public async handleReturnCompletion(returnItem: PurchaseReturn, userId?: number) {
    this.triggerStatusChange('return', returnItem.id!, returnItem.status, 'completed', userId, {
      completed_by_id: userId,
      completed_at: new Date().toISOString(),
      total_return_value: returnItem.total_return_value,
    });
  }
}

// Export singleton instance
export const procurementWorkflowService = new ProcurementWorkflowService();
export default procurementWorkflowService;
