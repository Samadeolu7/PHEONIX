import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  BarChart3,
  PieChart,
  Activity,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Bell,
  List,
  Grid,
  Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboardTemplates';

export interface WidgetLibraryProps {
  onAddWidget: (widget: Partial<DashboardWidget>) => void;
  onClose: () => void;
}

interface WidgetTemplate {
  id: string;
  type: DashboardWidget['type'];
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'analytics' | 'stats' | 'activity' | 'content';
  size: DashboardWidget['size'];
  defaultConfig: Record<string, any>;
  preview?: string;
}

const widgetTemplates: WidgetTemplate[] = [
  // Stats Widgets
  {
    id: 'revenue-stats',
    type: 'stats',
    title: 'Revenue Stats',
    description: 'Display total revenue with trend indicators',
    icon: DollarSign,
    category: 'stats',
    size: 'medium',
    defaultConfig: {
      metric: 'revenue',
      format: 'currency',
      showTrend: true,
      color: 'green',
    },
  },
  {
    id: 'client-count',
    type: 'stats',
    title: 'Client Count',
    description: 'Show total number of active clients',
    icon: Users,
    category: 'stats',
    size: 'medium',
    defaultConfig: {
      metric: 'clients',
      format: 'number',
      showTrend: true,
      color: 'blue',
    },
  },
  {
    id: 'pending-payments',
    type: 'stats',
    title: 'Pending Payments',
    description: 'Track outstanding payment amounts',
    icon: TrendingUp,
    category: 'stats',
    size: 'medium',
    defaultConfig: {
      metric: 'pending_payments',
      format: 'currency',
      showTrend: false,
      color: 'yellow',
    },
  },
  {
    id: 'active-staff',
    type: 'stats',
    title: 'Active Staff',
    description: 'Display current active staff members',
    icon: Users,
    category: 'stats',
    size: 'small',
    defaultConfig: {
      metric: 'active_staff',
      format: 'number',
      showTrend: false,
      color: 'purple',
    },
  },

  // Chart Widgets
  {
    id: 'revenue-chart',
    type: 'chart',
    title: 'Revenue Trend',
    description: 'Line chart showing revenue over time',
    icon: BarChart3,
    category: 'analytics',
    size: 'large',
    defaultConfig: {
      chartType: 'line',
      dataSource: 'revenue_trend',
      timeRange: '30d',
      showLegend: true,
    },
  },
  {
    id: 'payment-distribution',
    type: 'chart',
    title: 'Payment Distribution',
    description: 'Pie chart of payment methods',
    icon: PieChart,
    category: 'analytics',
    size: 'medium',
    defaultConfig: {
      chartType: 'pie',
      dataSource: 'payment_methods',
      showLegend: true,
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
    },
  },
  {
    id: 'enrollment-trends',
    type: 'chart',
    title: 'Enrollment Trends',
    description: 'Bar chart showing monthly enrollments',
    icon: BarChart3,
    category: 'analytics',
    size: 'large',
    defaultConfig: {
      chartType: 'bar',
      dataSource: 'enrollment_trends',
      timeRange: '12m',
      showLegend: false,
    },
  },

  // Activity Widgets
  {
    id: 'recent-activities',
    type: 'activity',
    title: 'Recent Activities',
    description: 'List of recent system activities',
    icon: Activity,
    category: 'activity',
    size: 'medium',
    defaultConfig: {
      maxItems: 10,
      showTimestamp: true,
      showUserAvatar: true,
      autoRefresh: true,
    },
  },
  {
    id: 'upcoming-events',
    type: 'activity',
    title: 'Upcoming Events',
    description: 'Calendar events and deadlines',
    icon: Calendar,
    category: 'activity',
    size: 'medium',
    defaultConfig: {
      maxItems: 5,
      showDate: true,
      filterType: 'upcoming',
      timeRange: '7d',
    },
  },

  // List Widgets
  {
    id: 'top-students',
    type: 'list',
    title: 'Top Performing Students',
    description: 'Ranked list of high-performing students',
    icon: List,
    category: 'content',
    size: 'medium',
    defaultConfig: {
      maxItems: 10,
      sortBy: 'performance',
      showRanking: true,
      showAvatar: true,
    },
  },
  {
    id: 'overdue-payments',
    type: 'list',
    title: 'Overdue Payments',
    description: 'List of students with overdue payments',
    icon: List,
    category: 'content',
    size: 'medium',
    defaultConfig: {
      maxItems: 15,
      sortBy: 'amount',
      showAmount: true,
      showDueDate: true,
    },
  },

  // Alert Widgets
  {
    id: 'system-alerts',
    type: 'alerts',
    title: 'System Alerts',
    description: 'Important system notifications and warnings',
    icon: Bell,
    category: 'activity',
    size: 'full',
    defaultConfig: {
      severity: ['high', 'medium'],
      maxItems: 5,
      autoRefresh: true,
      showTimestamp: true,
    },
  },
];

