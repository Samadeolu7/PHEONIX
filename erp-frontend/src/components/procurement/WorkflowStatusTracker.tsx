import React from 'react';
import {
  WorkflowStatusInfo,
  WorkflowStepStatus,
  getWorkflowStatusColor,
  getWorkflowStatusLabel,
  calculateWorkflowProgress,
} from '../../types/procurementWorkflow';
import { useWorkflowStatus } from '../../hooks/useProcurement';

interface WorkflowStatusTrackerProps {
  entityType: 'requisition' | 'grn' | 'return';
  entityId: number;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

interface WorkflowStepProps {
  step: WorkflowStepStatus;
  isActive: boolean;
  isCompleted: boolean;
  compact?: boolean;
}

const WorkflowStep: React.FC<WorkflowStepProps> = ({
  step,
  isActive,
  isCompleted,
  compact = false,
}) => {
  const getStepIcon = () => {
    if (step.status === 'completed') {
      return (
        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    } else if (step.status === 'failed') {
      return (
        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      );
    } else if (step.status === 'in_progress') {
      return (
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
        </div>
      );
    } else if (step.status === 'skipped') {
      return (
        <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      );
    } else {
      return (
        <div
          className={`w-8 h-8 ${isActive ? 'bg-yellow-400' : 'bg-gray-300'} rounded-full flex items-center justify-center`}
        >
          <div className={`w-3 h-3 ${isActive ? 'bg-white' : 'bg-gray-500'} rounded-full`}></div>
        </div>
      );
    }
  };

  const getStepStatusColor = () => {
    switch (step.status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'in_progress':
        return 'text-blue-600';
      case 'skipped':
        return 'text-gray-500';
      default:
        return isActive ? 'text-yellow-600' : 'text-gray-500';
    }
  };

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return '';
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        {getStepIcon()}
        <span className={`text-sm font-medium ${getStepStatusColor()}`}>{step.step_name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-4 p-4 border-l-4 border-gray-200">
      {getStepIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className={`text-sm font-medium ${getStepStatusColor()}`}>{step.step_name}</h4>
          <span className={`text-xs px-2 py-1 rounded-full ${getStepStatusColor()} bg-opacity-10`}>
            {step.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {step.assignee && (
          <p className="text-sm text-gray-600 mt-1">
            Assigned to: {step.assignee.first_name} {step.assignee.last_name}
          </p>
        )}

        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
          {step.started_at && <span>Started: {new Date(step.started_at).toLocaleString()}</span>}
          {step.completed_at && (
            <span>Completed: {new Date(step.completed_at).toLocaleString()}</span>
          )}
          {step.duration_ms && <span>Duration: {formatDuration(step.duration_ms)}</span>}
        </div>

        {step.comments && <p className="text-sm text-gray-700 mt-2 italic">"{step.comments}"</p>}

        {step.error_message && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{step.error_message}</p>
          </div>
        )}

        {step.retry_count > 0 && (
          <p className="text-xs text-orange-600 mt-1">Retried {step.retry_count} time(s)</p>
        )}
      </div>
    </div>
  );
};

const WorkflowStatusTracker: React.FC<WorkflowStatusTrackerProps> = ({
  entityType,
  entityId,
  showDetails = true,
  compact = false,
  className = '',
}) => {
  const { data: workflowStatus, isLoading, error } = useWorkflowStatus(entityType, entityId);

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-2 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  if (error || !workflowStatus) {
    return null;
  }

  const progress = calculateWorkflowProgress(workflowStatus.steps || []);
  const statusColor = getWorkflowStatusColor(workflowStatus.status);
  const statusLabel = getWorkflowStatusLabel(workflowStatus.status);

  const currentStepIndex =
    workflowStatus.steps?.findIndex(step => step.step_name === workflowStatus.current_step) ?? -1;

  if (compact) {
    return (
      <div className={`flex items-center space-x-3 ${className}`}>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full bg-${statusColor}-500`}></div>
          <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
        </div>
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className={`bg-${statusColor}-500 h-2 rounded-full transition-all duration-300`}
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <span className="text-xs text-gray-500">{progress}%</span>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Workflow Status</h3>
            <p className="text-sm text-gray-500">
              {entityType.charAt(0).toUpperCase() + entityType.slice(1)} #{entityId}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-${statusColor}-100 text-${statusColor}-800`}
            >
              {statusLabel}
            </span>
            <p className="text-sm text-gray-500 mt-1">{progress}% Complete</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`bg-${statusColor}-500 h-2 rounded-full transition-all duration-300`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Timing Information */}
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>Started: {new Date(workflowStatus.started_at).toLocaleString()}</span>
          {workflowStatus.completed_at && (
            <span>Completed: {new Date(workflowStatus.completed_at).toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Steps */}
      {showDetails && workflowStatus.steps && workflowStatus.steps.length > 0 && (
        <div className="px-6 py-4">
          <h4 className="text-sm font-medium text-gray-900 mb-4">Workflow Steps</h4>
          <div className="space-y-4">
            {workflowStatus.steps.map((step, index) => (
              <WorkflowStep
                key={step.id}
                step={step}
                isActive={index === currentStepIndex}
                isCompleted={step.status === 'completed' || step.status === 'skipped'}
                compact={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {workflowStatus.error_message && (
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Workflow Error</h3>
                <p className="text-sm text-red-700 mt-1">{workflowStatus.error_message}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowStatusTracker;
