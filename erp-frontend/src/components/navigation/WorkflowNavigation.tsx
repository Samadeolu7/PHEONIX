import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle, Circle, Clock, AlertCircle } from 'lucide-react';

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  path: string;
  status: 'completed' | 'current' | 'pending' | 'blocked';
  icon?: React.ComponentType<any>;
  estimatedTime?: string;
  dependencies?: string[];
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  description: string;
  steps: WorkflowStep[];
  category: 'financial' | 'client' | 'procurement' | 'inventory';
}

interface WorkflowNavigationProps {
  workflow: WorkflowDefinition;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  showProgress?: boolean;
}

// Predefined workflow definitions
export const workflowDefinitions: WorkflowDefinition[] = [
  {
    id: 'loan-repayment-collection',
    title: 'Loan Repayment Collection',
    description: 'Complete workflow from loan disbursement to repayment tracking',
    category: 'financial',
    steps: [
      {
        id: 'setup-fees',
        title: 'Setup Loan Product',
        description: 'Define loan types and interest rates',
        path: '/incomes/fee-structures',
        status: 'completed',
      },
      {
        id: 'create-entitlements',
        title: 'Create Repayment Schedule',
        description: 'Setup client repayment entitlements',
        path: '/incomes/entitlements',
        status: 'completed',
      },
      {
        id: 'generate-invoices',
        title: 'Generate Invoices',
        description: 'Create repayment invoices',
        path: '/demo/bulk-invoice-wizard',
        status: 'current',
      },
      {
        id: 'track-payments',
        title: 'Track Repayments',
        description: 'Monitor repayment status',
        path: '/receivables/dashboard',
        status: 'pending',
      },
      {
        id: 'collections',
        title: 'Collections / Recovery',
        description: 'Handle overdue loan accounts',
        path: '/receivables/collections',
        status: 'pending',
      },
    ],
  },
  {
    id: 'procurement-cycle',
    title: 'Procurement Cycle',
    description: 'End-to-end procurement from requisition to inventory update',
    category: 'procurement',
    steps: [
      {
        id: 'create-requisition',
        title: 'Create Requisition',
        description: 'Submit purchase request',
        path: '/procurement/requisitions',
        status: 'completed',
      },
      {
        id: 'get-approval',
        title: 'Get Approval',
        description: 'Obtain necessary approvals',
        path: '/procurement/requisitions/approvals',
        status: 'completed',
      },
      {
        id: 'get-quotes',
        title: 'Get Quotes',
        description: 'Obtain supplier quotes',
        path: '/procurement/quotes',
        status: 'current',
      },
      {
        id: 'create-po',
        title: 'Create Purchase Order',
        description: 'Convert to purchase order',
        path: '/procurement/orders',
        status: 'pending',
      },
      {
        id: 'receive-goods',
        title: 'Receive Goods',
        description: 'Process goods receipt',
        path: '/procurement/grn',
        status: 'pending',
      },
      {
        id: 'update-inventory',
        title: 'Update Inventory',
        description: 'Update stock levels',
        path: '/inventory/movements',
        status: 'pending',
      },
    ],
  },
  {
    id: 'financial-reporting',
    title: 'Financial Reporting',
    description: 'Monthly financial reporting workflow',
    category: 'financial',
    steps: [
      {
        id: 'reconcile-accounts',
        title: 'Reconcile Accounts',
        description: 'Reconcile all account balances',
        path: '/accounts',
        status: 'completed',
      },
      {
        id: 'trial-balance',
        title: 'Generate Trial Balance',
        description: 'Create trial balance report',
        path: '/reports/financial/trial-balance',
        status: 'current',
      },
      {
        id: 'profit-loss',
        title: 'Profit & Loss',
        description: 'Generate P&L statement',
        path: '/reports/financial/profit-loss',
        status: 'pending',
      },
      {
        id: 'balance-sheet',
        title: 'Balance Sheet',
        description: 'Generate balance sheet',
        path: '/reports/financial/balance-sheet',
        status: 'pending',
      },
    ],
  },
];

const WorkflowNavigation: React.FC<WorkflowNavigationProps> = ({
  workflow,
  className = '',
  orientation = 'horizontal',
  showProgress = true,
}) => {
  const location = useLocation();

  const getStepIcon = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'current':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'blocked':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStepClasses = (step: WorkflowStep, isActive: boolean) => {
    const baseClasses = 'relative p-4 rounded-lg border transition-all duration-200';

    if (isActive) {
      return `${baseClasses} border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md`;
    }

    switch (step.status) {
      case 'completed':
        return `${baseClasses} border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:shadow-sm`;
      case 'current':
        return `${baseClasses} border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:shadow-sm`;
      case 'blocked':
        return `${baseClasses} border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20`;
      default:
        return `${baseClasses} border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:shadow-sm`;
    }
  };

  const completedSteps = workflow.steps.filter(step => step.status === 'completed').length;
  const progressPercentage = (completedSteps / workflow.steps.length) * 100;

  if (orientation === 'vertical') {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Workflow Header */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {workflow.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
          {showProgress && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>Progress</span>
                <span>
                  {completedSteps} of {workflow.steps.length} completed
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Workflow Steps */}
        <div className="space-y-3">
          {workflow.steps.map((step, index) => {
            const isActive = location.pathname === step.path;
            const isClickable = step.status !== 'blocked';

            const StepContent = (
              <div className={getStepClasses(step, isActive)}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">{getStepIcon(step)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {step.title}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Step {index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {step.description}
                    </p>
                    {step.estimatedTime && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Est. time: {step.estimatedTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );

            return (
              <div key={step.id} className="relative">
                {isClickable ? <Link to={step.path}>{StepContent}</Link> : StepContent}

                {/* Connector Line */}
                {index < workflow.steps.length - 1 && (
                  <div className="absolute left-6 top-full w-0.5 h-3 bg-gray-300 dark:bg-gray-600" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Horizontal layout
  return (
    <div className={`${className}`}>
      {/* Workflow Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{workflow.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
        {showProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>Progress</span>
              <span>
                {completedSteps} of {workflow.steps.length} completed
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Workflow Steps */}
      <div className="flex items-center gap-4 overflow-x-auto pb-4">
        {workflow.steps.map((step, index) => {
          const isActive = location.pathname === step.path;
          const isClickable = step.status !== 'blocked';

          const StepContent = (
            <div className={`${getStepClasses(step, isActive)} min-w-[200px] flex-shrink-0`}>
              <div className="flex items-center gap-3 mb-2">
                {getStepIcon(step)}
                <span className="text-xs text-gray-500 dark:text-gray-400">Step {index + 1}</span>
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                {step.title}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">{step.description}</p>
            </div>
          );

          return (
            <div key={step.id} className="flex items-center">
              {isClickable ? <Link to={step.path}>{StepContent}</Link> : StepContent}

              {/* Arrow Connector */}
              {index < workflow.steps.length - 1 && (
                <ArrowRight className="h-5 w-5 text-gray-400 mx-2 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowNavigation;
