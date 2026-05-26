// src/components/receivables/WorkflowStatusIndicator.tsx
import React, { useEffect, useState } from 'react';
import { Play, Pause, CheckCircle, AlertTriangle, Clock, Settings, RefreshCw } from 'lucide-react';
import { receivablesWorkflowService } from '../../services/receivablesWorkflowService';

interface WorkflowStatusIndicatorProps {
  receivableId: number;
  className?: string;
  showDetails?: boolean;
  onWorkflowAction?: (action: string, workflowId?: number) => void;
}

export const WorkflowStatusIndicator: React.FC<WorkflowStatusIndicatorProps> = ({
  receivableId,
  className = '',
  showDetails = false,
  onWorkflowAction,
}) => {
  const [workflowStatus, setWorkflowStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflowStatus();
  }, [receivableId]);

  const loadWorkflowStatus = async () => {
    try {
      setLoading(true);
      const status = await receivablesWorkflowService.getWorkflowStatus(receivableId);
      setWorkflowStatus(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow status');
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkflow = async () => {
    try {
      await receivablesWorkflowService.startCollectionWorkflow(receivableId, 1); // Default workflow
      await loadWorkflowStatus();
      onWorkflowAction?.('start');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow');
    }
  };

  const handlePauseWorkflow = async (workflowId: number) => {
    try {
      await receivablesWorkflowService.pauseCollectionWorkflow(workflowId);
      await loadWorkflowStatus();
      onWorkflowAction?.('pause', workflowId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause workflow');
    }
  };

  const handleResumeWorkflow = async (workflowId: number) => {
    try {
      await receivablesWorkflowService.resumeCollectionWorkflow(workflowId);
      await loadWorkflowStatus();
      onWorkflowAction?.('resume', workflowId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume workflow');
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-600">Workflow Error</span>
      </div>
    );
  }

  if (!workflowStatus?.has_active_workflow) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={handleStartWorkflow}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          title="Start collection workflow"
        >
          <Play className="w-3 h-3" />
          Start Workflow
        </button>
      </div>
    );
  }

  const activeRun = workflowStatus.workflow_runs.find((run: any) => run.status === 'active');

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-green-700">Active Workflow</span>
        </div>

        {activeRun && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePauseWorkflow(activeRun.id)}
              className="p-1 text-yellow-600 hover:text-yellow-700"
              title="Pause workflow"
            >
              <Pause className="w-3 h-3" />
            </button>
            <button
              onClick={() => onWorkflowAction?.('configure', activeRun.id)}
              className="p-1 text-gray-600 hover:text-gray-700"
              title="Configure workflow"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {showDetails && workflowStatus.current_stage && (
        <div className="text-xs text-gray-600">
          <div>Stage: {workflowStatus.current_stage}</div>
          {workflowStatus.next_action_date && (
            <div className="flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" />
              Next: {new Date(workflowStatus.next_action_date).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {showDetails && workflowStatus.workflow_runs.length > 0 && (
        <div className="space-y-1">
          {workflowStatus.workflow_runs.slice(0, 3).map((run: any) => (
            <div key={run.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">
                Run #{run.id} - {run.current_stage}
              </span>
              <div className="flex items-center gap-1">
                <span
                  className={`px-1 py-0.5 rounded text-xs ${
                    run.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : run.status === 'completed'
                        ? 'bg-blue-100 text-blue-700'
                        : run.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                  }`}
                >
                  {run.status}
                </span>

                {run.status === 'paused' && (
                  <button
                    onClick={() => handleResumeWorkflow(run.id)}
                    className="p-0.5 text-green-600 hover:text-green-700"
                    title="Resume workflow"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowStatusIndicator;
