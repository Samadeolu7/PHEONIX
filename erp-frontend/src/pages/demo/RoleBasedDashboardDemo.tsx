// Demo page for role-based dashboard templates
import React from 'react';
import { RoleBasedDashboardSelector } from '../../components/dashboard/RoleBasedDashboardSelector';

const RoleBasedDashboardDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Role-Based Dashboard Templates</h1>
          <p className="text-lg text-gray-600 mt-2">
            Explore how different user roles see customized dashboard layouts with role-specific
            modules, stats, and quick actions.
          </p>
        </div>

        <RoleBasedDashboardSelector defaultRole="Director" showRoleSelector={true} />
      </div>
    </div>
  );
};

export default RoleBasedDashboardDemo;
