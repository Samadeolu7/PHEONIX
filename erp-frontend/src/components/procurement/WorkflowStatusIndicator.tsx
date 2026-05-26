import React from 'react';
import { Workflow, User, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface WorkflowStatusIndicatorProps {
  status: string;
  workflowRunId?: number;
  workflowStatus?: string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  className?: string;
}

const WorkflowStatusIndicator: React.FC<WorkflowStatusIndicatorProps> = ({
  status,
  workflowRunId,
  workflowStatus,
  size = 'medium',
  showLabel = true,
  className = '',
}) => {
  const isWorkflow = workflowRunId && workflowRunId > 0;
  const displayStatus = workflowStatus || status;

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          container: { padding: '4px 8px', fontSize: '11px', gap: '4px' },
          icon: 12,
          text: '11px',
        };
      case 'large':
        return {
          container: { padding: '8px 16px', fontSize: '14px', gap: '8px' },
          icon: 18,
          text: '14px',
        };
      default: // medium
        return {
          container: { padding: '6px 12px', fontSize: '12px', gap: '6px' },
          icon: 14,
          text: '12px',
        };
    }
  };

  const getStatusColor = (status: string): string => {
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

  const getStatusIcon = (status: string): React.ComponentType<{ size?: number }> => {
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

  const getStatusLabel = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'pending':
        return 'Pending';
      case 'in_progress':
        return 'In Progress';
      case 'under_review':
        return 'Under Review';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'failed':
        return 'Failed';
      case 'po_created':
        return 'PO Created';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const sizeStyles = getSizeStyles();
  const statusColor = getStatusColor(displayStatus);
  const StatusIcon = getStatusIcon(displayStatus);
  const ProcessIcon = isWorkflow ? Workflow : User;

  return (
    <div className={`workflow-status-indicator ${className}`}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: sizeStyles.container.gap,
          padding: sizeStyles.container.padding,
          borderRadius: '16px',
          background: `${statusColor}15`,
          border: `1px solid ${statusColor}30`,
          fontSize: sizeStyles.container.fontSize,
          fontWeight: 500,
          color: statusColor,
        }}
      >
        {/* Process Type Icon */}
        <ProcessIcon
          size={sizeStyles.icon}
          style={{
            opacity: 0.8,
            flexShrink: 0,
          }}
        />

        {/* Status Icon */}
        <StatusIcon size={sizeStyles.icon} style={{ flexShrink: 0 }} />

        {/* Status Label */}
        {showLabel && (
          <span
            style={{
              fontSize: sizeStyles.text,
              whiteSpace: 'nowrap',
            }}
          >
            {getStatusLabel(displayStatus)}
          </span>
        )}

        {/* Workflow Run ID (for workflow processes) */}
        {isWorkflow && size !== 'small' && (
          <span
            style={{
              fontSize: sizeStyles.text,
              opacity: 0.7,
              fontFamily: 'monospace',
              marginLeft: '4px',
            }}
          >
            #{workflowRunId}
          </span>
        )}
      </div>

      {/* Process Type Label (below indicator for small size) */}
      {size === 'small' && (
        <div
          style={{
            fontSize: '10px',
            color: '#6b7280',
            textAlign: 'center',
            marginTop: '2px',
            fontWeight: 500,
          }}
        >
          {isWorkflow ? 'Workflow' : 'Manual'}
        </div>
      )}
    </div>
  );
};

export default WorkflowStatusIndicator;
