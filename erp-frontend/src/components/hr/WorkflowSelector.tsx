import React from 'react';
import { WorkflowTemplate } from '../../types/hr';
import { ChevronDown, Info } from 'lucide-react';

interface WorkflowSelectorProps {
  label: string;
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
  workflows: WorkflowTemplate[];
  error?: string;
  description?: string;
  required?: boolean;
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  label,
  name,
  value,
  onChange,
  workflows,
  error,
  description,
  required = false,
}) => {
  const selectedWorkflow = workflows.find(w => w.id === value);

  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {description && (
        <div className="flex items-start space-x-2 text-sm text-gray-600">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <p>{description}</p>
        </div>
      )}

      <div className="relative">
        <select
          id={name}
          name={name}
          value={value || ''}
          onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}
          className={`
            block w-full px-3 py-2 border rounded-md shadow-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${error ? 'border-red-300' : 'border-gray-300'}
            bg-white text-gray-900
          `}
        >
          <option value="">Select a workflow (optional)</option>
          {workflows.map(workflow => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={20}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedWorkflow && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-sm font-medium text-blue-900 mb-1">{selectedWorkflow.name}</h4>
          <p className="text-sm text-blue-700 mb-2">{selectedWorkflow.description}</p>
          <div className="text-xs text-blue-600">
            <span className="font-medium">Steps:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedWorkflow.run_sequence.map((step, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800"
                >
                  {index + 1}. {step.step.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowSelector;
