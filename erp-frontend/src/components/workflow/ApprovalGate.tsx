import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Send,
} from 'lucide-react';

// ApprovalGate Component
function ApprovalGate({ approval, onApprove, onReject, isProcessing }) {
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [approveHover, setApproveHover] = useState(false);
  const [commentHover, setCommentHover] = useState(false);
  const [rejectHover, setRejectHover] = useState(false);

  const handleApprove = () => {
    onApprove({ comment: comment || null });
    setComment('');
    setShowComment(false);
  };

  const handleReject = () => {
    if (!comment && showComment) {
      alert('Please provide a reason for rejection');
      return;
    }
    onReject({ comment: comment || 'Rejected by approver' });
    setComment('');
    setShowComment(false);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(to right, #fffbeb, #fef3c7)',
        border: '2px solid #fdba74',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#fed7aa',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AlertTriangle style={{ width: '24px', height: '24px', color: '#ea580c' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#78350f', marginBottom: '4px' }}>
            Approval Required
          </h3>
          <p style={{ color: '#b45309', fontSize: '14px' }}>
            This workflow is waiting for your approval to continue
          </p>
        </div>
      </div>

      {/* Approval Details */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563' }}>Step:</span>
          <span style={{ fontSize: '14px', color: '#111827' }}>{approval.step_name}</span>
        </div>

        {approval.amount && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563' }}>Amount:</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              ${approval.amount.toLocaleString()}
            </span>
          </div>
        )}

        {approval.requested_by && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563' }}>
              Requested by:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User style={{ width: '16px', height: '16px', color: '#6b7280' }} />
              <span style={{ fontSize: '14px', color: '#111827' }}>{approval.requested_by}</span>
            </div>
          </div>
        )}

        {approval.requested_at && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563' }}>Requested:</span>
            <span style={{ fontSize: '14px', color: '#111827' }}>
              {new Date(approval.requested_at).toLocaleString()}
            </span>
          </div>
        )}

        {approval.reason && (
          <div style={{ paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563', marginBottom: '4px' }}>
              Reason:
            </p>
            <p style={{ fontSize: '14px', color: '#111827' }}>{approval.reason}</p>
          </div>
        )}
      </div>

      {/* Comment Section */}
      {showComment && (
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '8px',
            }}
          >
            Comment {!showComment && '(Optional)'}
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              resize: 'none',
              outline: 'none',
            }}
            onFocus={e => {
              e.target.style.boxShadow = '0 0 0 2px #3b82f6';
              e.target.style.borderColor = 'transparent';
            }}
            onBlur={e => {
              e.target.style.boxShadow = 'none';
              e.target.style.borderColor = '#d1d5db';
            }}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleApprove}
          disabled={isProcessing}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: isProcessing ? '#9ca3af' : approveHover ? '#15803d' : '#16a34a',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            boxShadow: approveHover
              ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            opacity: isProcessing ? 0.5 : 1,
            outline: 'none',
          }}
          onMouseOver={() => !isProcessing && setApproveHover(true)}
          onMouseOut={() => setApproveHover(false)}
        >
          {isProcessing ? (
            <>
              <div
                style={{
                  animation: 'spin 1s linear infinite',
                  borderRadius: '50%',
                  height: '20px',
                  width: '20px',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                }}
              ></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <ThumbsUp style={{ width: '20px', height: '20px' }} />
              <span>Approve</span>
            </>
          )}
        </button>

        <button
          onClick={() => setShowComment(!showComment)}
          disabled={isProcessing}
          style={{
            padding: '12px 16px',
            border: '1px solid #d1d5db',
            backgroundColor: commentHover ? '#f9fafb' : 'white',
            borderRadius: '8px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.5 : 1,
            outline: 'none',
          }}
          onMouseOver={() => !isProcessing && setCommentHover(true)}
          onMouseOut={() => setCommentHover(false)}
        >
          <MessageSquare style={{ width: '20px', height: '20px', color: '#4b5563' }} />
        </button>

        <button
          onClick={handleReject}
          disabled={isProcessing}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: isProcessing ? '#9ca3af' : rejectHover ? '#b91c1c' : '#dc2626',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            boxShadow: rejectHover
              ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            opacity: isProcessing ? 0.5 : 1,
            outline: 'none',
          }}
          onMouseOver={() => !isProcessing && setRejectHover(true)}
          onMouseOut={() => setRejectHover(false)}
        >
          {isProcessing ? (
            <>
              <div
                style={{
                  animation: 'spin 1s linear infinite',
                  borderRadius: '50%',
                  height: '20px',
                  width: '20px',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                }}
              ></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <ThumbsDown style={{ width: '20px', height: '20px' }} />
              <span>Reject</span>
            </>
          )}
        </button>
      </div>

      {/* Helper Text */}
      {!showComment && (
        <p style={{ fontSize: '12px', color: '#b45309', textAlign: 'center', marginTop: '16px' }}>
          Click the message icon to add a comment to your decision
        </p>
      )}
    </div>
  );
}

