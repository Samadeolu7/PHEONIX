// src/pages/admin/VisualWorkflowBuilder.tsx
import React, { useState, useMemo, useCallback } from 'react';
import styled from '@emotion/styled';
import { useNavigate } from 'react-router-dom';
import isValidCron from 'cron-validate';
import { v4 as uuidv4 } from 'uuid';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { automationService } from '../../services/automationService';
import { useAuth } from '../../contexts/AuthContext';
import {
  WorkflowTemplate,
  WorkflowStep,
  WorkflowStepType,
  FormSchema,
} from '../../types/automation.types';

// Import UI components (you'll need to create these)
// import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { WorkflowVisualizer } from '../../components/workflow/WorkflowVisualizer';
import { StepEditor } from '../../components/workflow/StepEditor';
import { ValidationErrors } from '../../components/workflow/ValidationErrors';
import Textarea from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/* --------------------- Styled Components --------------------- */
const Container = styled.div`
  max-width: 1400px;
  margin: 2rem auto;
  padding: 1rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
`;

const Title = styled.h1`
  margin: 0;
  color: #2d3748;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 450px;
  gap: 2rem;
  height: calc(100vh - 200px);
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
`;

const StepItem = styled.div<{ isDragging?: boolean; isSelected?: boolean }>`
  padding: 1rem;
  border: 2px solid ${p => (p.isSelected ? '#4299e1' : '#e2e8f0')};
  border-radius: 8px;
  background: ${p => (p.isDragging ? '#f7fafc' : '#fff')};
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: ${p => (p.isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)')};

  &:hover {
    border-color: #cbd5e0;
  }
`;

const StepHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepActions = styled.div`
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s;

  ${StepItem}:hover & {
    opacity: 1;
  }
`;

const StepTypeBadge = styled(Badge)`
  font-size: 0.75rem;
  margin-top: 0.5rem;
`;

