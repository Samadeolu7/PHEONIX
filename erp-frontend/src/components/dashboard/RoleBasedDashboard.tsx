// RoleBasedDashboard component - Using mock data instead of API calls
import React from 'react';
import { SimplifiedRoleBasedDashboard } from './SimplifiedRoleBasedDashboard';

interface RoleBasedDashboardProps {
  className?: string;
  enablePerformanceOptimization?: boolean;
}

export const RoleBasedDashboard: React.FC<RoleBasedDashboardProps> = ({
  className = '',
  enablePerformanceOptimization = true,
}) => {
  // Use simplified dashboard with mock data (no API calls)
  return <SimplifiedRoleBasedDashboard className={className} />;
};