// WorkflowTimeline Component
function WorkflowTimeline({ steps, currentStepIndex }) {
  const getStepStatus = index => {
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) return 'current';
    return 'pending';
  };

  const getStepIcon = (step, status) => {
    if (step.status === 'failed') {
      return <XCircle className="w-6 h-6 text-red-600" />;
    }
    if (status === 'completed' || step.status === 'completed') {
      return <CheckCircle className="w-6 h-6 text-green-600" />;
    }
    if (status === 'current' || step.status === 'running') {
      return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />;
    }
    return <Clock className="w-6 h-6 text-gray-400" />;
  };

  const getConnectorColor = index => {
    if (index < currentStepIndex) return 'bg-green-500';
    if (index === currentStepIndex) return 'bg-blue-500';
    return 'bg-gray-300';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Workflow Progress</h3>

      <div className="relative">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id || index} className="relative pb-8 last:pb-0">
              {/* Connector Line */}
              {!isLast && (
                <div
                  className={`absolute left-4 top-10 w-0.5 h-full -ml-px ${getConnectorColor(index)}`}
                />
              )}

              {/* Step Content */}
              <div className="relative flex items-start space-x-4">
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    step.status === 'failed'
                      ? 'bg-red-100'
                      : status === 'completed'
                        ? 'bg-green-100'
                        : status === 'current'
                          ? 'bg-blue-100'
                          : 'bg-gray-100'
                  }`}
                >
                  {getStepIcon(step, status)}
                </div>

                {/* Step Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          status === 'current' ? 'text-blue-900' : 'text-gray-900'
                        }`}
                      >
                        {step.step_name || step.name}
                      </p>

                      {step.description && (
                        <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                      )}

                      {/* Timestamps */}
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        {step.started_at && (
                          <span>Started: {new Date(step.started_at).toLocaleTimeString()}</span>
                        )}
                        {step.completed_at && (
                          <span>Completed: {new Date(step.completed_at).toLocaleTimeString()}</span>
                        )}
                        {step.duration && <span>Duration: {step.duration}s</span>}
                      </div>

                      {/* Error Message */}
                      {step.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                          {step.error}
                        </div>
                      )}

                      {/* Result Data */}
                      {step.result && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-700">
                          <span className="font-medium">Result: </span>
                          {typeof step.result === 'string'
                            ? step.result
                            : JSON.stringify(step.result)}
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`ml-4 px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                        step.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : step.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : step.status === 'running'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {step.status || status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Enhanced WorkflowStatusPage with ApprovalGate and Timeline
export default function EnhancedWorkflowStatus({ workflowId = '789' }) {
  const [workflow, setWorkflow] = useState({
    id: 789,
    name: 'Deposit Transaction Workflow',
    status: 'waiting_approval',
    progress: 60,
    currentStepIndex: 2,
    steps: [
      {
        id: 1,
        step_name: 'Validate Amount',
        status: 'completed',
        started_at: '2025-01-22T10:00:00Z',
        completed_at: '2025-01-22T10:00:01Z',
        duration: 1,
        result: 'Amount validated: ₦5000',
      },
      {
        id: 2,
        step_name: 'Check Account Balance',
        status: 'completed',
        started_at: '2025-01-22T10:00:01Z',
        completed_at: '2025-01-22T10:00:02Z',
        duration: 1,
        result: 'Sufficient balance',
      },
      {
        id: 3,
        step_name: 'Manager Approval Required',
        status: 'running',
        started_at: '2025-01-22T10:00:02Z',
        description: 'Waiting for manager approval for amounts over ₦1000',
      },
      {
        id: 4,
        step_name: 'Create Transaction',
        status: 'pending',
        description: 'Will execute after approval',
      },
      {
        id: 5,
        step_name: 'Send Notification',
        status: 'pending',
        description: 'Notify all parties',
      },
    ],
    approval: {
      step_name: 'Manager Approval',
      amount: 5000,
      requested_by: 'John Doe',
      requested_at: '2025-01-22T10:00:02Z',
      reason: 'Transaction amount exceeds automatic approval threshold ($1000)',
    },
  });

  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async data => {
    setIsProcessing(true);
    console.log('Approving with data:', data);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Update workflow to continue
    setWorkflow(prev => ({
      ...prev,
      status: 'running',
      progress: 80,
      currentStepIndex: 3,
      steps: prev.steps.map((step, index) => {
        if (index === 2) {
          return {
            ...step,
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: `Approved by manager${data.comment ? ': ' + data.comment : ''}`,
          };
        }
        if (index === 3) {
          return { ...step, status: 'running', started_at: new Date().toISOString() };
        }
        return step;
      }),
      approval: null,
    }));

    setIsProcessing(false);
  };

  const handleReject = async data => {
    setIsProcessing(true);
    console.log('Rejecting with data:', data);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Update workflow to failed
    setWorkflow(prev => ({
      ...prev,
      status: 'failed',
      currentStepIndex: 2,
      steps: prev.steps.map((step, index) => {
        if (index === 2) {
          return {
            ...step,
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: `Rejected by manager${data.comment ? ': ' + data.comment : ''}`,
          };
        }
        return step;
      }),
      approval: null,
    }));

    setIsProcessing(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{workflow.name}</h1>
          <span
            className={`px-4 py-2 rounded-full font-semibold text-sm ${
              workflow.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : workflow.status === 'waiting_approval'
                  ? 'bg-orange-100 text-orange-800'
                  : workflow.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
            }`}
          >
            {workflow.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="overflow-hidden h-3 text-xs flex rounded-full bg-gray-200">
            <div
              style={{ width: `${workflow.progress}%` }}
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                workflow.status === 'failed'
                  ? 'bg-red-500'
                  : workflow.status === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              }`}
            />
          </div>
          <p className="text-right text-xs text-gray-600 mt-1">{workflow.progress}% Complete</p>
        </div>
      </div>

      {/* Approval Gate */}
      {workflow.approval && (
        <ApprovalGate
          approval={workflow.approval}
          onApprove={handleApprove}
          onReject={handleReject}
          isProcessing={isProcessing}
        />
      )}

      {/* Workflow Timeline */}
      <WorkflowTimeline steps={workflow.steps} currentStepIndex={workflow.currentStepIndex} />
    </div>
  );
}

// Export individual components
export { ApprovalGate, WorkflowTimeline };