const VisualizerContainer = styled.div`
  height: 300px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/* ---------------------- Constants & Types ---------------------- */
const AVAILABLE_STEP_TYPES: { value: WorkflowStepType; label: string }[] = [
  { value: 'query', label: 'Database Query' },
  { value: 'condition', label: 'Condition' },
  { value: 'calculation', label: 'Calculation' },
  { value: 'transaction', label: 'Transaction' },
  { value: 'notification', label: 'Notification' },
  { value: 'api_call', label: 'API Call' },
  { value: 'update', label: 'Update Record' },
  { value: 'approval', label: 'Approval' },
];

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual Trigger' },
  { value: 'event', label: 'Form Event' },
  { value: 'schedule', label: 'Scheduled' },
];

interface CreateWorkflowForm {
  name: string;
  description: string;
  trigger_type: 'event' | 'schedule' | 'manual';
  trigger_config: {
    event_name?: string;
    filters?: Record<string, any>;
    cron?: string;
  };
  requires_approval: boolean;
  approval_config?: {
    at_step: string;
    required_roles: string[];
    timeout_hours?: number;
  };
  is_active: boolean;
}

/* ---------------------- Helper Functions ---------------------- */
const createEmptyStep = (overrides?: Partial<WorkflowStep>): WorkflowStep => ({
  id: overrides?.id || `step_${uuidv4().slice(0, 8)}`,
  name: overrides?.name || 'New Step',
  type: overrides?.type || 'query',
  config: overrides?.config || {},
  next: overrides?.next,
  on_true: overrides?.on_true,
  on_false: overrides?.on_false,
});

const validateWorkflow = (
  form: CreateWorkflowForm,
  steps: WorkflowStep[],
  initialStepId: string
): string[] => {
  const errors: string[] = [];

  // Basic validation
  if (!form.name.trim()) errors.push('Workflow name is required');
  if (form.name.trim().length < 3) errors.push('Workflow name must be at least 3 characters');

  // Steps validation
  if (steps.length === 0) errors.push('At least one workflow step is required');
  if (!initialStepId) errors.push('Initial step must be set');

  const stepIds = steps.map(step => step.id);
  if (new Set(stepIds).size !== stepIds.length) errors.push('Step IDs must be unique');

  if (!stepIds.includes(initialStepId)) errors.push('Initial step must exist in steps');

  // Trigger validation
  if (form.trigger_type === 'event') {
    if (!form.trigger_config.event_name?.trim()) {
      errors.push('Event name is required for event triggers');
    }
  }

  if (form.trigger_type === 'schedule') {
    const cron = form.trigger_config.cron;
    if (!cron) {
      errors.push('Cron expression is required for scheduled triggers');
    } else if (!isValidCron(cron, { preset: 'default', override: { alias: true } }).isValid()) {
      errors.push('Invalid cron expression');
    }
  }

  // Approval validation
  if (form.requires_approval) {
    if (!form.approval_config?.at_step) {
      errors.push('Approval step must be specified when approval is required');
    }
    if (!form.approval_config?.required_roles?.length) {
      errors.push('At least one approval role must be specified');
    }
    if (form.approval_config?.timeout_hours && form.approval_config.timeout_hours < 1) {
      errors.push('Approval timeout must be at least 1 hour');
    }
  }

  // Step-specific validation
  steps.forEach((step, index) => {
    if (!step.name.trim()) errors.push(`Step ${index + 1}: Name is required`);
    if (!step.id.trim()) errors.push(`Step ${index + 1}: ID is required`);

    // Condition step validation
    if (step.type === 'condition') {
      if (!step.on_true && !step.on_false) {
        errors.push(
          `Condition step "${step.name}" must have at least one branch (on_true or on_false)`
        );
      }
    }

    // Validate step references
    if (step.next) {
      const nextSteps = Array.isArray(step.next) ? step.next : [step.next];
      nextSteps.forEach(nextStep => {
        if (!stepIds.includes(nextStep)) {
          errors.push(`Step "${step.name}" references non-existent next step: ${nextStep}`);
        }
      });
    }

    if (step.on_true && !stepIds.includes(step.on_true)) {
      errors.push(`Step "${step.name}" references non-existent on_true step: ${step.on_true}`);
    }

    if (step.on_false && !stepIds.includes(step.on_false)) {
      errors.push(`Step "${step.name}" references non-existent on_false step: ${step.on_false}`);
    }
  });

  return errors;
};

/* ---------------------- Drag & Drop Components ---------------------- */
interface SortableStepProps {
  step: WorkflowStep;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}

const SortableStep: React.FC<SortableStepProps> = ({
  step,
  index,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <StepItem
      ref={setNodeRef}
      style={style}
      isSelected={isSelected}
      isDragging={isDragging}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(index)}
    >
      <StepHeader>
        <StepContent>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{step.name}</div>
          <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
            ID: {step.id}
          </div>
          <StepTypeBadge variant="outline">
            {AVAILABLE_STEP_TYPES.find(t => t.value === step.type)?.label || step.type}
          </StepTypeBadge>
        </StepContent>
        <StepActions>
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              onEdit(index);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              onDuplicate(index);
            }}
          >
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={e => {
              e.stopPropagation();
              onDelete(index);
            }}
          >
            Delete
          </Button>
        </StepActions>
      </StepHeader>
    </StepItem>
  );
};

/* ---------------------- Main Component ---------------------- */
const VisualWorkflowBuilder: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'sys_admin';

  // Form state
  const [form, setForm] = useState<CreateWorkflowForm>({
    name: '',
    description: '',
    trigger_type: 'manual',
    trigger_config: {},
    requires_approval: false,
    is_active: true,
  });

  // Workflow steps state
  const [steps, setSteps] = useState<WorkflowStep[]>(() => [
    createEmptyStep({ name: 'Start', id: 'step_start' }),
  ]);
  const [initialStepId, setInitialStepId] = useState<string>('step_start');

  // UI state
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [availableForms, setAvailableForms] = useState<FormSchema[]>([]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Derived workflow template
  const workflowTemplate = useMemo(
    (): WorkflowTemplate => ({
      name: form.name,
      description: form.description,
      trigger_type: form.trigger_type,
      trigger_config: form.trigger_config,
      workflow_definition: {
        steps,
        initial_step: initialStepId,
      },
      requires_approval: form.requires_approval,
      approval_config: form.requires_approval ? form.approval_config : undefined,
      is_active: form.is_active,
      version: 1,
    }),
    [form, steps, initialStepId]
  );

  // Fetch available forms for event triggers
  React.useEffect(() => {
    const fetchForms = async () => {
      try {
        // You'll need to implement this service method
        // const forms = await automationService.getForms();
        // setAvailableForms(forms);
      } catch (error: unknown) {
        console.error('Failed to fetch forms:', error);
      }
    };

    if (form.trigger_type === 'event') {
      fetchForms();
    }
  }, [form.trigger_type]);

  /* ---------------------- Step Management ---------------------- */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setSteps(items => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over?.id);

        // Create new array with moved item
        const newSteps = [...items];
        const [moved] = newSteps.splice(oldIndex, 1);
        newSteps.splice(newIndex, 0, moved);

        return newSteps;
      });
    }

    setActiveStepId(null);
  }, []);

  const handleDragStart = useCallback((event: DragEndEvent) => {
    setActiveStepId(event.active.id as string);
  }, []);

  const addStep = useCallback(
    (type: WorkflowStepType = 'query') => {
      const newStep = createEmptyStep({
        type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
      });
      setSteps(prev => [...prev, newStep]);
      setSelectedStepIndex(steps.length);
    },
    [steps.length]
  );

  const updateStep = useCallback((index: number, updates: Partial<WorkflowStep>) => {
    setSteps(prev => prev.map((step, i) => (i === index ? { ...step, ...updates } : step)));
  }, []);

  const duplicateStep = useCallback(
    (index: number) => {
      const stepToDuplicate = steps[index];
      const newStep = createEmptyStep({
        ...stepToDuplicate,
        id: `${stepToDuplicate.id}_copy_${uuidv4().slice(0, 4)}`,
        name: `${stepToDuplicate.name} (Copy)`,
      });

      setSteps(prev => {
        const newSteps = [...prev];
        newSteps.splice(index + 1, 0, newStep);
        return newSteps;
      });

      setSelectedStepIndex(index + 1);
    },
    [steps]
  );

  const removeStep = useCallback(
    (index: number) => {
      const stepToRemove = steps[index];

      setSteps(prev => {
        const newSteps = prev.filter((_, i) => i !== index);

        // Clean up references to removed step
        return newSteps.map(step => ({
          ...step,
          next: cleanStepReference(step.next, stepToRemove.id),
          on_true: cleanStepReference(step.on_true, stepToRemove.id),
          on_false: cleanStepReference(step.on_false, stepToRemove.id),
        }));
      });

      // Update initial step if needed
      if (initialStepId === stepToRemove.id && steps.length > 1) {
        const newInitialIndex = index === 0 ? 0 : index - 1;
        setInitialStepId(steps[newInitialIndex].id);
      }

      setSelectedStepIndex(null);
    },
    [steps, initialStepId]
  );

  const cleanStepReference = (
    reference: string | string[] | undefined,
    removedId: string
  ): string | string[] | undefined => {
    if (!reference) return undefined;

    if (Array.isArray(reference)) {
      const cleaned = reference.filter(id => id !== removedId);
      return cleaned.length > 0 ? cleaned : undefined;
    }

    return reference !== removedId ? reference : undefined;
  };

  /* ---------------------- Form Submission ---------------------- */
  const validate = useCallback(() => {
    const errors = validateWorkflow(form, steps, initialStepId);
    setValidationErrors(errors);
    return errors.length === 0;
  }, [form, steps, initialStepId]);

  const handleSubmit = async () => {
    if (!isAdmin) {
      alert('Only administrators can create workflows');
      return;
    }

    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      await automationService.createWorkflow(workflowTemplate);
      alert('Workflow created successfully!');
      navigate('/admin/workflows');
    } catch (error: any) {
      console.error('Failed to create workflow:', error);
      alert(error?.message || 'Failed to create workflow. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------- Event Handlers ---------------------- */
  const updateForm = useCallback((updates: Partial<CreateWorkflowForm>) => {
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  const handleTriggerTypeChange = useCallback((newTriggerType: 'event' | 'schedule' | 'manual') => {
    setForm(prev => ({
      ...prev,
      trigger_type: newTriggerType,
      trigger_config: {}, // Reset trigger config when type changes
    }));
  }, []);

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

  if (!isAdmin) {
    return (
      <Container>
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2>Access Denied</h2>
            <p>You need administrator privileges to create workflows.</p>
            <Button onClick={() => navigate('/admin/workflows')}>Back to Workflows</Button>
          </div>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Create New Workflow</Title>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" onClick={() => navigate('/admin/workflows')}>
            Cancel
          </Button>
          <Button onClick={validate} variant="outline">
            Validate
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Workflow'}
          </Button>
        </div>
      </Header>

      <ValidationErrors errors={validationErrors} />

      <Grid>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Basic Information */}
          <Card title="Workflow Information">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Input
                label="Workflow Name"
                value={form.name}
                onChange={value => updateForm({ name: value })}
                placeholder="e.g., Customer Onboarding Workflow"
                required
              />

              <Textarea
                label="Description"
                value={form.description}
                onChange={value => updateForm({ description: value })}
                placeholder="Describe what this workflow does..."
                rows={3}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                  label="Trigger Type"
                  value={form.trigger_type}
                  onChange={value => handleTriggerTypeChange(value as any)}
                  options={TRIGGER_TYPES}
                />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '1.75rem',
                  }}
                >
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={e => updateForm({ is_active: e.target.checked })}
                  />
                  <label htmlFor="is_active">Active</label>
                </div>
              </div>

              {/* Trigger-specific configuration */}
              {form.trigger_type === 'event' && (
                <Select
                  label="Form Event"
                  value={form.trigger_config.event_name || ''}
                  onChange={value =>
                    updateForm({
                      trigger_config: { ...form.trigger_config, event_name: value },
                    })
                  }
                  options={availableForms.map(form => ({
                    value: form.trigger_event_name,
                    label: `${form.name} (${form.trigger_event_name})`,
                  }))}
                  placeholder="Select a form event..."
                />
              )}

              {form.trigger_type === 'schedule' && (
                <Input
                  label="Cron Schedule"
                  value={form.trigger_config.cron || ''}
                  onChange={value =>
                    updateForm({
                      trigger_config: { ...form.trigger_config, cron: value },
                    })
                  }
                  placeholder="0 9 * * 1-5"
                  helpText="Cron expression for when this workflow should run"
                />
              )}

              {/* Approval Configuration */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="requires_approval"
                  checked={form.requires_approval}
                  onChange={e => updateForm({ requires_approval: e.target.checked })}
                />
                <label htmlFor="requires_approval">Requires Approval</label>
              </div>

              {form.requires_approval && (
                <Card variant="outlined">
                  <h4 style={{ marginTop: 0 }}>Approval Configuration</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <Select
                      label="Approval Step"
                      value={form.approval_config?.at_step || ''}
                      onChange={value =>
                        updateForm({
                          approval_config: {
                            ...form.approval_config,
                            at_step: value,
                            required_roles: form.approval_config?.required_roles || [],
                          },
                        })
                      }
                      options={steps.map(step => ({ value: step.id, label: step.name }))}
                      placeholder="Select step that requires approval"
                    />

                    <Input
                      label="Required Roles"
                      value={form.approval_config?.required_roles?.join(', ') || ''}
                      onChange={value =>
                        updateForm({
                          approval_config: {
                            ...form.approval_config,
                            required_roles: value
                              .split(',')
                              .map(r => r.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                      placeholder="admin, manager"
                      helpText="Comma-separated list of roles that can approve"
                    />

                    <Input
                      label="Timeout (hours)"
                      type="number"
                      value={form.approval_config?.timeout_hours || ''}
                      onChange={value =>
                        updateForm({
                          approval_config: {
                            ...form.approval_config,
                            timeout_hours: value ? parseInt(value) : undefined,
                          },
                        })
                      }
                      placeholder="24"
                      helpText="Optional: hours until approval request expires"
                    />
                  </div>
                </Card>
              )}
            </div>
          </Card>

          {/* Workflow Steps */}
          <Card title="Workflow Steps">
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {AVAILABLE_STEP_TYPES.map(type => (
                  <Button
                    key={type.value}
                    size="sm"
                    variant="outline"
                    onClick={() => addStep(type.value)}
                  >
                    + {type.label}
                  </Button>
                ))}
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <StepList>
                  {steps.map((step, index) => (
                    <SortableStep
                      key={step.id}
                      step={step}
                      index={index}
                      isSelected={selectedStepIndex === index}
                      onSelect={setSelectedStepIndex}
                      onEdit={setSelectedStepIndex}
                      onDuplicate={duplicateStep}
                      onDelete={removeStep}
                    />
                  ))}
                </StepList>
              </SortableContext>
              <DragOverlay>
                {activeStepId ? (
                  <StepItem isDragging>
                    <StepHeader>
                      <div style={{ fontWeight: 600 }}>
                        {steps.find(s => s.id === activeStepId)?.name}
                      </div>
                    </StepHeader>
                  </StepItem>
                ) : null}
              </DragOverlay>
            </DndContext>

            <div style={{ marginTop: '1rem' }}>
              <Select
                label="Initial Step"
                value={initialStepId}
                onChange={setInitialStepId}
                options={steps.map(step => ({
                  value: step.id,
                  label: `${step.name} (${step.id})`,
                }))}
                helpText="The first step that will execute when this workflow runs"
              />
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <Sidebar>
          {/* Step Editor */}
          {selectedStep && (
            <StepEditor
              step={selectedStep}
              stepIndex={selectedStepIndex!}
              allSteps={steps}
              onUpdate={updates => updateStep(selectedStepIndex!, updates)}
              onClose={() => setSelectedStepIndex(null)}
            />
          )}

          {/* Workflow Visualizer */}
          <Card title="Workflow Preview">
            <VisualizerContainer>
              <WorkflowVisualizer
                steps={steps}
                initialStepId={initialStepId}
                selectedStepId={selectedStep?.id}
                onStepSelect={stepId => {
                  const index = steps.findIndex(s => s.id === stepId);
                  setSelectedStepIndex(index >= 0 ? index : null);
                }}
              />
            </VisualizerContainer>
          </Card>

          {/* JSON Preview & Actions */}
          <Card title="Preview & Actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>JSON Preview</summary>
                <pre
                  style={{
                    background: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    maxHeight: '200px',
                    overflow: 'auto',
                    marginTop: '0.5rem',
                  }}
                >
                  {JSON.stringify(workflowTemplate, null, 2)}
                </pre>
              </details>

              <Button onClick={handleSubmit} disabled={saving} fullWidth>
                {saving ? 'Creating Workflow...' : 'Create Workflow'}
              </Button>
            </div>
          </Card>
        </Sidebar>
      </Grid>
    </Container>
  );
};

export default VisualWorkflowBuilder;
