import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Settings, Loader, CheckCircle, AlertCircle } from 'lucide-react';
const TriggerModal = React.lazy(() => import('./TriggerModal'));
const AddStepModal = React.lazy(() => import('./AddStepModal'));
const StepConfigPanel = React.lazy(() => import('./StepConfigPanel'));
const CreateVariableModal = React.lazy(() => import('./CreateVariableModal'));
const TestingModal = React.lazy(() => import('./TestingModal'));
import { Variable, WorkflowStep } from '../../types/workflow';
import {
  useWorkflowTemplate,
  useCreateWorkflowTemplate,
  useUpdateWorkflowTemplate,
} from '../../hooks/useAutomation';
import { api } from '../../services/api';

interface VisualWorkflowBuilderProps {
  workflowId?: number; // If provided, load existing workflow for editing
}

const VisualWorkflowBuilder: React.FC<VisualWorkflowBuilderProps> = ({
  workflowId: propWorkflowId,
}) => {
  const { workflowId: paramWorkflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const workflowId =
    propWorkflowId || (paramWorkflowId ? parseInt(paramWorkflowId, 10) : undefined);

  // React Query hooks
  const {
    data: workflow,
    isLoading: loading,
    error: loadError,
  } = useWorkflowTemplate(workflowId || 0, !!workflowId);
  const createWorkflowMutation = useCreateWorkflowTemplate();
  const updateWorkflowMutation = useUpdateWorkflowTemplate();

  const [showTrigger, setShowTrigger] = useState(!workflowId);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [trigger, setTrigger] = useState<any>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load workflow data when it's available
  useEffect(() => {
    if (workflow && workflowId) {
      setName(workflow.name);
      setCode(workflow.code || '');
      setDescription(workflow.description || '');
      setTrigger(workflow.trigger_config);
      setSteps(workflow.workflow_definition?.steps || []);

      // Load variables from trigger
      if (workflow.trigger_type === 'event' && workflow.trigger_config?.form_id) {
        loadFormVariables(workflow.trigger_config.form_id);
      }
    }
  }, [workflow, workflowId]);

  // Handle loading error
  useEffect(() => {
    if (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load workflow');
    }
  }, [loadError]);

  const loadFormVariables = async (formId: number) => {
    try {
      // Use the authenticated API client instead of direct fetch
      const data = await api.get(`/automations/forms/${formId}/variables/`);
      const allVars: Variable[] =
        data.all?.map((v: any) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          source: v.source,
          path: v.path,
        })) || [];

      setVariables(allVars);
    } catch (error: unknown) {
      console.error('Failed to fetch variables:', error);
    }
  };

  const handleTriggerSelect = async (type: string, formId?: number) => {
    setTrigger({ type, formId });
    setShowTrigger(false);

    if (formId) {
      await loadFormVariables(formId);
    }
  };

  const handleAddStep = (type: string) => {
    const step: WorkflowStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
      type: type as any,
      config: {},
    };
    setSteps([...steps, step]);
    setSelected(steps.length);
  };

  const handleCreateVariable = async (variable: Omit<Variable, 'id'>) => {
    const newVariable: Variable = {
      ...variable,
      id: `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setVariables([...variables, newVariable]);
  };

  const validateWorkflow = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push('Workflow name is required');
    }

    if (!code.trim()) {
      errors.push('Workflow code is required');
    }

    if (!trigger) {
      errors.push('Trigger configuration is required');
    }

    if (steps.length === 0) {
      errors.push('At least one step is required');
    }

    // Validate each step has required config
    steps.forEach((step, idx) => {
      if (!step.name.trim()) {
        errors.push(`Step ${idx + 1} needs a name`);
      }

      // Type-specific validation
      if (step.type === 'transaction' && (!step.config.entries || step.config.entries.length < 2)) {
        errors.push(`Step ${idx + 1} (${step.name}): Transaction needs at least 2 entries`);
      }

      if (
        step.type === 'condition' &&
        (!step.config.conditions || step.config.conditions.length === 0)
      ) {
        errors.push(`Step ${idx + 1} (${step.name}): Condition needs at least one rule`);
      }

      if (step.type === 'calculation' && !step.config.formula) {
        errors.push(`Step ${idx + 1} (${step.name}): Calculation needs a formula`);
      }
    });

    return { valid: errors.length === 0, errors };
  };

  const handleSave = async () => {
    const validation = validateWorkflow();

    if (!validation.valid) {
      setError(validation.errors.join('. '));
      return;
    }

    setError(null);
    setSuccess(false);

    try {
      const workflowData: any = {
        name,
        code: code || name.toLowerCase().replace(/\s+/g, '_'),
        description,
        trigger_type: trigger.type,
        trigger_config: trigger,
        workflow_definition: {
          steps,
          initial_step: steps[0]?.id,
        },
        workflow_type: 'template',
        access_level: 'internal',
        is_active: true,
      };

      const savedWorkflow = workflowId
        ? await updateWorkflowMutation.mutateAsync({ id: workflowId, data: workflowData })
        : await createWorkflowMutation.mutateAsync(workflowData);

      setSuccess(true);

      // Redirect after success
      setTimeout(() => {
        navigate(`/automations/templates/${savedWorkflow.id}/view`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save workflow');
    }
  };

  const saving = createWorkflowMutation.isPending || updateWorkflowMutation.isPending;

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (showTrigger) {
    return (
      <React.Suspense
        fallback={
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading trigger selector...</div>
        }
      >
        <TriggerModal onSelect={handleTriggerSelect} />
      </React.Suspense>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem 2rem',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => window.history.back()}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Workflow Name"
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  minWidth: '300px',
                  marginBottom: '0.25rem',
                }}
                aria-label="Workflow name"
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="workflow_code"
                  style={{
                    fontSize: '0.75rem',
                    border: '1px solid #e5e7eb',
                    outline: 'none',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontFamily: 'monospace',
                  }}
                  aria-label="Workflow code"
                />
                {workflowId && (
                  <span
                    style={{
                      fontSize: '0.625rem',
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontWeight: 600,
                    }}
                  >
                    EDITING
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {success && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#10b981',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                <CheckCircle size={16} />
                Saved!
              </div>
            )}
            <button
              onClick={() => setTesting(true)}
              disabled={steps.length === 0}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                background: 'white',
                cursor: steps.length === 0 ? 'not-allowed' : 'pointer',
                opacity: steps.length === 0 ? 0.5 : 1,
              }}
            >
              Test
            </button>
            <button
              onClick={handleSave}
              disabled={!name || steps.length === 0 || saving}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '0.375rem',
                background: !name || steps.length === 0 || saving ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: !name || steps.length === 0 || saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              aria-label="Save workflow"
            >
              {saving ? (
                <>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {workflowId ? 'Update' : 'Save'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            padding: '1rem 2rem',
          }}
        >
          <div
            style={{
              maxWidth: '1400px',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'start',
              gap: '0.75rem',
            }}
          >
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                Validation Error
              </div>
              <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#ef4444',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 350px', gap: '2rem' }}>
          {/* Variables */}
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              padding: '1rem',
              height: 'fit-content',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>
                VARIABLES ({variables.length})
              </h3>
              <button
                onClick={() => setShowVariableModal(true)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                + Add
              </button>
            </div>
            {variables.map(v => (
              <div
                key={v.id}
                style={{
                  padding: '0.5rem',
                  marginBottom: '0.5rem',
                  background: '#f9fafb',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 500 }}>{v.name}</div>
                <div style={{ color: '#6b7280' }}>{v.type}</div>
                <div
                  style={{
                    fontSize: '0.625rem',
                    color: '#9ca3af',
                    fontFamily: 'monospace',
                    marginTop: '0.25rem',
                  }}
                >
                  {v.path}
                </div>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0 }}>Workflow Steps</h3>
              <button
                onClick={() => setShowAddStep(true)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                <Plus size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                Add Step
              </button>
            </div>

            {steps.length === 0 ? (
              <div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  background: 'white',
                  borderRadius: '0.5rem',
                  border: '2px dashed #e5e7eb',
                }}
              >
                <p style={{ color: '#6b7280' }}>No steps yet. Click "Add Step" to begin.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    onClick={() => setSelected(idx)}
                    style={{
                      padding: '1rem',
                      background: 'white',
                      borderRadius: '0.5rem',
                      border: `2px solid ${selected === idx ? '#3b82f6' : '#e5e7eb'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {idx + 1}. {step.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {step.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step Config */}
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              height: 'fit-content',
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'auto',
            }}
          >
            {selected !== null ? (
              <React.Suspense
                fallback={<div style={{ padding: '1rem' }}>Loading step configuration...</div>}
              >
                <StepConfigPanel
                  step={steps[selected]}
                  variables={variables}
                  allSteps={steps}
                  onChange={config => {
                    const updated = [...steps];
                    updated[selected] = { ...updated[selected], ...config };
                    setSteps(updated);
                  }}
                  onDelete={() => {
                    setSteps(steps.filter((_, i) => i !== selected));
                    setSelected(null);
                  }}
                />
              </React.Suspense>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
                <Settings size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <p>Select a step to configure</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddStep && (
        <React.Suspense
          fallback={<div style={{ padding: '1rem' }}>Loading add-step dialog...</div>}
        >
          <AddStepModal onAdd={handleAddStep} onClose={() => setShowAddStep(false)} />
        </React.Suspense>
      )}

      {showVariableModal && (
        <React.Suspense
          fallback={<div style={{ padding: '1rem' }}>Loading variable editor...</div>}
        >
          <CreateVariableModal
            isOpen={showVariableModal}
            onClose={() => setShowVariableModal(false)}
            onCreate={handleCreateVariable}
            availableVariables={variables}
            formSchemaId={trigger?.formId}
          />
        </React.Suspense>
      )}

      {testing && (
        <React.Suspense fallback={<div style={{ padding: '1rem' }}>Loading testing tools...</div>}>
          <TestingModal
            isOpen={testing}
            onClose={() => setTesting(false)}
            workflow={{ name, trigger, steps }}
            variables={variables}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default VisualWorkflowBuilder;
