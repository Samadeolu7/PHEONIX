// src/hooks/useReceivablesWorkflow.ts
import { useState, useEffect, useCallback } from 'react';
import {
  receivablesWorkflowService,
  CollectionStage,
  EscalationRule,
  WorkflowTrigger,
  CollectionWorkflowRun,
} from '../services/receivablesWorkflowService';

export interface UseReceivablesWorkflowOptions {
  receivableId?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const useReceivablesWorkflow = (options: UseReceivablesWorkflowOptions = {}) => {
  const { receivableId, autoRefresh = false, refreshInterval = 30000 } = options;

  const [collectionStages, setCollectionStages] = useState<CollectionStage[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [workflowTriggers, setWorkflowTriggers] = useState<WorkflowTrigger[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<CollectionWorkflowRun[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load collection stages
  const loadCollectionStages = useCallback(async () => {
    try {
      setLoading(true);
      const stages = await receivablesWorkflowService.getCollectionStages();
      setCollectionStages(stages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection stages');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load escalation rules
  const loadEscalationRules = useCallback(async () => {
    try {
      setLoading(true);
      const rules = await receivablesWorkflowService.getEscalationRules();
      setEscalationRules(rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load escalation rules');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load workflow triggers
  const loadWorkflowTriggers = useCallback(async () => {
    try {
      setLoading(true);
      const triggers = await receivablesWorkflowService.getWorkflowTriggers();
      setWorkflowTriggers(triggers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow triggers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load workflow runs
  const loadWorkflowRuns = useCallback(async () => {
    try {
      setLoading(true);
      const runs = await receivablesWorkflowService.getCollectionWorkflowRuns(receivableId);
      setWorkflowRuns(runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow runs');
    } finally {
      setLoading(false);
    }
  }, [receivableId]);

  // Load workflow status for specific receivable
  const loadWorkflowStatus = useCallback(async () => {
    if (!receivableId) return;

    try {
      const status = await receivablesWorkflowService.getWorkflowStatus(receivableId);
      setWorkflowStatus(status);
    } catch (err) {
      console.error('Failed to load workflow status:', err);
    }
  }, [receivableId]);

  // Start collection workflow
  const startCollectionWorkflow = useCallback(
    async (workflowTemplateId: number) => {
      if (!receivableId) throw new Error('Receivable ID is required');

      try {
        setLoading(true);
        const workflowRun = await receivablesWorkflowService.startCollectionWorkflow(
          receivableId,
          workflowTemplateId
        );
        await loadWorkflowRuns();
        await loadWorkflowStatus();
        return workflowRun;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to start workflow';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [receivableId, loadWorkflowRuns, loadWorkflowStatus]
  );

  // Pause collection workflow
  const pauseCollectionWorkflow = useCallback(
    async (workflowRunId: number) => {
      try {
        setLoading(true);
        const result = await receivablesWorkflowService.pauseCollectionWorkflow(workflowRunId);
        await loadWorkflowRuns();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to pause workflow';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadWorkflowRuns]
  );

  // Resume collection workflow
  const resumeCollectionWorkflow = useCallback(
    async (workflowRunId: number) => {
      try {
        setLoading(true);
        const result = await receivablesWorkflowService.resumeCollectionWorkflow(workflowRunId);
        await loadWorkflowRuns();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to resume workflow';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadWorkflowRuns]
  );

  // Stop collection workflow
  const stopCollectionWorkflow = useCallback(
    async (workflowRunId: number) => {
      try {
        setLoading(true);
        const result = await receivablesWorkflowService.stopCollectionWorkflow(workflowRunId);
        await loadWorkflowRuns();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to stop workflow';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadWorkflowRuns]
  );

  // Trigger aging workflows
  const triggerAgingWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const result = await receivablesWorkflowService.triggerAgingWorkflows();
      await loadWorkflowRuns();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to trigger aging workflows';
      setError(error);
      throw new Error(error);
    } finally {
      setLoading(false);
    }
  }, [loadWorkflowRuns]);

  // Process overdue receivables
  const processOverdueReceivables = useCallback(async () => {
    try {
      setLoading(true);
      const result = await receivablesWorkflowService.processOverdueReceivables();
      await loadWorkflowRuns();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to process overdue receivables';
      setError(error);
      throw new Error(error);
    } finally {
      setLoading(false);
    }
  }, [loadWorkflowRuns]);

  // Create collection stage
  const createCollectionStage = useCallback(
    async (stage: Omit<CollectionStage, 'id'>) => {
      try {
        setLoading(true);
        const newStage = await receivablesWorkflowService.createCollectionStage(stage);
        await loadCollectionStages();
        return newStage;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to create collection stage';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadCollectionStages]
  );

  // Update collection stage
  const updateCollectionStage = useCallback(
    async (id: string, stage: Partial<CollectionStage>) => {
      try {
        setLoading(true);
        const updatedStage = await receivablesWorkflowService.updateCollectionStage(id, stage);
        await loadCollectionStages();
        return updatedStage;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to update collection stage';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadCollectionStages]
  );

  // Create escalation rule
  const createEscalationRule = useCallback(
    async (rule: Omit<EscalationRule, 'id'>) => {
      try {
        setLoading(true);
        const newRule = await receivablesWorkflowService.createEscalationRule(rule);
        await loadEscalationRules();
        return newRule;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to create escalation rule';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadEscalationRules]
  );

  // Update escalation rule
  const updateEscalationRule = useCallback(
    async (id: string, rule: Partial<EscalationRule>) => {
      try {
        setLoading(true);
        const updatedRule = await receivablesWorkflowService.updateEscalationRule(id, rule);
        await loadEscalationRules();
        return updatedRule;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to update escalation rule';
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadEscalationRules]
  );

  // Activate/deactivate escalation rule
  const toggleEscalationRule = useCallback(
    async (id: string, activate: boolean) => {
      try {
        setLoading(true);
        if (activate) {
          await receivablesWorkflowService.activateEscalationRule(id);
        } else {
          await receivablesWorkflowService.deactivateEscalationRule(id);
        }
        await loadEscalationRules();
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : `Failed to ${activate ? 'activate' : 'deactivate'} escalation rule`;
        setError(error);
        throw new Error(error);
      } finally {
        setLoading(false);
      }
    },
    [loadEscalationRules]
  );

  // Load all data
  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadCollectionStages(),
      loadEscalationRules(),
      loadWorkflowTriggers(),
      loadWorkflowRuns(),
    ]);

    if (receivableId) {
      await loadWorkflowStatus();
    }
  }, [
    loadCollectionStages,
    loadEscalationRules,
    loadWorkflowTriggers,
    loadWorkflowRuns,
    loadWorkflowStatus,
    receivableId,
  ]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        loadWorkflowRuns();
        if (receivableId) {
          loadWorkflowStatus();
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, loadWorkflowRuns, loadWorkflowStatus, receivableId]);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return {
    // State
    collectionStages,
    escalationRules,
    workflowTriggers,
    workflowRuns,
    workflowStatus,
    loading,
    error,

    // Actions
    loadCollectionStages,
    loadEscalationRules,
    loadWorkflowTriggers,
    loadWorkflowRuns,
    loadWorkflowStatus,
    loadAllData,

    // Workflow management
    startCollectionWorkflow,
    pauseCollectionWorkflow,
    resumeCollectionWorkflow,
    stopCollectionWorkflow,

    // Bulk operations
    triggerAgingWorkflows,
    processOverdueReceivables,

    // Configuration management
    createCollectionStage,
    updateCollectionStage,
    createEscalationRule,
    updateEscalationRule,
    toggleEscalationRule,

    // Utilities
    clearError: () => setError(null),
  };
};