const categories = [
  { id: 'all', label: 'All Widgets', icon: Grid },
  { id: 'stats', label: 'Statistics', icon: BarChart3 },
  { id: 'analytics', label: 'Analytics', icon: PieChart },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'content', label: 'Content', icon: List },
];

export const WidgetLibrary: React.FC<WidgetLibraryProps> = ({ onAddWidget, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredWidgets = useMemo(() => {
    return widgetTemplates.filter(widget => {
      const matchesSearch =
        widget.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        widget.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  const handleAddWidget = (template: WidgetTemplate) => {
    onAddWidget({
      type: template.type,
      title: template.title,
      size: template.size,
      config: template.defaultConfig,
      position: { x: 0, y: 0, w: getSizeWidth(template.size), h: getSizeHeight(template.size) },
      visible: true,
    });
    onClose();
  };

  const getSizeWidth = (size: DashboardWidget['size']): number => {
    switch (size) {
      case 'small':
        return 3;
      case 'medium':
        return 4;
      case 'large':
        return 6;
      case 'full':
        return 12;
      default:
        return 4;
    }
  };

  const getSizeHeight = (size: DashboardWidget['size']): number => {
    switch (size) {
      case 'small':
        return 2;
      case 'medium':
        return 3;
      case 'large':
        return 4;
      case 'full':
        return 2;
      default:
        return 3;
    }
  };

  const getSizeLabel = (size: DashboardWidget['size']): string => {
    switch (size) {
      case 'small':
        return 'Small (3×2)';
      case 'medium':
        return 'Medium (4×3)';
      case 'large':
        return 'Large (6×4)';
      case 'full':
        return 'Full Width (12×2)';
      default:
        return 'Medium';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Widget Library</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose from pre-built widgets to add to your dashboard
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search and filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search widgets..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex space-x-1 mt-4 bg-gray-100 rounded-lg p-1">
            {categories.map(category => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={cn(
                    'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    selectedCategory === category.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Widget grid */}
        <div className="flex-1 p-6 overflow-auto">
          {filteredWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Grid className="h-16 w-16 mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">No widgets found</h3>
              <p className="text-sm text-center">
                Try adjusting your search terms or category filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWidgets.map(widget => {
                const Icon = widget.icon;
                return (
                  <div
                    key={widget.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => handleAddWidget(widget)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                          <Icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{widget.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">{getSizeLabel(widget.size)}</p>
                        </div>
                      </div>
                      <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-sm text-gray-600 mb-3">{widget.description}</p>

                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                          widget.category === 'stats' && 'bg-green-100 text-green-800',
                          widget.category === 'analytics' && 'bg-blue-100 text-blue-800',
                          widget.category === 'activity' && 'bg-purple-100 text-purple-800',
                          widget.category === 'content' && 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {widget.category}
                      </span>

                      <div className="text-xs text-gray-400">{widget.type}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {filteredWidgets.length} widget{filteredWidgets.length !== 1 ? 's' : ''} available
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WidgetLibrary;
