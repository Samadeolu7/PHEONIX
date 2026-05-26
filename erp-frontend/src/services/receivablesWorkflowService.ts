// src/services/receivablesWorkflowService.ts
import { api } from './api';
import { automationService } from './automationService';
import { receivablesService } from './receivablesService';

export interface CollectionStage {
  id: string;
  name: string;
  days_overdue_threshold: number;
  auto_progress: boolean;
  actions: CollectionAction[];
  escalation_level: number;
}

export interface CollectionAction {
  id: string;
  type: 'send_reminder' | 'assign_collector' | 'escalate' | 'apply_interest' | 'legal_action';
  name: string;
  config: {
    template?: string;
    reminder_type?: string;
    collector_id?: number;
    interest_rate?: string;
    delay_days?: number;
  };
  auto_execute: boolean;
}

export interface EscalationRule {
  id: string;
  name: string;
  trigger_conditions: {
    days_overdue?: number;
    amount_threshold?: string;
    aging_bucket?: string;
    failed_contact_attempts?: number;
  };
  actions: CollectionAction[];
  is_active: boolean;
}

export interface WorkflowTrigger {
  id: string;
  name: string;
  event_type: 'aging_update' | 'payment_received' | 'invoice_overdue' | 'manual_trigger';
  conditions: Record<string, any>;
  workflow_template_id: number;
  is_active: boolean;
}

export interface CollectionWorkflowRun {
  id: number;
  receivable_id: number;
  workflow_template_id: number;
  current_stage: string;
  status: 'active' | 'completed' | 'paused' | 'failed';
  started_at: string;
  last_action_at?: string;
  next_action_date?: string;
  execution_log: Array<{
    timestamp: string;
    action: string;
    result: string;
    notes?: string;
  }>;
}

class ReceivablesWorkflowService {
  // ============= Collection Stages =============
  async getCollectionStages(): Promise<CollectionStage[]> {
    try {
      return await api.get('/receivables/collection-stages/');
    } catch (error) {
      // Return default stages if API not available
      return this.getDefaultCollectionStages();
    }
  }

  async createCollectionStage(stage: Omit<CollectionStage, 'id'>): Promise<CollectionStage> {
    return api.post('/receivables/collection-stages/', stage);
  }

  async updateCollectionStage(
    id: string,
    stage: Partial<CollectionStage>
  ): Promise<CollectionStage> {
    return api.put(`/receivables/collection-stages/${id}/`, stage);
  }

  async deleteCollectionStage(id: string): Promise<void> {
    await api.delete(`/receivables/collection-stages/${id}/`);
  }

  // ============= Escalation Rules =============
  async getEscalationRules(): Promise<EscalationRule[]> {
    try {
      return await api.get('/receivables/escalation-rules/');
    } catch (error) {
      // Return default rules if API not available
      return this.getDefaultEscalationRules();
    }
  }

  async createEscalationRule(rule: Omit<EscalationRule, 'id'>): Promise<EscalationRule> {
    return api.post('/receivables/escalation-rules/', rule);
  }

  async updateEscalationRule(id: string, rule: Partial<EscalationRule>): Promise<EscalationRule> {
    return api.put(`/receivables/escalation-rules/${id}/`, rule);
  }

  async deleteEscalationRule(id: string): Promise<void> {
    await api.delete(`/receivables/escalation-rules/${id}/`);
  }

  async activateEscalationRule(id: string): Promise<void> {
    await api.post(`/receivables/escalation-rules/${id}/activate/`, {});
  }

  async deactivateEscalationRule(id: string): Promise<void> {
    await api.post(`/receivables/escalation-rules/${id}/deactivate/`, {});
  }

  // ============= Workflow Triggers =============
  async getWorkflowTriggers(): Promise<WorkflowTrigger[]> {
    try {
      return await api.get('/receivables/workflow-triggers/');
    } catch (error) {
      // Return default triggers if API not available
      return this.getDefaultWorkflowTriggers();
    }
  }

  async createWorkflowTrigger(trigger: Omit<WorkflowTrigger, 'id'>): Promise<WorkflowTrigger> {
    return api.post('/receivables/workflow-triggers/', trigger);
  }

  async updateWorkflowTrigger(
    id: string,
    trigger: Partial<WorkflowTrigger>
  ): Promise<WorkflowTrigger> {
    return api.put(`/receivables/workflow-triggers/${id}/`, trigger);
  }

  async deleteWorkflowTrigger(id: string): Promise<void> {
    await api.delete(`/receivables/workflow-triggers/${id}/`);
  }

  // ============= Collection Workflow Runs =============
  async getCollectionWorkflowRuns(receivableId?: number): Promise<CollectionWorkflowRun[]> {
    const params = receivableId ? { receivable_id: receivableId } : {};
    try {
      return await api.get('/receivables/collection-workflows/', { params });
    } catch (error) {
      return [];
    }
  }

