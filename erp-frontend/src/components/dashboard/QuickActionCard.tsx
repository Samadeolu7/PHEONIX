// QuickActionCard component for dashboard quick actions
import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon, ArrowRight } from 'lucide-react';

interface QuickAction {
  label: string;
  path: string;
  primary?: boolean;
  icon?: LucideIcon;
}

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions: QuickAction[];
  stats?: Array<{
    label: string;
    value: string | number;
  }>;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  className?: string;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    border: 'border-blue-200',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'text-blue-600 hover:text-blue-800 hover:bg-blue-50',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    border: 'border-green-200',
    primary: 'bg-green-600 hover:bg-green-700 text-white',
    secondary: 'text-green-600 hover:text-green-800 hover:bg-green-50',
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    border: 'border-yellow-200',
    primary: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    secondary: 'text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    border: 'border-red-200',
    primary: 'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'text-red-600 hover:text-red-800 hover:bg-red-50',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    border: 'border-purple-200',
    primary: 'bg-purple-600 hover:bg-purple-700 text-white',
    secondary: 'text-purple-600 hover:text-purple-800 hover:bg-purple-50',
  },
  gray: {
    bg: 'bg-gray-50',
    icon: 'text-gray-600',
    border: 'border-gray-200',
    primary: 'bg-gray-600 hover:bg-gray-700 text-white',
    secondary: 'text-gray-600 hover:text-gray-800 hover:bg-gray-50',
  },
};

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  stats,
  color = 'blue',
  className = '',
}) => {
  const colors = colorClasses[color];

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <div className={`p-2 rounded-lg ${colors.bg} ${colors.border} border`}>
              <Icon className={`h-6 w-6 ${colors.icon}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      {/* Stats */}
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-lg font-semibold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {actions.map((action, index) => {
          const ActionIcon = action.icon;

          if (action.primary) {
            return (
              <Link
                key={index}
                to={action.path}
                className={`
                  flex items-center justify-center space-x-2 px-4 py-2 rounded-md 
                  font-medium transition-colors duration-150 ${colors.primary}
                `}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" />}
                <span>{action.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={index}
              to={action.path}
              className={`
                flex items-center justify-between p-2 rounded-md 
                transition-colors duration-150 ${colors.secondary}
              `}
            >
              <div className="flex items-center space-x-2">
                {ActionIcon && <ActionIcon className="h-4 w-4" />}
                <span className="text-sm font-medium">{action.label}</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};
