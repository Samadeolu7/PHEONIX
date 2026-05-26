import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

function StepStatus({ step, index }: any) {
  const getIcon = () => {
    switch ((step as any).status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getBorderColor = () => {
    switch ((step as any).status) {
      case 'completed':
        return 'border-green-500';
      case 'running':
        return 'border-blue-500';
      case 'failed':
        return 'border-red-500';
      default:
        return 'border-gray-300';
    }
  };

  return (
    <div className={`border-l-4 ${getBorderColor()} pl-4 py-3 mb-3 bg-white rounded-r-lg`}>
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">{getIcon()}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">
              {index + 1}. {(step as any).step_name}
            </h3>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                (step as any).status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : (step as any).status === 'running'
                    ? 'bg-blue-100 text-blue-800'
                    : (step as any).status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-600'
              }`}
            >
              {(step as any).status}
            </span>
          </div>
          {(step as any).error && (
            <p className="mt-1 text-sm text-red-600">{(step as any).error}</p>
          )}
          {(step as any).completed_at && (
            <p className="mt-1 text-xs text-gray-500">
              Completed at {new Date((step as any).completed_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const WorkflowStatusPage = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflow();

    // Poll every second while running
    const interval = setInterval(() => {
      if (run && (run.status === 'running' || run.status === 'pending')) {
        fetchWorkflow();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [workflowId, run?.status]);

  const fetchWorkflow = async () => {
    try {
      const response = await api.get(`/workflow-runs/${workflowId}/`);
      const payload = response.data || response;
      setRun(payload.data || payload);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow status');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workflow status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Workflow</h3>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-6">
        <p className="text-center text-gray-500">Workflow not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {(run as any).workflow_template.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">Workflow ID: {(run as any).id}</p>
          </div>
          <div
            className={`px-4 py-2 rounded-full font-semibold ${
              (run as any).status === 'completed'
                ? 'bg-green-100 text-green-800'
                : (run as any).status === 'running'
                  ? 'bg-blue-100 text-blue-800 animate-pulse'
                  : (run as any).status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
            }`}
          >
            {(run as any).status === 'running' ? '⟳ Running' : (run as any).status.toUpperCase()}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
            <div
              style={{ width: `${(run as any).progress_percent}%` }}
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                (run as any).status === 'completed'
                  ? 'bg-green-500'
                  : (run as any).status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              }`}
            />
          </div>
          <p className="text-right text-xs text-gray-600 mt-1">
            {(run as any).progress_percent}% Complete
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-gray-50 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Execution Steps</h2>
        <div>
          {(run as any).step_results.map((step: any, index: number) => (
            <StepStatus key={(step as any).id} step={step} index={index} />
          ))}
        </div>
      </div>

      {/* Success Result */}
      {run.status === 'completed' && run.result_data && (
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <h2 className="text-xl font-bold text-green-900">
              Transaction Completed Successfully!
            </h2>
          </div>

          <div className="space-y-2 text-green-900">
            {run.result_data.reference_number && (
              <p className="text-lg">
                <span className="font-semibold">Reference:</span>{' '}
                <span className="font-mono">{run.result_data.reference_number}</span>
              </p>
            )}
            {run.result_data.new_balance !== undefined && (
              <p className="text-2xl font-bold">
                New Balance: ${run.result_data.new_balance.toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex space-x-3 mt-6">
            {run.result_data.transaction_id && (
              <button
                onClick={() => navigate(`/transactions/${run.result_data.transaction_id}`)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                View Transaction
              </button>
            )}
            {run.result_data.account_id && (
              <button
                onClick={() => navigate(`/accounts/${run.result_data.account_id}`)}
                className="px-4 py-2 bg-white text-green-600 border-2 border-green-600 rounded-lg hover:bg-green-50 transition-colors flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Account</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Failure Result */}
      {run.status === 'failed' && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
            <h2 className="text-xl font-bold text-red-900">Transaction Failed</h2>
          </div>
          {run.error && <p className="text-red-800 mb-4">{run.error}</p>}
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
        </div>
      )}
    </div>
  );
};
//   return (
//     <div className="space-y-6">
//       {/* Approval Gate (if waiting for approval) */}
//       {workflow.status === 'waiting_approval' && workflow.approval && (
//         <ApprovalGate
//           approval={workflow.approval}
//           onApprove={handleApprove}
//           onReject={handleReject}
//           isProcessing={approving}
//         />
//       )}

//       {/* Workflow Timeline */}
//       <WorkflowTimeline
//         steps={workflow.steps}
//         currentStepIndex={workflow.currentStepIndex}
//       />
//     </div>
//   );
// };
// Example usage:
// <WorkflowStatusPage workflowId="789" />