  async startCollectionWorkflow(
    receivableId: number,
    workflowTemplateId: number
  ): Promise<CollectionWorkflowRun> {
    return api.post('/receivables/collection-workflows/', {
      receivable_id: receivableId,
      workflow_template_id: workflowTemplateId,
    });
  }

  async pauseCollectionWorkflow(id: number): Promise<CollectionWorkflowRun> {
    return api.post(`/receivables/collection-workflows/${id}/pause/`, {});
  }

  async resumeCollectionWorkflow(id: number): Promise<CollectionWorkflowRun> {
    return api.post(`/receivables/collection-workflows/${id}/resume/`, {});
  }

  async stopCollectionWorkflow(id: number): Promise<CollectionWorkflowRun> {
    return api.post(`/receivables/collection-workflows/${id}/stop/`, {});
  }

  // ============= Aging Workflow Integration =============
  async triggerAgingWorkflows(): Promise<{ triggered_count: number; results: any[] }> {
    try {
      return await api.post('/receivables/trigger-aging-workflows/', {});
    } catch (error) {
      // Fallback: manually trigger workflows for overdue receivables
      return this.manualAgingWorkflowTrigger();
    }
  }

  async processOverdueReceivables(): Promise<{ processed_count: number; results: any[] }> {
    try {
      return await api.post('/receivables/process-overdue/', {});
    } catch (error) {
      // Fallback: manually process overdue receivables
      return this.manualOverdueProcessing();
    }
  }

  // ============= Workflow Template Management =============
  async getCollectionWorkflowTemplates(): Promise<any[]> {
    try {
      // Get workflows tagged for collections
      const workflows = await automationService.getWorkflows();
      return workflows.filter(
        w =>
          w.name.toLowerCase().includes('collection') ||
          w.name.toLowerCase().includes('receivable') ||
          w.description?.toLowerCase().includes('collection')
      );
    } catch (error) {
      return [];
    }
  }

  async createCollectionWorkflowTemplate(template: any): Promise<any> {
    // Create a workflow template specifically for collections
    const collectionTemplate = {
      ...template,
      name: `Collection: ${template.name}`,
      trigger_type: 'event' as const,
      trigger_config: {
        event_name: 'receivable_aging_update',
        filters: template.trigger_conditions || {},
      },
    };

    return automationService.createWorkflow(collectionTemplate);
  }

  // ============= Default Data Providers =============
  private getDefaultCollectionStages(): CollectionStage[] {
    return [
      {
        id: 'new',
        name: 'New Overdue',
        days_overdue_threshold: 1,
        auto_progress: true,
        escalation_level: 1,
        actions: [
          {
            id: 'first_reminder',
            type: 'send_reminder',
            name: 'Send First Reminder',
            config: { reminder_type: 'first_notice', template: 'first_reminder' },
            auto_execute: true,
          },
        ],
      },
      {
        id: 'first_reminder',
        name: 'First Reminder Sent',
        days_overdue_threshold: 7,
        auto_progress: true,
        escalation_level: 2,
        actions: [
          {
            id: 'second_reminder',
            type: 'send_reminder',
            name: 'Send Second Reminder',
            config: { reminder_type: 'second_notice', template: 'second_reminder' },
            auto_execute: true,
          },
        ],
      },
      {
        id: 'second_reminder',
        name: 'Second Reminder Sent',
        days_overdue_threshold: 14,
        auto_progress: true,
        escalation_level: 3,
        actions: [
          {
            id: 'assign_collector',
            type: 'assign_collector',
            name: 'Assign to Collector',
            config: {},
            auto_execute: true,
          },
        ],
      },
      {
        id: 'assigned',
        name: 'Assigned to Collector',
        days_overdue_threshold: 30,
        auto_progress: false,
        escalation_level: 4,
        actions: [
          {
            id: 'apply_interest',
            type: 'apply_interest',
            name: 'Apply Interest',
            config: { interest_rate: '1.5' },
            auto_execute: false,
          },
        ],
      },
      {
        id: 'escalated',
        name: 'Escalated',
        days_overdue_threshold: 60,
        auto_progress: false,
        escalation_level: 5,
        actions: [
          {
            id: 'legal_action',
            type: 'legal_action',
            name: 'Legal Action',
            config: {},
            auto_execute: false,
          },
        ],
      },
    ];
  }

  private getDefaultEscalationRules(): EscalationRule[] {
    return [
      {
        id: 'auto_reminder_rule',
        name: 'Automatic Reminder Rule',
        trigger_conditions: {
          days_overdue: 1,
          aging_bucket: '1-30',
        },
        actions: [
          {
            id: 'send_first_reminder',
            type: 'send_reminder',
            name: 'Send First Reminder',
            config: { reminder_type: 'first_notice' },
            auto_execute: true,
          },
        ],
        is_active: true,
      },
      {
        id: 'collector_assignment_rule',
        name: 'Collector Assignment Rule',
        trigger_conditions: {
          days_overdue: 14,
          aging_bucket: '1-30',
        },
        actions: [
          {
            id: 'assign_to_collector',
            type: 'assign_collector',
            name: 'Assign to Collector',
            config: {},
            auto_execute: true,
          },
        ],
        is_active: true,
      },
      {
        id: 'high_value_escalation',
        name: 'High Value Escalation',
        trigger_conditions: {
          days_overdue: 7,
          amount_threshold: '10000',
        },
        actions: [
          {
            id: 'escalate_immediately',
            type: 'escalate',
            name: 'Immediate Escalation',
            config: {},
            auto_execute: true,
          },
        ],
        is_active: true,
      },
    ];
  }

