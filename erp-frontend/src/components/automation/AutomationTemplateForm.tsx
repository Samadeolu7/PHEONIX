import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { WorkflowStep } from '../../types/automation';
import { CreateTemplateInput } from '../../transformers/automationTransformers';

interface AutomationTemplateFormProps {
  fetchWorkflowSteps: () => Promise<WorkflowStep[]>;
  loading?: boolean;
  error?: string | null;
  onSubmit: (data: CreateTemplateInput) => Promise<void>;
}

export const AutomationTemplateForm: React.FC<AutomationTemplateFormProps> = ({
  fetchWorkflowSteps,
  loading,
  error,
  onSubmit,
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTemplateInput>();
  const [workflowSteps, setWorkflowSteps] = React.useState<WorkflowStep[]>([]);

  React.useEffect(() => {
    const loadSteps = async () => {
      const steps = await fetchWorkflowSteps();
      setWorkflowSteps(steps);
    };
    loadSteps();
  }, [fetchWorkflowSteps]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && <div className="error-message">{error}</div>}

      <div className="form-group">
        <Controller
          name="name"
          control={control}
          rules={{ required: 'Name is required' }}
          render={({ field }) => (
            <div>
              <label>Name</label>
              <input {...field} type="text" className="form-control" />
              {errors.name && <span className="error">{errors.name.message}</span>}
            </div>
          )}
        />
      </div>

      <div className="form-group">
        <Controller
          name="description"
          control={control}
          rules={{ required: 'Description is required' }}
          render={({ field }) => (
            <div>
              <label>Description</label>
              <textarea {...field} className="form-control" />
              {errors.description && <span className="error">{errors.description.message}</span>}
            </div>
          )}
        />
      </div>

      <div className="form-group">
        <Controller
          name="requiresApproval"
          control={control}
          render={({ field: { value, onChange } }) => (
            <div className="checkbox-field">
              <label>
                <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
                Requires Approval
              </label>
            </div>
          )}
        />
      </div>

      <div className="form-group">
        <Controller
          name="initialStepId"
          control={control}
          rules={{ required: 'Initial step is required' }}
          render={({ field: { value, onChange } }) => (
            <div>
              <label htmlFor="initialStep">Initial Step</label>
              <select
                id="initialStep"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="form-control"
                aria-label="Select initial step"
              >
                <option value="">Select a step...</option>
                {workflowSteps.map(step => (
                  <option key={step.id} value={step.id}>
                    {step.label}
                  </option>
                ))}
              </select>
              {errors.initialStepId && (
                <span className="error">{errors.initialStepId.message}</span>
              )}
            </div>
          )}
        />
      </div>

      <div className="form-group">
        <Controller
          name="finalStepId"
          control={control}
          rules={{ required: 'Final step is required' }}
          render={({ field: { value, onChange } }) => (
            <div>
              <label htmlFor="finalStep">Final Step</label>
              <select
                id="finalStep"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="form-control"
                aria-label="Select final step"
              >
                <option value="">Select a step...</option>
                {workflowSteps.map(step => (
                  <option key={step.id} value={step.id}>
                    {step.label}
                  </option>
                ))}
              </select>
              {errors.finalStepId && <span className="error">{errors.finalStepId.message}</span>}
            </div>
          )}
        />
      </div>

      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Creating...' : 'Create Template'}
      </button>

      <style jsx>{`
        .form-group {
          margin-bottom: 1rem;
        }

        .form-control {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .error {
          color: red;
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        .error-message {
          background-color: #fee2e2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .checkbox-field {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .checkbox-field input {
          margin: 0;
        }

        .submit-button {
          width: 100%;
          padding: 0.75rem;
          background-color: #0066cc;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
        }

        .submit-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .submit-button:hover:not(:disabled) {
          background-color: #0052a3;
        }
      `}</style>
    </form>
  );
};
