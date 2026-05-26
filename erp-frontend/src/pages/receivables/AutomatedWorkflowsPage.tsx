// src/pages/receivables/AutomatedWorkflowsPage.tsx
import React from 'react';
import { DashboardWrapper } from '../../components/DashboardWrapper';
import AutomatedWorkflows from '../../components/receivables/AutomatedWorkflows';

const AutomatedWorkflowsPage: React.FC = () => {
  return (
    <DashboardWrapper>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automated Workflows</h1>
          <p className="text-gray-600 mt-1">
            Configure and manage automated collection workflows, escalation rules, and aging
            processes
          </p>
        </div>

        <AutomatedWorkflows />
      </div>
    </DashboardWrapper>
  );
};

export default AutomatedWorkflowsPage;