  private getDefaultWorkflowTriggers(): WorkflowTrigger[] {
    return [
      {
        id: 'aging_update_trigger',
        name: 'Aging Update Trigger',
        event_type: 'aging_update',
        conditions: {
          status: 'overdue',
          days_overdue_gte: 1,
        },
        workflow_template_id: 1, // Default collection workflow
        is_active: true,
      },
      {
        id: 'payment_received_trigger',
        name: 'Payment Received Trigger',
        event_type: 'payment_received',
        conditions: {
          payment_type: 'partial',
        },
        workflow_template_id: 2, // Payment follow-up workflow
        is_active: true,
      },
    ];
  }

  // ============= Manual Fallback Methods =============
  private async manualAgingWorkflowTrigger(): Promise<{ triggered_count: number; results: any[] }> {
    try {
      // Get overdue receivables
      const overdueReceivables = await receivablesService.getReceivables({
        status: 'overdue',
      });

      const results = [];
      let triggered_count = 0;

      for (const receivable of overdueReceivables.results || []) {
        try {
          // Check if workflow should be triggered based on aging
          const shouldTrigger = this.shouldTriggerWorkflow(receivable);

          if (shouldTrigger) {
            // Start collection workflow
            const workflowRun = await this.startCollectionWorkflow(
              receivable.id,
              1 // Default collection workflow template ID
            );
            results.push({ receivable_id: receivable.id, workflow_run: workflowRun });
            triggered_count++;
          }
        } catch (error) {
          results.push({
            receivable_id: receivable.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { triggered_count, results };
    } catch (error) {
      throw new Error(
        `Failed to trigger aging workflows: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async manualOverdueProcessing(): Promise<{ processed_count: number; results: any[] }> {
    try {
      // Get all receivables that need aging update
      const receivables = await receivablesService.getReceivables({
        status: 'pending',
      });

      const results = [];
      let processed_count = 0;

      for (const receivable of receivables.results || []) {
        try {
          // Update aging for each receivable
          await receivablesService.updateAging(receivable.id);

          // Check if it became overdue and needs workflow trigger
          const updatedReceivable = await receivablesService.getReceivable(receivable.id);

          if (updatedReceivable.status === 'overdue') {
            // Trigger collection workflow
            await this.startCollectionWorkflow(receivable.id, 1);
          }

          results.push({ receivable_id: receivable.id, status: 'processed' });
          processed_count++;
        } catch (error) {
          results.push({
            receivable_id: receivable.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { processed_count, results };
    } catch (error) {
      throw new Error(
        `Failed to process overdue receivables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private shouldTriggerWorkflow(receivable: any): boolean {
    // Check if receivable meets criteria for workflow trigger
    return (
      receivable.status === 'overdue' && receivable.days_overdue >= 1 && !receivable.assigned_to // Not already assigned to collector
    );
  }

  // ============= Utility Methods =============
  async executeCollectionAction(receivableId: number, action: CollectionAction): Promise<any> {
    switch (action.type) {
      case 'send_reminder':
        return receivablesService.sendReminder(receivableId, {
          reminder_type: action.config.reminder_type || 'general',
          template: action.config.template || 'default',
        });

      case 'assign_collector':
        if (action.config.collector_id) {
          return receivablesService.assignCollector(receivableId, {
            assigned_to: action.config.collector_id,
            notes: `Auto-assigned via collection workflow`,
          });
        }
        break;

      case 'apply_interest':
        return receivablesService.applyInterest(receivableId);

      case 'escalate':
        return receivablesService.addNote(receivableId, {
          note: `Escalated via automated workflow - ${action.name}`,
        });

      default:
        throw new Error(`Unknown collection action type: ${action.type}`);
    }
  }

  async getWorkflowStatus(receivableId: number): Promise<{
    has_active_workflow: boolean;
    current_stage?: string;
    next_action_date?: string;
    workflow_runs: CollectionWorkflowRun[];
  }> {
    try {
      const workflowRuns = await this.getCollectionWorkflowRuns(receivableId);
      const activeRuns = workflowRuns.filter(run => run.status === 'active');

      return {
        has_active_workflow: activeRuns.length > 0,
        current_stage: activeRuns[0]?.current_stage,
        next_action_date: activeRuns[0]?.next_action_date,
        workflow_runs: workflowRuns,
      };
    } catch (error) {
      return {
        has_active_workflow: false,
        workflow_runs: [],
      };
    }
  }
}

export const receivablesWorkflowService = new ReceivablesWorkflowService();
