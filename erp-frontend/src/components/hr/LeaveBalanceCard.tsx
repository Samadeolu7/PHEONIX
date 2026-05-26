import React from 'react';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';
import { LeaveBalance } from '../../types/leaveBalance';

interface LeaveBalanceCardProps {
  balance: LeaveBalance;
  compact?: boolean;
}

const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ balance, compact = false }) => {
  const entitledDays = parseFloat(balance.entitled_days);
  const usedDays = parseFloat(balance.used_days);
  const pendingDays = parseFloat(balance.pending_days);
  const availableDays = parseFloat(balance.available_days);

  // Calculate usage percentage
  const usagePercentage = entitledDays > 0 ? (usedDays / entitledDays) * 100 : 0;

  // Determine color based on availability
  const getStatusColor = () => {
    const availabilityPercentage = entitledDays > 0 ? (availableDays / entitledDays) * 100 : 0;

    if (availabilityPercentage > 50) return 'green';
    if (availabilityPercentage > 20) return 'yellow';
    return 'red';
  };

  const statusColor = getStatusColor();

  const colorClasses = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      progress: 'bg-green-500',
      text: 'text-green-800',
      icon: 'text-green-600',
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      progress: 'bg-yellow-500',
      text: 'text-yellow-800',
      icon: 'text-yellow-600',
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      progress: 'bg-red-500',
      text: 'text-red-800',
      icon: 'text-red-600',
    },
  };

  const colors = colorClasses[statusColor];

  if (compact) {
    return (
      <div className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
        <div className="flex items-center justify-between mb-2">
          <h4 className={`font-medium ${colors.text}`}>{balance.leave_type.name}</h4>
          <span className={`text-sm font-semibold ${colors.text}`}>
            {availableDays.toFixed(1)} days
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${colors.progress}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-lg border ${colors.bg} ${colors.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className={`h-5 w-5 ${colors.icon}`} />
          <h3 className={`text-lg font-semibold ${colors.text}`}>{balance.leave_type.name}</h3>
        </div>
        {availableDays <= 2 && availableDays > 0 && (
          <AlertTriangle className="h-5 w-5 text-orange-500" title="Low balance" />
        )}
        {availableDays <= 0 && (
          <AlertTriangle className="h-5 w-5 text-red-500" title="No days available" />
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">Used: {usedDays.toFixed(1)} days</span>
          <span className="text-gray-600">
            {usagePercentage.toFixed(1)}% of {entitledDays.toFixed(1)} days
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${colors.progress} transition-all duration-300`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-gray-600">Available</p>
            <p className={`font-semibold ${colors.text}`}>{availableDays.toFixed(1)} days</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-gray-600">Pending</p>
            <p className="font-semibold text-orange-600">{pendingDays.toFixed(1)} days</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-gray-600">Entitled</p>
            <p className="font-semibold text-gray-900">{entitledDays.toFixed(1)} days</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-gray-600">Carried Over</p>
            <p className="font-semibold text-blue-600">
              {parseFloat(balance.carried_over_days).toFixed(1)} days
            </p>
          </div>
        </div>
      </div>

      {/* Year Badge */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          {balance.year}
        </span>
      </div>
    </div>
  );
};

export default LeaveBalanceCard;
