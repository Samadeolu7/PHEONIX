import React from 'react';
import {
  Workflow,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  User,
  Calendar,
  Activity,
} from 'lucide-react';
import { PurchaseRequisition } from '../../types/procurement';

interface WorkflowStatusDisplayProps {
  requisition: PurchaseRequisition;
  className?: string;
}

interface WorkflowStatusInfo {
  type: 'manual' | 'workflow';
  status: string;
  statusColor: string;
  statusIcon: React.ComponentType<{ size?: number }>;
  workflowRunId?: number;
  approvalInboxUrl?: string;
  description: string;
}

const WorkflowStatusDisplay: React.FC<WorkflowStatusDisplayProps> = ({
  requisition,
  className = '',
}) => {
  const getWorkflowStatusInfo = (): WorkflowStatusInfo => {
    const hasWorkflowRunId = requisition.workflow_run_id && requisition.workflow_run_id > 0;

    if (hasWorkflowRunId) {
      // Automated workflow process
      return {
        type: 'workflow',
        status: requisition.workflow_status || requisition.status,
        statusColor: getWorkflowStatusColor(requisition.workflow_status || requisition.status),
        statusIcon: getWorkflowStatusIcon(requisition.workflow_status || requisition.status),
        workflowRunId: requisition.workflow_run_id,
        approvalInboxUrl: `/approvals/inbox?workflow_run_id=${requisition.workflow_run_id}`,
        description: getWorkflowDescription(
          requisition.workflow_status || requisition.status,
          true
        ),
      };
    } else {
      // Manual approval process
      return {
        type: 'manual',
        status: requisition.status,
        statusColor: getManualStatusColor(requisition.status),
        statusIcon: getManualStatusIcon(requisition.status),
        description: getWorkflowDescription(requisition.status, false),
      };
    }
  };

  const getWorkflowStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'draft':
        return '#6b7280'; // gray
      case 'submitted':
      case 'pending':
        return '#f59e0b'; // amber
      case 'in_progress':
      case 'under_review':
        return '#3b82f6'; // blue
      case 'approved':
        return '#10b981'; // emerald
      case 'rejected':
      case 'failed':
        return '#ef4444'; // red
      case 'po_created':
      case 'completed':
        return '#8b5cf6'; // violet
      case 'cancelled':
        return '#6b7280'; // gray
      default:
        return '#6b7280'; // gray
    }
  };

  const getManualStatusColor = (status: string): string => {
    switch (status) {
      case 'draft':
        return '#6b7280'; // gray
      case 'submitted':
        return '#f59e0b'; // amber
      case 'approved':
        return '#10b981'; // emerald
      case 'rejected':
        return '#ef4444'; // red
      case 'po_created':
        return '#8b5cf6'; // violet
      case 'cancelled':
        return '#6b7280'; // gray
      default:
        return '#6b7280'; // gray
    }
  };

  const getWorkflowStatusIcon = (status: string): React.ComponentType<{ size?: number }> => {
    switch (status.toLowerCase()) {
      case 'draft':
        return AlertCircle;
      case 'submitted':
      case 'pending':
      case 'in_progress':
      case 'under_review':
        return Clock;
      case 'approved':
      case 'completed':
        return CheckCircle;
      case 'rejected':
      case 'failed':
        return XCircle;
      case 'po_created':
        return CheckCircle;
      case 'cancelled':
        return XCircle;
      default:
        return AlertCircle;
    }
  };

  const getManualStatusIcon = (status: string): React.ComponentType<{ size?: number }> => {
    switch (status) {
      case 'draft':
        return AlertCircle;
      case 'submitted':
        return Clock;
      case 'approved':
        return CheckCircle;
      case 'rejected':
        return XCircle;
      case 'po_created':
        return CheckCircle;
      case 'cancelled':
        return XCircle;
      default:
        return AlertCircle;
    }
  };

  const getWorkflowDescription = (status: string, isWorkflow: boolean): string => {
    if (isWorkflow) {
      switch (status.toLowerCase()) {
        case 'draft':
          return 'Requisition is in draft state';
        case 'submitted':
          return 'Submitted to automated workflow system for processing';
        case 'pending':
          return 'Pending approval in automated workflow';
        case 'in_progress':
          return 'Currently being processed by workflow system';
        case 'under_review':
          return 'Under review by automated workflow approvers';
        case 'approved':
          return 'Approved through automated workflow system';
        case 'rejected':
          return 'Rejected by automated workflow system';
        case 'failed':
          return 'Workflow processing failed - manual intervention required';
        case 'po_created':
          return 'Purchase order created successfully';
        case 'completed':
          return 'Workflow process completed successfully';
        case 'cancelled':
          return 'Workflow process was cancelled';
        default:
          return 'Workflow status unknown';
      }
    } else {
      switch (status) {
        case 'draft':
          return 'Requisition is saved as draft';
        case 'submitted':
          return 'Submitted for manual approval';
        case 'approved':
          return 'Approved through manual process';
        case 'rejected':
          return 'Rejected during manual review';
        case 'po_created':
          return 'Purchase order created successfully';
        case 'cancelled':
          return 'Requisition was cancelled';
        default:
          return 'Status unknown';
      }
    }
  };

  const formatWorkflowRunId = (runId: number): string => {
    return `WF-${runId.toString().padStart(6, '0')}`;
  };

  const workflowInfo = getWorkflowStatusInfo();
  const StatusIcon = workflowInfo.statusIcon;

  return (
    <div className={`workflow-status-display ${className}`}>
      <div
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: `${workflowInfo.statusColor}20`,
              color: workflowInfo.statusColor,
            }}
          >
            {workflowInfo.type === 'workflow' ? <Workflow size={20} /> : <User size={20} />}
          </div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                margin: '0 0 4px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
              }}
            >
              {workflowInfo.type === 'workflow' ? 'Automated Workflow' : 'Manual Approval Process'}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                color: '#6b7280',
              }}
            >
              {workflowInfo.description}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '20px',
              background: `${workflowInfo.statusColor}20`,
              color: workflowInfo.statusColor,
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <StatusIcon size={16} />
            {workflowInfo.status.charAt(0).toUpperCase() +
              workflowInfo.status.slice(1).replace('_', ' ')}
          </div>
        </div>

        {/* Workflow Details */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: '#6b7280' }} />
            <div>
              <p
                style={{
                  margin: '0 0 2px 0',
                  fontSize: '11px',
                  color: '#6b7280',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                }}
              >
                Process Type
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#1f2937',
                  fontWeight: 500,
                }}
              >
                {workflowInfo.type === 'workflow' ? 'Automated Workflow' : 'Manual Approval'}
              </p>
            </div>
          </div>

          {workflowInfo.workflowRunId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Workflow size={16} style={{ color: '#6b7280' }} />
              <div>
                <p
                  style={{
                    margin: '0 0 2px 0',
                    fontSize: '11px',
                    color: '#6b7280',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                  }}
                >
                  Workflow Run ID
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#1f2937',
                    fontWeight: 500,
                    fontFamily: 'monospace',
                  }}
                >
                  {formatWorkflowRunId(workflowInfo.workflowRunId)}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: '#6b7280' }} />
            <div>
              <p
                style={{
                  margin: '0 0 2px 0',
                  fontSize: '11px',
                  color: '#6b7280',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                }}
              >
                Last Updated
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#1f2937',
                  fontWeight: 500,
                }}
              >
                {new Date(requisition.updated_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Action Links */}
        {workflowInfo.approvalInboxUrl && (
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '16px',
            }}
          >
            <a
              href={workflowInfo.approvalInboxUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: `1px solid ${workflowInfo.statusColor}`,
                borderRadius: '8px',
                background: 'white',
                color: workflowInfo.statusColor,
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${workflowInfo.statusColor}10`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'white';
              }}
            >
              <ExternalLink size={16} />
              View in Approval Inbox
            </a>
          </div>
        )}

        {/* Workflow Progress Indicator */}
        {workflowInfo.type === 'workflow' && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <Activity size={16} style={{ color: '#6b7280' }} />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Workflow Progress
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {/* Progress steps visualization */}
              {['submitted', 'in_progress', 'approved'].map((step, index) => {
                const isActive = getStepStatus(step, workflowInfo.status);
                const isCompleted = isStepCompleted(step, workflowInfo.status);

                return (
                  <React.Fragment key={step}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: isCompleted ? '#10b981' : isActive ? '#3b82f6' : '#e5e7eb',
                        color: isCompleted || isActive ? 'white' : '#6b7280',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    {index < 2 && (
                      <div
                        style={{
                          width: '32px',
                          height: '2px',
                          background: isStepCompleted(
                            ['submitted', 'in_progress', 'approved'][index + 1],
                            workflowInfo.status
                          )
                            ? '#10b981'
                            : '#e5e7eb',
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '8px',
                fontSize: '11px',
                color: '#6b7280',
              }}
            >
              <span>Submitted</span>
              <span>Processing</span>
              <span>Approved</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions for workflow progress
const getStepStatus = (step: string, currentStatus: string): boolean => {
  const statusOrder = ['submitted', 'in_progress', 'approved'];
  const stepIndex = statusOrder.indexOf(step);
  const currentIndex = statusOrder.indexOf(currentStatus.toLowerCase());
  return stepIndex === currentIndex;
};

const isStepCompleted = (step: string, currentStatus: string): boolean => {
  const statusOrder = ['submitted', 'in_progress', 'approved'];
  const stepIndex = statusOrder.indexOf(step);
  const currentIndex = statusOrder.indexOf(currentStatus.toLowerCase());
  return (
    stepIndex < currentIndex || (currentStatus.toLowerCase() === 'po_created' && stepIndex <= 2)
  );
};

export default WorkflowStatusDisplay;
