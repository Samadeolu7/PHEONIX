import { GitBranch, Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkflowTemplate } from '@/types/automation.types';

const WorkflowManagement: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const loadWorkflows = async () => {
    try {
      const response = await fetch('/api/automations/workflows/');
      const data = await response.json();
      setWorkflows(data);
    } catch (error: unknown) {
      console.error('Failed to load workflows:', error);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Workflow Management</h2>
        <button
          onClick={() => navigate('/admin/workflows/create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Create Workflow
        </button>
      </div>

      <div className="grid gap-4">
        {workflows.map(workflow => (
          <div key={workflow.id} className="bg-white rounded-lg border p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      workflow.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {workflow.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">{workflow.description}</p>

                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-gray-500">
                    Trigger:{' '}
                    <span className="font-mono text-blue-600">
                      {workflow.trigger_config.event_name || workflow.trigger_config.cron}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    Steps:{' '}
                    <span className="font-semibold">
                      {workflow.workflow_definition.steps.length}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {workflows.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No workflows yet. Create your first workflow.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowManagement;
