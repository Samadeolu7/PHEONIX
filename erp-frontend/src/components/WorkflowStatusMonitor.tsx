import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Clock, Loader2, ExternalLink } from 'lucide-react';
import { api } from '../services/api';

interface WorkflowStatusMonitorProps {
  submissionId: number;
  submissionReference: string;
  onComplete?: (data: any) => void;
  onError?: (error: any) => void;
}

interface WorkflowStatus {
  status: 'no_workflow' | 'success';
  submission_reference: string;
  workflow?: {
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    run_reference: string;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    error_message: string;
    error_step_id: string;
    execution_log: Array<{
      step_id: string;
      status: string;
      timestamp: string;
      error?: string;
    }>;
    transactions: Array<{
      id: number;
      reference_number: string;
      date: string;
      description: string;
      approved: boolean;
    }>;
  };
}

export const WorkflowStatusMonitor: React.FC<WorkflowStatusMonitorProps> = ({
  submissionId,
  submissionReference,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState(0);

  const checkStatus = useCallback(async () => {
    try {
      const response = await api.get(
        `/automations/form-submissions/${submissionId}/workflow-status/`
      );
      const data = response.data as WorkflowStatus;

      setStatus(data);
      setLoading(false);

      // If workflow completed or failed, stop polling
      if (data.workflow?.status === 'completed') {
        if (onComplete) {
          onComplete(data);
        }
        return true; // Stop polling
      }

      if (data.workflow?.status === 'failed') {
        if (onError && data.workflow) {
          onError(data.workflow.error_message || 'Workflow failed');
        }
        return true; // Stop polling
      }

      return false; // Continue polling
    } catch (err: any) {
      setError(err.message || 'Failed to check workflow status');
      setLoading(false);
      return true; // Stop polling on error
    }
  }, [submissionId, onComplete, onError]);

  useEffect(() => {
    // Initial check
    checkStatus();

    // Poll every 2 seconds for up to 30 seconds
    const maxPolls = 15;
    const pollInterval = 2000;

    const interval = setInterval(async () => {
      if (pollingCount >= maxPolls) {
        clearInterval(interval);
        return;
      }

      const shouldStop = await checkStatus();
      if (shouldStop) {
        clearInterval(interval);
        return;
      }

      setPollingCount(prev => prev + 1);
    }, pollInterval);

    return () => clearInterval(interval);
  }, [checkStatus, pollingCount]);

  if (loading && !status) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 text-lg mb-1">
              Checking Workflow Status...
            </h3>
            <p className="text-blue-700 text-sm">
              Verifying that your submission is being processed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 text-lg mb-1">Status Check Failed</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!status?.workflow) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900 text-lg mb-1">No Workflow Triggered</h3>
            <p className="text-yellow-700 text-sm">
              No automated workflow was configured for this form submission.
            </p>
            <p className="text-yellow-600 text-xs mt-2">Reference: {submissionReference}</p>
          </div>
        </div>
      </div>
    );
  }

  const workflow = status.workflow;

  // Workflow is still running
  if (workflow.status === 'queued' || workflow.status === 'running') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 text-lg mb-1">
              Workflow {workflow.status === 'queued' ? 'Queued' : 'Processing'}...
            </h3>
            <p className="text-blue-700 text-sm mb-3">
              Your submission is being processed by our automation system.
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <Clock className="w-4 h-4" />
                <span>Workflow: {workflow.run_reference}</span>
              </div>
              {workflow.execution_log && workflow.execution_log.length > 0 && (
                <div className="mt-3 space-y-1">
                  {workflow.execution_log.map((log, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-xs text-blue-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                      <span>
                        Step {log.step_id}: {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Workflow completed successfully
  if (workflow.status === 'completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <div className="bg-green-100 p-2 rounded-lg">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 text-lg mb-1">Workflow Completed!</h3>
            <p className="text-green-700 text-sm mb-3">
              All automation steps executed successfully.
            </p>

            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Workflow: {workflow.run_reference}</span>
              </div>
              {workflow.duration_ms && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <Clock className="w-4 h-4" />
                  <span>Duration: {(workflow.duration_ms / 1000).toFixed(2)}s</span>
                </div>
              )}
            </div>

            {/* Show created transactions */}
            {workflow.transactions && workflow.transactions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-green-200">
                <h4 className="font-semibold text-green-900 text-sm mb-2">Created Transactions:</h4>
                <div className="space-y-2">
                  {workflow.transactions.map(txn => (
                    <div key={txn.id} className="bg-white rounded-lg p-3 border border-green-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-green-900 text-sm">
                            {txn.reference_number}
                          </div>
                          <div className="text-green-700 text-xs mt-1">{txn.description}</div>
                          <div className="text-green-600 text-xs mt-1">
                            {txn.date} • {txn.approved ? 'Posted' : 'Draft'}
                          </div>
                        </div>
                        <a
                          href={`/transactions/${txn.id}`}
                          className="text-green-600 hover:text-green-800 flex items-center space-x-1 text-xs"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Show execution log */}
            {workflow.execution_log && workflow.execution_log.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-green-700 hover:text-green-900 font-medium">
                  View Execution Details
                </summary>
                <div className="mt-2 space-y-1 pl-4">
                  {workflow.execution_log.map((log, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-xs text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      <span>
                        {log.step_id}: {log.status} at{' '}
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Workflow failed
  if (workflow.status === 'failed') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 text-lg mb-1">Workflow Failed</h3>
            <p className="text-red-700 text-sm mb-3">
              An error occurred while processing your submission.
            </p>

            {workflow.error_message && (
              <div className="bg-red-100 rounded-lg p-3 mb-3">
                <p className="text-red-800 text-sm font-mono">{workflow.error_message}</p>
                {workflow.error_step_id && (
                  <p className="text-red-600 text-xs mt-2">
                    Failed at step: {workflow.error_step_id}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>Workflow: {workflow.run_reference}</span>
              </div>
            </div>

            {/* Show execution log */}
            {workflow.execution_log && workflow.execution_log.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-red-700 hover:text-red-900 font-medium">
                  View Execution Log
                </summary>
                <div className="mt-2 space-y-1 pl-4">
                  {workflow.execution_log.map((log, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center space-x-2 text-xs ${
                        log.status === 'failed' || log.status === 'error'
                          ? 'text-red-600'
                          : 'text-red-400'
                      }`}
                    >
                      {log.status === 'failed' || log.status === 'error' ? (
                        <AlertCircle className="w-3 h-3" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      <span>
                        {log.step_id}: {log.status}
                        {log.error && ` - ${log.error}`}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-4 pt-4 border-t border-red-200">
              <p className="text-red-700 text-sm">
                Please contact support if this issue persists. Reference: {submissionReference}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default WorkflowStatusMonitor;
