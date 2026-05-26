// WorkflowCentricDashboard component - Design Concept 2
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  User,
  TrendingUp,
  TrendingDown,
  DollarSign,
  GraduationCap,
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Target,
  Activity,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MetricCard } from './MetricCard';
import { ActivityFeed, ActivityItem } from './ActivityFeed';
import { MetricsGrid } from './DashboardGrid';

interface ProcessFlowStep {
  id: string;
  title: string;
  description: string;
  path: string;
  status: 'completed' | 'in-progress' | 'pending' | 'blocked';
  progress?: number;
  dueDate?: Date;
  assignee?: string;
}

interface BusinessProcess {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  steps: ProcessFlowStep[];
  overallProgress: number;
  priority: 'high' | 'medium' | 'low';
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  type: 'approval' | 'review' | 'action' | 'follow-up';
  priority: 'high' | 'medium' | 'low';
  dueDate: Date;
  assignee?: string;
  path: string;
  status: 'overdue' | 'due-today' | 'upcoming';
}

interface ProcessFlowNavigationProps {
  processes: BusinessProcess[];
  onProcessClick: (processId: string) => void;
}

const ProcessFlowNavigation: React.FC<ProcessFlowNavigationProps> = ({
  processes,
  onProcessClick,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Business Process Flow</h2>
      <div className="flex items-center space-x-4 overflow-x-auto pb-2">
        {processes.map((process, index) => (
          <React.Fragment key={process.id}>
            <div
              className="flex-shrink-0 cursor-pointer group"
              onClick={() => onProcessClick(process.id)}
            >
              <div
                className={`
                p-3 rounded-lg border-2 transition-all duration-200
                ${
                  process.overallProgress === 100
                    ? 'border-green-200 bg-green-50'
                    : process.overallProgress > 0
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                }
                group-hover:shadow-md
              `}
              >
                <process.icon
                  className={`h-6 w-6 mb-2 ${
                    process.overallProgress === 100
                      ? 'text-green-600'
                      : process.overallProgress > 0
                        ? 'text-blue-600'
                        : 'text-gray-600'
                  }`}
                />
                <div className="text-sm font-medium text-gray-900 mb-1">{process.title}</div>
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      process.overallProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${process.overallProgress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{process.overallProgress}%</div>
              </div>
            </div>
            {index < processes.length - 1 && (
              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

interface ProcessCardProps {
  process: BusinessProcess;
  onStepClick: (stepPath: string) => void;
}

const ProcessCard: React.FC<ProcessCardProps> = ({ process, onStepClick }) => {
  const getStatusColor = (status: ProcessFlowStep['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'in-progress':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'blocked':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: ProcessFlowStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'in-progress':
        return <Activity className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'blocked':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: BusinessProcess['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50';
      case 'medium':
        return 'border-yellow-200 bg-yellow-50';
      case 'low':
        return 'border-green-200 bg-green-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border-2 p-6 ${getPriorityColor(process.priority)}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${process.color}`}>
            <process.icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{process.title}</h3>
            <p className="text-sm text-gray-600">{process.description}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-900">{process.overallProgress}%</div>
          <div className="text-xs text-gray-500">Complete</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${process.overallProgress}%` }}
          ></div>
        </div>
      </div>

      {/* Process Steps */}
      <div className="space-y-3">
        {process.steps.map((step, index) => (
          <div
            key={step.id}
            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors duration-150"
            onClick={() => onStepClick(step.path)}
          >
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-500">{index + 1}.</span>
                <div className={`p-1 rounded-full ${getStatusColor(step.status)}`}>
                  {getStatusIcon(step.status)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{step.title}</div>
                <div className="text-xs text-gray-500">{step.description}</div>
                {step.assignee && (
                  <div className="text-xs text-blue-600 mt-1">Assigned to: {step.assignee}</div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {step.progress !== undefined && (
                <div className="text-xs text-gray-500">{step.progress}%</div>
              )}
              {step.dueDate && (
                <div className="text-xs text-gray-500">
                  Due: {step.dueDate.toLocaleDateString()}
                </div>
              )}
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TaskBasedInterfaceProps {
  tasks: TaskItem[];
  onTaskClick: (taskPath: string) => void;
}

const TaskBasedInterface: React.FC<TaskBasedInterfaceProps> = ({ tasks, onTaskClick }) => {
  const todayTasks = tasks.filter(task => task.status === 'due-today');
  const overdueTasks = tasks.filter(task => task.status === 'overdue');
  const upcomingTasks = tasks.filter(task => task.status === 'upcoming');

  const getTaskTypeColor = (type: TaskItem['type']) => {
    switch (type) {
      case 'approval':
        return 'text-red-600 bg-red-100';
      case 'review':
        return 'text-yellow-600 bg-yellow-100';
      case 'action':
        return 'text-blue-600 bg-blue-100';
      case 'follow-up':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: TaskItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500';
      case 'medium':
        return 'border-l-yellow-500';
      case 'low':
        return 'border-l-green-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const TaskList: React.FC<{ title: string; tasks: TaskItem[]; color: string }> = ({
    title,
    tasks,
    color,
  }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {tasks.length}
        </span>
      </div>
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No {title.toLowerCase()} tasks</p>
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              className={`p-3 border-l-4 bg-gray-50 rounded-r-lg cursor-pointer hover:bg-gray-100 transition-colors duration-150 ${getPriorityColor(task.priority)}`}
              onClick={() => onTaskClick(task.path)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getTaskTypeColor(task.type)}`}
                    >
                      {task.type}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{task.title}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>Due: {task.dueDate.toLocaleDateString()}</span>
                    </div>
                    {task.assignee && (
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3" />
                        <span>{task.assignee}</span>
                      </div>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <TaskList title="Overdue Items" tasks={overdueTasks} color="bg-red-100 text-red-800" />
      <TaskList title="Today's Tasks" tasks={todayTasks} color="bg-blue-100 text-blue-800" />
      <TaskList title="Upcoming Tasks" tasks={upcomingTasks} color="bg-green-100 text-green-800" />
    </div>
  );
};

interface WorkflowCentricDashboardProps {
  className?: string;
}

export const WorkflowCentricDashboard: React.FC<WorkflowCentricDashboardProps> = ({
  className = '',
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock business processes data
  const businessProcesses: BusinessProcess[] = [
    {
      id: 'financial-cycle',
      title: 'Financial Cycle',
      description: 'Complete financial management workflow',
      icon: DollarSign,
      color: 'bg-green-600',
      overallProgress: 75,
      priority: 'high',
      steps: [
        {
          id: 'setup-fees',
          title: 'Setup Fees',
          description: 'Configure fee structures and entitlements',
          path: '/incomes/fee-structures',
          status: 'completed',
          progress: 100,
          assignee: 'Finance Team',
        },
        {
          id: 'generate-invoices',
          title: 'Generate Invoices',
          description: 'Create and send client repayment invoices',
          path: '/sales/invoices',
          status: 'in-progress',
          progress: 60,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          assignee: 'Billing Team',
        },
        {
          id: 'track-payments',
          title: 'Track Payments',
          description: 'Monitor and record incoming payments',
          path: '/receivables/payments/record',
          status: 'pending',
          progress: 0,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          assignee: 'Accounts Team',
        },
        {
          id: 'collections',
          title: 'Collections',
          description: 'Follow up on overdue accounts',
          path: '/receivables/collections',
          status: 'pending',
          progress: 0,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          assignee: 'Collections Team',
        },
      ],
    },
    {
      id: 'client-services',
      title: 'Client Services',
      description: 'Client registration and loan account management',
      icon: Users,
      color: 'bg-blue-600',
      overallProgress: 90,
      priority: 'medium',
      steps: [
        {
          id: 'entitlements',
          title: 'Repayment Schedules',
          description: 'Setup client loan repayment schedules',
          path: '/incomes/entitlements',
          status: 'completed',
          progress: 100,
          assignee: 'Loans Officer',
        },
        {
          id: 'access-control',
          title: 'Access Control',
          description: 'Configure client portal access permissions',
          path: '/demo/access-control',
          status: 'completed',
          progress: 100,
          assignee: 'IT Team',
        },
        {
          id: 'client-accounts',
          title: 'Client Accounts',
          description: 'Manage client records and loan accounts',
          path: '/clients',
          status: 'in-progress',
          progress: 80,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          assignee: 'Registrar',
        },
        {
          id: 'statements',
          title: 'Statements',
          description: 'Generate and distribute client account statements',
          path: '/receivables/statements',
          status: 'pending',
          progress: 0,
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          assignee: 'Finance Team',
        },
      ],
    },
    {
      id: 'operations-support',
      title: 'Operations Support',
      description: 'Procurement and inventory management',
      icon: Package,
      color: 'bg-purple-600',
      overallProgress: 45,
      priority: 'medium',
      steps: [
        {
          id: 'procurement',
          title: 'Procurement',
          description: 'Manage purchase orders and requisitions',
          path: '/procurement',
          status: 'in-progress',
          progress: 70,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          assignee: 'Procurement Team',
        },
        {
          id: 'inventory',
          title: 'Inventory',
          description: 'Track stock levels and movements',
          path: '/inventory',
          status: 'pending',
          progress: 20,
          dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
          assignee: 'Warehouse Team',
        },
        {
          id: 'suppliers',
          title: 'Suppliers',
          description: 'Manage supplier relationships',
          path: '/procurement/suppliers',
          status: 'pending',
          progress: 0,
          dueDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          assignee: 'Procurement Team',
        },
        {
          id: 'reports',
          title: 'Reports',
          description: 'Generate operational reports',
          path: '/reports',
          status: 'pending',
          progress: 0,
          dueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
          assignee: 'Operations Manager',
        },
      ],
    },
  ];

  // Mock tasks data
  const tasks: TaskItem[] = [
    {
      id: '1',
      title: 'Approve Purchase Order #PO-2024-045',
      description: 'Office supplies purchase order awaiting approval - ₦125,000',
      type: 'approval',
      priority: 'high',
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday (overdue)
      assignee: 'Finance Manager',
      path: '/procurement/orders/45',
      status: 'overdue',
    },
    {
      id: '2',
      title: 'Review Loan Portfolio',
      description: 'Monthly loan portfolio review and risk assessment',
      type: 'review',
      priority: 'medium',
      dueDate: new Date(), // Today
      assignee: 'Loans Director',
      path: '/incomes/fee-structures',
      status: 'due-today',
    },
    {
      id: '3',
      title: 'Process Bulk Invoice Generation',
      description: 'Generate repayment invoices for active loan accounts',
      type: 'action',
      priority: 'high',
      dueDate: new Date(), // Today
      assignee: 'Billing Team',
      path: '/demo/bulk-invoice-wizard',
      status: 'due-today',
    },
    {
      id: '4',
      title: 'Follow up on Overdue Payments',
      description: 'Contact clients with overdue loan payments > 30 days',
      type: 'follow-up',
      priority: 'medium',
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago (overdue)
      assignee: 'Collections Team',
      path: '/receivables/collections',
      status: 'overdue',
    },
    {
      id: '5',
      title: 'Update Inventory Levels',
      description: 'Conduct monthly inventory count and update system',
      type: 'action',
      priority: 'low',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // In 2 days
      assignee: 'Warehouse Team',
      path: '/inventory/movements',
      status: 'upcoming',
    },
    {
      id: '6',
      title: 'Prepare Financial Reports',
      description: 'Generate monthly financial reports for board meeting',
      type: 'action',
      priority: 'high',
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
      assignee: 'Finance Team',
      path: '/reports/financial/trial-balance',
      status: 'upcoming',
    },
  ];

  // Performance metrics
  const performanceMetrics = [
    {
      title: 'Process Efficiency',
      value: '87%',
      change: { value: 5.2, type: 'increase' as const, period: 'last month' },
      icon: Target,
      color: 'green' as const,
    },
    {
      title: 'Task Completion Rate',
      value: '92%',
      change: { value: 3.1, type: 'increase' as const, period: 'this week' },
      icon: CheckCircle,
      color: 'blue' as const,
    },
    {
      title: 'Overdue Items',
      value: '8',
      change: { value: -2, type: 'decrease' as const, period: 'yesterday' },
      icon: AlertTriangle,
      color: 'red' as const,
    },
    {
      title: 'Active Workflows',
      value: '15',
      change: { value: 1, type: 'increase' as const, period: 'today' },
      icon: Activity,
      color: 'purple' as const,
    },
  ];

  // Mock recent activities
  useEffect(() => {
    const mockActivities: ActivityItem[] = [
      {
        id: '1',
        type: 'workflow',
        title: 'Financial cycle updated',
        description: 'Invoice generation step completed - 45 invoices created',
        timestamp: new Date(Date.now() - 10 * 60 * 1000),
        user: 'Billing System',
        status: 'success',
        actionUrl: '/sales/invoices',
      },
      {
        id: '2',
        type: 'approval',
        title: 'Purchase order approved',
        description: 'PO #PO-2024-044 approved by Finance Manager',
        timestamp: new Date(Date.now() - 25 * 60 * 1000),
        user: 'Finance Manager',
        status: 'success',
        actionUrl: '/procurement/orders/44',
      },
      {
        id: '3',
        type: 'task',
        title: 'Task assigned',
        description: 'Inventory count task assigned to Warehouse Team',
        timestamp: new Date(Date.now() - 40 * 60 * 1000),
        user: 'Operations Manager',
        status: 'info',
        actionUrl: '/inventory/movements',
      },
      {
        id: '4',
        type: 'system',
        title: 'Process milestone reached',
        description: 'Client services workflow 90% complete',
        timestamp: new Date(Date.now() - 55 * 60 * 1000),
        status: 'success',
        actionUrl: '/incomes/entitlements',
      },
    ];

    setTimeout(() => {
      setActivities(mockActivities);
      setLoading(false);
    }, 1000);
  }, []);

  const handleProcessClick = (processId: string) => {
    const process = businessProcesses.find(p => p.id === processId);
    if (process) {
      // Navigate to the first incomplete step
      const nextStep = process.steps.find(step => step.status !== 'completed');
      if (nextStep) {
        navigate(nextStep.path);
      } else {
        // All steps completed, navigate to process overview
        navigate(`/workflows/${processId}`);
      }
    }
  };

  const handleStepClick = (stepPath: string) => {
    navigate(stepPath);
  };

  const handleTaskClick = (taskPath: string) => {
    navigate(taskPath);
  };

  const handleMetricClick = (metricTitle: string) => {
    switch (metricTitle) {
      case 'Process Efficiency':
        navigate('/analytics/process-efficiency');
        break;
      case 'Task Completion Rate':
        navigate('/analytics/task-completion');
        break;
      case 'Overdue Items':
        navigate('/tasks/overdue');
        break;
      case 'Active Workflows':
        navigate('/workflows');
        break;
      default:
        break;
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading workflow dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Process Flow Navigation */}
      <ProcessFlowNavigation processes={businessProcesses} onProcessClick={handleProcessClick} />

      {/* Performance Dashboard */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <BarChart3 className="h-5 w-5" />
          <span>Performance Dashboard</span>
        </h2>
        <MetricsGrid>
          {performanceMetrics.map((metric, index) => (
            <MetricCard
              key={index}
              title={metric.title}
              value={metric.value}
              change={metric.change}
              icon={metric.icon}
              color={metric.color}
              onClick={() => handleMetricClick(metric.title)}
            />
          ))}
        </MetricsGrid>
      </div>

      {/* Business Process Cards */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Business Workflows</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {businessProcesses.map(process => (
            <ProcessCard key={process.id} process={process} onStepClick={handleStepClick} />
          ))}
        </div>
      </div>

      {/* Task-Based Interface */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Task Management</h2>
        <TaskBasedInterface tasks={tasks} onTaskClick={handleTaskClick} />
      </div>

      {/* Activity Feed */}
      <div>
        <ActivityFeed
          activities={activities}
          maxItems={10}
          showFilters={true}
          loading={loading}
          title="Workflow Activity"
        />
      </div>
    </div>
  );
};
