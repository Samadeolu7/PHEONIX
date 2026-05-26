// Leave Status Badge Component - Status display component
import React from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Calendar, Pause } from 'lucide-react';
import {
  LeaveRequestStatus,
  getLeaveRequestStatusColor,
  getLeaveRequestStatusLabel,
} from '../../types/hr';

interface LeaveStatusBadgeProps {
  status: LeaveRequestStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const LeaveStatusBadge: React.FC<LeaveStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const getStatusIcon = (status: LeaveRequestStatus) => {
    const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

    switch (status) {
      case LeaveRequestStatus.APPROVED:
        return <CheckCircle className={iconSize} />;
      case LeaveRequestStatus.REJECTED:
        return <XCircle className={iconSize} />;
      case LeaveRequestStatus.SUBMITTED:
        return <Clock className={iconSize} />;
      case LeaveRequestStatus.TAKEN:
        return <Calendar className={iconSize} />;
      case LeaveRequestStatus.CANCELLED:
        return <Pause className={iconSize} />;
      default:
        return <AlertCircle className={iconSize} />;
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-0.5 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-2.5 py-0.5 text-sm';
    }
  };

  const color = getLeaveRequestStatusColor(status);
  const label = getLeaveRequestStatusLabel(status);

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium bg-${color}-100 text-${color}-800 ${getSizeClasses()}`}
    >
      {showIcon && (
        <>
          {getStatusIcon(status)}
          <span className="ml-1">{label}</span>
        </>
      )}
      {!showIcon && label}
    </span>
  );
};

export default LeaveStatusBadge;
