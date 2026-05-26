// DashboardDemoPage - Comprehensive demo of both dashboard layouts
import React, { useState } from 'react';
import { DashboardLayoutSwitcher } from '../components/dashboard/DashboardLayoutSwitcher';
import { UserPreferences } from '../types/navigation';

const DashboardDemoPage: React.FC = () => {
  const [userPreferences, setUserPreferences] = useState<Partial<UserPreferences>>({
    dashboardLayout: 'role-based',
  });

  const handleLayoutChange = (layout: 'role-based' | 'workflow-centric') => {
    setUserPreferences(prev => ({
      ...prev,
      dashboardLayout: layout,
    }));

    // In a real application, this would save to user preferences API
    console.log('Dashboard layout changed to:', layout);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Layouts Demo</h1>
          <p className="text-gray-600 mt-2">
            Experience both dashboard design concepts for the modern ERP frontend. Switch between
            role-based and workflow-centric layouts to see how each approach organizes information
            and functionality.
          </p>
        </div>

        {/* Dashboard with Layout Switcher */}
        <DashboardLayoutSwitcher
          defaultLayout={userPreferences.dashboardLayout}
          onLayoutChange={handleLayoutChange}
          showSwitcher={true}
        />
      </div>
    </div>
  );
};

export default DashboardDemoPage;
