// Role-based dashboard template component
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardTemplate, StatsCard, QuickAction } from '../../types/dashboardTemplates';
import { UserRole } from '../../types/roles';
import {
  dashboardTemplateEngine,
  moduleVisibilityService,
} from '../../services/dashboardTemplateEngine';
import { MetricCard } from './MetricCard';
import { ActivityFeed, ActivityItem } from './ActivityFeed';
import { ModuleCard } from '../navigation/ModuleCard';
import { ModulesGrid, MetricsGrid } from './DashboardGrid';
import {
  Clock,
  User,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Bell,
  Settings,
} from 'lucide-react';

// Icon mapping for dynamic icon rendering
import {
  Activity,
  Users,
  DollarSign,
  CreditCard,
  GraduationCap,
  Package,
  AlertCircle,
  FileText,
  CheckCircle2,
  ShoppingCart,
  Calculator,
  Receipt,
  UserPlus,
  Shield,
  BarChart3,
  Search,
  Calendar,
  Building,
  FileSearch,
  Server,
  Database,
  RotateCcw,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  Activity: Activity,
  Users: Users,
  DollarSign: DollarSign,
  CreditCard: CreditCard,
  GraduationCap: GraduationCap,
  Clock: Clock,
  Package: Package,
  AlertTriangle: AlertTriangle,
  AlertCircle: AlertCircle,
  TrendingUp: TrendingUp,
  FileText: FileText,
  CheckCircle: CheckCircle,
  CheckCircle2: CheckCircle2,
  ShoppingCart: ShoppingCart,
  Calculator: Calculator,
  Receipt: Receipt,
  UserPlus: UserPlus,
  Shield: Shield,
  BarChart3: BarChart3,
  Search: Search,
  Calendar: Calendar,
  Building: Building,
  FileSearch: FileSearch,
  Server: Server,
  Database: Database,
  RotateCcw: RotateCcw,
};

// Get icon component by name
const getIconComponent = (iconName: string): React.ComponentType<any> => {
  return iconMap[iconName] || Clock;
};

interface RoleBasedWelcomeBannerProps {
  template: DashboardTemplate;
  userName: string;
  userRole: string;
}

