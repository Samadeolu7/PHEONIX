// WorkflowCentricDashboardPage - Showcases the workflow-centric dashboard layout
import React from 'react';
import { WorkflowCentricDashboard } from '../components/dashboard/WorkflowCentricDashboard';

const WorkflowCentricDashboardPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <WorkflowCentricDashboard />
      </div>
    </div>
  );
};

export default WorkflowCentricDashboardPage;
