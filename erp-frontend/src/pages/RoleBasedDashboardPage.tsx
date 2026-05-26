// RoleBasedDashboardPage - Showcases the role-based dashboard layout
import React from 'react';
import { RoleBasedDashboard } from '../components/dashboard/RoleBasedDashboard';

const RoleBasedDashboardPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RoleBasedDashboard />
      </div>
    </div>
  );
};

export default RoleBasedDashboardPage;