const RoleBasedWelcomeBanner: React.FC<RoleBasedWelcomeBannerProps> = ({
  template,
  userName,
  userRole,
}) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getRoleSpecificMessage = (role: UserRole) => {
    const messages = {
      Director: 'Your executive dashboard provides comprehensive system oversight.',
      Principal: 'Your operations leadership dashboard focuses on Client Services and loan portfolio.',
      Administrator: 'Your system administration dashboard manages users and system health.',
      Registrar: 'Your Client Services dashboard handles client records and loan accounts.',
      Officer: 'Your operational dashboard provides tools for daily tasks and data entry.',
    };
    return messages[role] || 'Welcome to your personalized dashboard.';
  };

  // Get top 3 stats for quick display, adjust for mobile
  const quickStats = template.statsCards.sort((a, b) => b.priority - a.priority).slice(0, 3);

  return (
    <div
      className="rounded-lg p-4 sm:p-6 text-white mb-4 sm:mb-6"
      style={{
        background: `linear-gradient(135deg, ${template.theme.primaryColor}, ${template.theme.accentColor || template.theme.primaryColor}dd)`,
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold mb-2">
            {getGreeting()}, {userName.split(' ')[0]}
          </h1>
          <p className="text-white/90 mb-4 text-sm sm:text-base hidden sm:block">
            {getRoleSpecificMessage(template.role)}
          </p>

          {/* Quick Stats - Responsive Grid */}
          {template.showQuickStats && quickStats.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {quickStats.map(stat => {
                const IconComponent = getIconComponent(stat.icon);
                return (
                  <div key={stat.id} className="bg-white/10 rounded-lg p-3 sm:p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 text-xs sm:text-sm truncate">{stat.title}</p>
                        <p className="text-lg sm:text-2xl font-bold truncate">{stat.value}</p>
                      </div>
                      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 ml-2">
                        <IconComponent className="h-4 w-4 sm:h-5 sm:w-5 text-white/70" />
                        {stat.change && (
                          <div className="flex items-center space-x-1">
                            {stat.change.type === 'increase' ? (
                              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-300" />
                            ) : (
                              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-300" />
                            )}
                            <span
                              className={`text-xs sm:text-sm ${
                                stat.change.type === 'increase' ? 'text-green-300' : 'text-red-300'
                              }`}
                            >
                              {stat.change.value > 0 ? '+' : ''}
                              {stat.change.value}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User Avatar - Hidden on mobile */}
        <div className="hidden lg:block ml-6">
          <div className="w-16 h-16 lg:w-20 lg:h-20 bg-white/20 rounded-full flex items-center justify-center">
            <User className="h-8 w-8 lg:h-10 lg:w-10 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
};

interface RoleBasedQuickActionsProps {
  template: DashboardTemplate;
  onActionClick: (path: string) => void;
}

const RoleBasedQuickActions: React.FC<RoleBasedQuickActionsProps> = ({
  template,
  onActionClick,
}) => {
  const primaryActions = template.quickActions
    .filter(action => action.isPrimary)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  const secondaryActions = template.quickActions
    .filter(action => !action.isPrimary)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  if (primaryActions.length === 0 && secondaryActions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 px-4 sm:px-0">
        Quick Actions
      </h2>

      {/* Primary Actions - Responsive Grid */}
      {primaryActions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 px-4 sm:px-0">
          {primaryActions.map(action => {
            const IconComponent = getIconComponent(action.icon);
            return (
              <button
                key={action.id}
                onClick={() => onActionClick(action.path)}
                className="p-3 sm:p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 text-left group touch-manipulation"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className="p-2 rounded-lg group-hover:scale-110 transition-transform duration-200 flex-shrink-0"
                    style={{ backgroundColor: `${template.theme.primaryColor}20` }}
                  >
                    <IconComponent
                      className="h-4 w-4 sm:h-5 sm:w-5"
                      style={{ color: template.theme.primaryColor }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 group-hover:text-blue-600 text-sm sm:text-base truncate">
                      {action.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2 hidden sm:block">
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Secondary Actions - Responsive Grid */}
      {secondaryActions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 px-4 sm:px-0">
          {secondaryActions.map(action => {
            const IconComponent = getIconComponent(action.icon);
            return (
              <button
                key={action.id}
                onClick={() => onActionClick(action.path)}
                className="p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200 text-center sm:text-left group touch-manipulation"
              >
                <div className="flex flex-col sm:flex-row items-center sm:space-x-2 space-y-1 sm:space-y-0">
                  <IconComponent className="h-4 w-4 text-gray-600 group-hover:text-blue-600 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-gray-700 group-hover:text-blue-600 truncate">
                    {action.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface RoleBasedDashboardTemplateProps {
  role?: UserRole;
  className?: string;
}

export const RoleBasedDashboardTemplate: React.FC<RoleBasedDashboardTemplateProps> = ({
  role: propRole,
  className = '',
}) => {
  const { user, selectedRole } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Determine the role to use (prop > selected > default)
  const effectiveRole = propRole || selectedRole || 'Officer';

  // Generate template for the role
  const template = useMemo(() => {
    try {
      return dashboardTemplateEngine.generateTemplateForRole(effectiveRole);
    } catch (error) {
      console.error('Failed to generate dashboard template:', error);
      // Fallback to Officer template
      return dashboardTemplateEngine.generateTemplateForRole('Officer');
    }
  }, [effectiveRole]);

  // Get filtered modules for the role
  const availableModules = useMemo(() => {
    return moduleVisibilityService.filterModulesByRole(effectiveRole);
  }, [effectiveRole]);

  // Mock activities (in real implementation, this would come from API)
  useEffect(() => {
    const mockActivities: ActivityItem[] = [
      {
        id: '1',
        type: 'invoice',
        title: 'New invoice created',
        description: 'Invoice #INV-2024-001 created for John Doe - ₦125,000',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        user: 'Sarah Johnson',
        status: 'success',
        actionUrl: '/sales/invoices/1',
      },
      {
        id: '2',
        type: 'payment',
        title: 'Payment received',
        description: 'Payment of ₦50,000 received from Jane Smith',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        user: 'Michael Brown',
        status: 'success',
        actionUrl: '/receivables/payments/2',
      },
      {
        id: '3',
        type: 'approval',
        title: 'Purchase order pending approval',
        description: 'PO #PO-2024-045 for office supplies awaiting approval',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        user: 'David Wilson',
        status: 'pending',
        actionUrl: '/procurement/orders/45',
      },
    ];

    setTimeout(() => {
      setActivities(mockActivities);
      setLoading(false);
    }, 1000);
  }, []);

  const handleModuleNavigation = (path: string) => {
    navigate(path);
  };

  const handleActionClick = (path: string) => {
    navigate(path);
  };

  const handleMetricClick = (statsCard: StatsCard) => {
    if (statsCard.onClick) {
      navigate(statsCard.onClick);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const userName =
    user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username || 'User';

  return (
    <div
      className={`space-y-4 sm:space-y-6 px-4 sm:px-0 ${className}`}
      style={{ backgroundColor: template.theme.backgroundColor }}
    >
      {/* Welcome Banner */}
      {template.showWelcomeBanner && (
        <RoleBasedWelcomeBanner template={template} userName={userName} userRole={template.name} />
      )}

      {/* Quick Actions */}
      <RoleBasedQuickActions template={template} onActionClick={handleActionClick} />

      {/* Key Metrics */}
      {template.statsCards.length > 0 && (
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 px-4 sm:px-0">
            Key Performance Indicators
          </h2>
          <div className="px-4 sm:px-0">
            <MetricsGrid>
              {template.statsCards.map(statsCard => {
                const IconComponent = getIconComponent(statsCard.icon);
                return (
                  <MetricCard
                    key={statsCard.id}
                    title={statsCard.title}
                    value={statsCard.value}
                    change={statsCard.change}
                    icon={IconComponent}
                    color={statsCard.color}
                    onClick={() => handleMetricClick(statsCard)}
                  />
                );
              })}
            </MetricsGrid>
          </div>
        </div>
      )}

      {/* Module Cards */}
      {template.showModuleCards && availableModules.length > 0 && (
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 px-4 sm:px-0">
            {template.role} Modules
          </h2>
          <div className="px-4 sm:px-0">
            <ModulesGrid maxPerRow={template.maxModulesPerRow}>
              {availableModules.map(module => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  layout={template.layout}
                  showStats={template.showModuleStats}
                  onNavigate={handleModuleNavigation}
                />
              ))}
            </ModulesGrid>
          </div>
        </div>
      )}

      {/* Activity Feed and Alerts */}
      {(template.showActivityFeed || template.showAlerts) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 px-4 sm:px-0">
          {/* Activity Feed */}
          {template.showActivityFeed && (
            <div className="lg:col-span-2">
              <ActivityFeed
                activities={activities}
                maxItems={8}
                showFilters={true}
                loading={loading}
              />
            </div>
          )}

          {/* Alerts and Notifications */}
          {template.showAlerts && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                    System Alerts
                  </h3>
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                    <div className="p-2 bg-red-100 rounded-full flex-shrink-0">
                      <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        System Maintenance
                      </p>
                      <p className="text-xs text-gray-500">Scheduled for tonight</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                    <div className="p-2 bg-green-100 rounded-full flex-shrink-0">
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Backup Completed</p>
                      <p className="text-xs text-gray-500">2 hours ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
