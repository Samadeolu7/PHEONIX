// ActivityFeed component for displaying recent system activity
import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CreditCard,
  CheckCircle,
  AlertCircle,
  User,
  Clock,
  ExternalLink,
  Activity,
  Target,
} from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'invoice' | 'payment' | 'approval' | 'system' | 'user' | 'workflow' | 'task';
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  status?: 'success' | 'pending' | 'error' | 'info';
  actionUrl?: string;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
  showFilters?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
}

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'invoice':
      return FileText;
    case 'payment':
      return CreditCard;
    case 'approval':
      return CheckCircle;
    case 'system':
      return AlertCircle;
    case 'user':
      return User;
    case 'workflow':
      return Activity;
    case 'task':
      return Target;
    default:
      return FileText;
  }
};

const getStatusColor = (status: ActivityItem['status']) => {
  switch (status) {
    case 'success':
      return 'text-green-600 bg-green-100';
    case 'error':
      return 'text-red-600 bg-red-100';
    case 'pending':
      return 'text-yellow-600 bg-yellow-100';
    case 'info':
    default:
      return 'text-blue-600 bg-blue-100';
  }
};

const formatTimeAgo = (timestamp: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  maxItems = 10,
  showFilters = false,
  loading = false,
  className = '',
  title = 'Recent Activity',
}) => {
  const displayActivities = activities.slice(0, maxItems);

  if (loading) {
    return (
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 ${className}`}
      >
        <div className="animate-pulse space-y-3 sm:space-y-4">
          <div className="h-5 sm:h-6 bg-gray-200 rounded w-24 sm:w-32"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex space-x-3">
              <div className="h-6 w-6 sm:h-8 sm:w-8 bg-gray-200 rounded-full flex-shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-3 sm:h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-2 sm:h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h3>
          {showFilters && (
            <div className="flex items-center space-x-2">
              <select className="text-xs sm:text-sm border border-gray-300 rounded-md px-2 py-1">
                <option value="all">All</option>
                <option value="invoice">Invoices</option>
                <option value="payment">Payments</option>
                <option value="approval">Approvals</option>
                <option value="system">System</option>
                <option value="workflow">Workflows</option>
                <option value="task">Tasks</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Activity List */}
      <div className="p-4 sm:p-6">
        {displayActivities.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base text-gray-500">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {displayActivities.map(activity => {
              const Icon = getActivityIcon(activity.type);
              const statusColor = getStatusColor(activity.status);

              return (
                <div
                  key={activity.id}
                  className="flex space-x-3 p-2 sm:p-0 hover:bg-gray-50 sm:hover:bg-transparent rounded-lg sm:rounded-none transition-colors"
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 p-1.5 sm:p-2 rounded-full ${statusColor}`}>
                    <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate sm:whitespace-normal">
                          {activity.title}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2 sm:line-clamp-none">
                          {activity.description}
                        </p>

                        {/* Metadata */}
                        <div className="flex items-center space-x-2 sm:space-x-4 mt-2 text-xs text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimeAgo(activity.timestamp)}</span>
                          </div>
                          {activity.user && (
                            <div className="flex items-center space-x-1 hidden sm:flex">
                              <User className="h-3 w-3" />
                              <span className="truncate">{activity.user}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Link */}
                      {activity.actionUrl && (
                        <Link
                          to={activity.actionUrl}
                          className="flex-shrink-0 text-blue-600 hover:text-blue-800 ml-2 sm:ml-4 p-1 sm:p-0"
                        >
                          <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View All Link */}
        {activities.length > maxItems && (
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
            <Link
              to="/activity"
              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center sm:justify-start space-x-1"
            >
              <span>View all activity</span>
              <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
