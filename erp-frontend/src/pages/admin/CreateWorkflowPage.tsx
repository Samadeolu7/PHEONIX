// // src/pages/admin/CreateWorkflowPage.tsx
// // This is your MAIN workflow creation page - use this one!

// import React, { useState, useMemo, useCallback } from 'react';
// import styled from '@emotion/styled';
// import { useNavigate } from 'react-router-dom';
// import isValidCron from 'cron-validate';
// import { v4 as uuidv4 } from 'uuid';
// import {
//   DndContext,
//   closestCenter,
//   KeyboardSensor,
//   PointerSensor,
//   useSensor,
//   useSensors,
//   DragEndEvent,
//   DragOverlay,
// } from '@dnd-kit/core';
// import {
//   SortableContext,
//   sortableKeyboardCoordinates,
//   verticalListSortingStrategy,
//   useSortable,
// } from '@dnd-kit/sortable';
// import { CSS } from '@dnd-kit/utilities';
// import { automationService } from '../../services/automationService';
// import { useAuth } from '../../contexts/AuthContext';
// import {
//   WorkflowTemplate,
//   WorkflowStep,
//   WorkflowStepType,
//   FormSchema,
// } from '../../types/automation.types';

// // Import UI components
// import { Button } from '../../components/ui/Button';
// import { Card } from '../../components/ui/Card';
// import { Input } from '../../components/ui/Input';
// import { Textarea } from '../../components/ui/TextArea';
// import { Select } from '../../components/ui/Select';
// import { Badge } from '../../components/ui/Badge';
// import { WorkflowVisualizer } from '../../components/workflow/WorkflowVisualizer';
// import { ValidationErrors } from '../../components/workflow/ValidationErrors';

// // *** NEW: Import enhanced step editors from Document 1 ***
// import {
//   SecureQueryStepEditor,
//   SecureCalculationStepEditor,
//   SecureConditionStepEditor,
//   SecureNotificationStepEditor,
//   SecureTransactionStepEditor,
//   SecureUpdateStepEditor,
// } from '../../components/workflow/SecureStepEditors';

// // Add these imports with your other imports
// import {
//   SubWorkflowStepEditor,
//   TerminalConditionStepEditor,
//   ApprovalStepEditor,
// } from '../../components/workflow/SubWorkflowComponents';
// import type { WorkflowSummary } from '../../components/workflow/SubWorkflowComponents';

// /* --------------------- Styled Components --------------------- */
// const Container = styled.div`
//   max-width: 1400px;
//   margin: 2rem auto;
//   padding: 1rem;
// `;

// const Header = styled.div`
//   display: flex;
//   justify-content: space-between;
//   align-items: center;
//   margin-bottom: 2rem;
//   padding-bottom: 1rem;
//   border-bottom: 1px solid #e2e8f0;
// `;

// const Title = styled.h1`
//   margin: 0;
//   color: #2d3748;
// `;

// const Grid = styled.div`
//   display: grid;
//   grid-template-columns: 1fr 450px;
//   gap: 2rem;
//   height: calc(100vh - 200px);
// `;

// const Sidebar = styled.div`
//   display: flex;
//   flex-direction: column;
//   gap: 1.5rem;
//   overflow-y: auto;
// `;

// const StepList = styled.div`
//   display: flex;
//   flex-direction: column;
//   gap: 0.75rem;
//   max-height: 400px;
//   overflow-y: auto;
// `;

// const StepItem = styled.div<{ isDragging?: boolean; isSelected?: boolean }>`
//   padding: 1rem;
//   border: 2px solid ${p => (p.isSelected ? '#4299e1' : '#e2e8f0')};
//   border-radius: 8px;
//   background: ${p => (p.isDragging ? '#f7fafc' : '#fff')};
//   cursor: pointer;
//   transition: all 0.2s;
//   box-shadow: ${p => (p.isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)')};

//   &:hover {
//     border-color: #cbd5e0;
//   }
// `;

// const StepHeader = styled.div`
//   display: flex;
//   justify-content: space-between;
//   align-items: flex-start;
//   gap: 0.5rem;
// `;

// const StepContent = styled.div`
//   flex: 1;
// `;

// const StepActions = styled.div`
//   display: flex;
//   gap: 0.25rem;
//   opacity: 0;
//   transition: opacity 0.2s;

//   ${StepItem}:hover & {
//     opacity: 1;
//   }
// `;

// const StepTypeBadge = styled(Badge)`
//   font-size: 0.75rem;
//   margin-top: 0.5rem;
// `;

// const VisualizerContainer = styled.div`
//   height: 300px;
//   border: 1px solid #e2e8f0;
//   border-radius: 8px;
//   background: #f8fafc;
//   display: flex;
//   align-items: center;
//   justify-content: center;
// `;

// /* *** NEW: Enhanced Step Editor Card *** */
// const StepEditorCard = styled(Card)`
//   max-height: 600px;
//   overflow-y: auto;
// `;

// /* ---------------------- Constants & Types ---------------------- */
// const AVAILABLE_STEP_TYPES: { value: WorkflowStepType; label: string }[] = [
//   { value: 'query', label: 'Database Query' },
//   { value: 'condition', label: 'Condition' },
//   { value: 'calculation', label: 'Calculation' },
//   { value: 'transaction', label: 'Transaction' },
//   { value: 'notification', label: 'Notification' },
//   { value: 'api_call', label: 'API Call' },
//   { value: 'update', label: 'Update Record' },
//   { value: 'approval', label: 'Approval' },
//   // *** NEW: Add the three new step types ***
//   { value: 'sub_workflow', label: 'Sub-Workflow' },
//   { value: 'terminal_condition', label: 'Terminal Condition' },
//   { value: 'approval_step', label: 'Approval Step' }, // Using 'approval_step' to avoid conflict with existing 'approval'
// ];

// const TRIGGER_TYPES = [
//   { value: 'manual', label: 'Manual Trigger' },
//   { value: 'event', label: 'Form Event' },
//   { value: 'schedule', label: 'Scheduled' },
// ];

// interface CreateWorkflowForm {
//   name: string;
//   description: string;
//   trigger_type: 'event' | 'schedule' | 'manual';
//   trigger_config: {
//     event_name?: string;
//     filters?: Record<string, any>;
//     cron?: string;
//   };
//   requires_approval: boolean;
//   approval_config?: {
//     at_step: string;
//     required_roles: string[];
//     timeout_hours?: number;
//   };
//   is_active: boolean;
// }

// interface AvailableVariable {
//   name: string;
//   type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array';
//   source: 'form' | 'query' | 'calculation';
//   path: string;
//   allowed_in_trigger: ('event' | 'schedule' | 'manual')[]; // NEW: Trigger restrictions
// }

// /* ---------------------- Helper Functions ---------------------- */
// const createEmptyStep = (overrides?: Partial<WorkflowStep>): WorkflowStep => ({
//   id: overrides?.id || `step_${uuidv4().slice(0, 8)}`,
//   name: overrides?.name || 'New Step',
//   type: overrides?.type || 'query',
//   config: overrides?.config || {},
//   next: overrides?.next,
//   on_true: overrides?.on_true,
//   on_false: overrides?.on_false,
// });

// const validateWorkflow = (
//   form: CreateWorkflowForm,
//   steps: WorkflowStep[],
//   initialStepId: string
// ): string[] => {
//   const errors: string[] = [];

//   if (!form.name.trim()) errors.push('Workflow name is required');
//   if (form.name.trim().length < 3) errors.push('Workflow name must be at least 3 characters');

//   if (steps.length === 0) errors.push('At least one workflow step is required');
//   if (!initialStepId) errors.push('Initial step must be set');

//   const stepIds = steps.map(step => step.id);
//   if (new Set(stepIds).size !== stepIds.length) errors.push('Step IDs must be unique');

//   if (!stepIds.includes(initialStepId)) errors.push('Initial step must exist in steps');

//   if (form.trigger_type === 'event') {
//     if (!form.trigger_config.event_name?.trim()) {
//       errors.push('Event name is required for event triggers');
//     }
//   }

//   if (form.trigger_type === 'schedule') {
//     const cron = form.trigger_config.cron;
//     if (!cron) {
//       errors.push('Cron expression is required for scheduled triggers');
//     } else if (!isValidCron(cron, { preset: 'default', override: { alias: true } }).isValid()) {
//       errors.push('Invalid cron expression');
//     }
//   }

//   if (form.requires_approval) {
//     if (!form.approval_config?.at_step) {
//       errors.push('Approval step must be specified when approval is required');
//     }
//     if (!form.approval_config?.required_roles?.length) {
//       errors.push('At least one approval role must be specified');
//     }
//     if (form.approval_config?.timeout_hours && form.approval_config.timeout_hours < 1) {
//       errors.push('Approval timeout must be at least 1 hour');
//     }
//   }

//   steps.forEach((step, index) => {
//     if (!step.name.trim()) errors.push(`Step ${index + 1}: Name is required`);
//     if (!step.id.trim()) errors.push(`Step ${index + 1}: ID is required`);

//     if (step.type === 'condition') {
//       if (!step.on_true && !step.on_false) {
//         errors.push(
//           `Condition step "${step.name}" must have at least one branch (on_true or on_false)`
//         );
//       }
//     }

//     if (step.next) {
//       const nextSteps = Array.isArray(step.next) ? step.next : [step.next];
//       nextSteps.forEach(nextStep => {
//         if (!stepIds.includes(nextStep)) {
//           errors.push(`Step "${step.name}" references non-existent next step: ${nextStep}`);
//         }
//       });
//     }

//     if (step.on_true && !stepIds.includes(step.on_true)) {
//       errors.push(`Step "${step.name}" references non-existent on_true step: ${step.on_true}`);
//     }

//     if (step.on_false && !stepIds.includes(step.on_false)) {
//       errors.push(`Step "${step.name}" references non-existent on_false step: ${step.on_false}`);
//     }
//   });

//   return errors;
// };

// /* ---------------------- Drag & Drop Components ---------------------- */
// interface SortableStepProps {
//   step: WorkflowStep;
//   index: number;
//   isSelected: boolean;
//   onSelect: (index: number) => void;
//   onEdit: (index: number) => void;
//   onDuplicate: (index: number) => void;
//   onDelete: (index: number) => void;
// }

// const SortableStep: React.FC<SortableStepProps> = ({
//   step,
//   index,
//   isSelected,
//   onSelect,
//   onEdit,
//   onDuplicate,
//   onDelete,
// }) => {
//   const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
//     id: step.id,
//   });

//   const style = {
//     transform: CSS.Transform.toString(transform),
//     transition,
//   };

//   return (
//     <StepItem
//       ref={setNodeRef}
//       style={style}
//       isSelected={isSelected}
//       isDragging={isDragging}
//       {...attributes}
//       {...listeners}
//       onClick={() => onSelect(index)}
//     >
//       <StepHeader>
//         <StepContent>
//           <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{step.name}</div>
//           <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
//             ID: {step.id}
//           </div>
//           <StepTypeBadge variant="outline">
//             {AVAILABLE_STEP_TYPES.find(t => t.value === step.type)?.label || step.type}
//           </StepTypeBadge>
//         </StepContent>
//         <StepActions>
//           <Button
//             size="sm"
//             variant="outline"
//             onClick={e => {
//               e.stopPropagation();
//               onEdit(index);
//             }}
//           >
//             Edit
//           </Button>
//           <Button
//             size="sm"
//             variant="outline"
//             onClick={e => {
//               e.stopPropagation();
//               onDuplicate(index);
//             }}
//           >
//             Duplicate
//           </Button>
//           <Button
//             size="sm"
//             variant="destructive"
//             onClick={e => {
//               e.stopPropagation();
//               onDelete(index);
//             }}
//           >
//             Delete
//           </Button>
//         </StepActions>
//       </StepHeader>
//     </StepItem>
//   );
// };

// /* ---------------------- Main Component ---------------------- */
// const CreateWorkflowPage: React.FC = () => {
//   const { user } = useAuth();
//   const navigate = useNavigate();
//   const isAdmin = user?.role === 'admin' || user?.role === 'sys_admin';

//   const [form, setForm] = useState<CreateWorkflowForm>({
//     name: '',
//     description: '',
//     trigger_type: 'manual',
//     trigger_config: {},
//     requires_approval: false,
//     is_active: true,
//   });

//   const [steps, setSteps] = useState<WorkflowStep[]>(() => [
//     createEmptyStep({ name: 'Start', id: 'step_start' }),
//   ]);
//   const [initialStepId, setInitialStepId] = useState<string>('step_start');

//   const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
//   const [activeStepId, setActiveStepId] = useState<string | null>(null);
//   const [saving, setSaving] = useState(false);
//   const [validationErrors, setValidationErrors] = useState<string[]>([]);
//   const [availableForms, setAvailableForms] = useState<FormSchema[]>([]);
//   // Add these state variables near your existing state declarations
//   const [callableWorkflows, setCallableWorkflows] = useState<WorkflowSummary[]>([]);
//   const [complexityValidation, setComplexityValidation] = useState<{
//     complexity: { steps: number; max_depth: number; branches: number };
//     warnings: string[];
//     errors: string[];
//   } | null>(null);

//   const sensors = useSensors(
//     useSensor(PointerSensor),
//     useSensor(KeyboardSensor, {
//       coordinateGetter: sortableKeyboardCoordinates,
//     })
//   );

//   /* *** NEW: Calculate available variables for step editors *** */
//   // In CreateWorkflowPage, update availableVariables calculation
//   const availableVariables: AvailableVariable[] = useMemo(() => {
//     const vars: AvailableVariable[] = [];

//     // Form variables - ONLY for event triggers
//     if (form.trigger_type === 'event' && form.trigger_config.event_name) {
//       vars.push(
//         {
//           name: 'Form: Account ID',
//           type: 'string',
//           source: 'form',
//           path: 'form.account_id',
//           allowed_in_trigger: ['event'],
//         },
//         {
//           name: 'Form: Amount',
//           type: 'number',
//           source: 'form',
//           path: 'form.amount',
//           allowed_in_trigger: ['event'],
//         }
//       );
//     }

//     // Step outputs - Available in ALL trigger types
//     steps.forEach(step => {
//       if (step.type === 'query') {
//         vars.push({
//           name: `${step.name}: Results`,
//           type: 'object',
//           source: 'query',
//           path: `step_${step.id}.results`,
//           allowed_in_trigger: ['event', 'schedule', 'manual'],
//         });
//       } else if (step.type === 'calculation') {
//         vars.push({
//           name: `${step.name}: ${step.config.result_name || 'result'}`,
//           type: 'number',
//           source: 'calculation',
//           path: `step_${step.id}.${step.config.result_name || 'result'}`,
//           allowed_in_trigger: ['event', 'schedule', 'manual'],
//         });
//       } else if (step.type === 'sub_workflow') {
//         // Add outputs from sub-workflow steps
//         const subWorkflow = callableWorkflows.find(w => w.id === step.config.workflow_id);
//         if (subWorkflow) {
//           subWorkflow.outputs.forEach(output => {
//             const outputVarName = step.config.output_mapping?.[output.name] || output.name;
//             vars.push({
//               name: `${step.name}: ${outputVarName}`,
//               type: output.type as any,
//               source: 'sub_workflow',
//               path: `step_${step.id}.${outputVarName}`,
//               allowed_in_trigger: ['event', 'schedule', 'manual'],
//             });
//           });
//         }
//       }
//       // Add other step type outputs as needed
//     });

//     return vars;
//   }, [form.trigger_type, form.trigger_config.event_name, steps, callableWorkflows]);

//   const workflowTemplate = useMemo(
//     (): WorkflowTemplate => ({
//       name: form.name,
//       description: form.description,
//       trigger_type: form.trigger_type,
//       trigger_config: form.trigger_config,
//       workflow_definition: {
//         steps,
//         initial_step: initialStepId,
//       },
//       requires_approval: form.requires_approval,
//       approval_config: form.requires_approval ? form.approval_config : undefined,
//       is_active: form.is_active,
//       version: 1,
//     }),
//     [form, steps, initialStepId]
//   );

//   React.useEffect(() => {
//     const fetchForms = async () => {
//       try {
//         // const forms = await automationService.getForms();
//         // setAvailableForms(forms);
//       } catch (error) {
//         console.error('Failed to fetch forms:', error);
//       }
//     };

//     if (form.trigger_type === 'event') {
//       fetchForms();
//     }
//   }, [form.trigger_type]);
//   // Add this useEffect near your other useEffect hooks
//   React.useEffect(() => {
//     const fetchCallableWorkflows = async () => {
//       try {
//         const response = await automationService.getCallableWorkflows();
//         setCallableWorkflows(response.workflows || []);
//       } catch (error) {
//         console.error('Failed to fetch callable workflows:', error);
//         setCallableWorkflows([]);
//       }
//     };

//     fetchCallableWorkflows();
//   }, []);

//   // Add this useEffect for complexity validation
//   React.useEffect(() => {
//     const validateComplexity = async () => {
//       if (steps.length > 0) {
//         try {
//           const result = await automationService.validateComplexity(
//             { steps, initial_step: initialStepId },
//             form.workflow_type || 'standard'
//           );
//           setComplexityValidation(result);
//         } catch (error) {
//           console.error('Failed to validate complexity:', error);
//           setComplexityValidation(null);
//         }
//       }
//     };

//     // Debounce validation to avoid too many API calls
//     const timer = setTimeout(validateComplexity, 500);
//     return () => clearTimeout(timer);
//   }, [steps, initialStepId, form.workflow_type]);

//   /* ---------------------- Step Management ---------------------- */
//   const handleDragEnd = useCallback((event: DragEndEvent) => {
//     const { active, over } = event;

//     if (active.id !== over?.id) {
//       setSteps(items => {
//         const oldIndex = items.findIndex(item => item.id === active.id);
//         const newIndex = items.findIndex(item => item.id === over?.id);

//         const newSteps = [...items];
//         const [moved] = newSteps.splice(oldIndex, 1);
//         newSteps.splice(newIndex, 0, moved);

//         return newSteps;
//       });
//     }

//     setActiveStepId(null);
//   }, []);

//   const handleDragStart = useCallback((event: DragEndEvent) => {
//     setActiveStepId(event.active.id as string);
//   }, []);

//   const addStep = useCallback(
//     (type: WorkflowStepType = 'query') => {
//       const newStep = createEmptyStep({
//         type,
//         name: `${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
//       });
//       setSteps(prev => [...prev, newStep]);
//       setSelectedStepIndex(steps.length);
//     },
//     [steps.length]
//   );

//   const updateStep = useCallback((index: number, updates: Partial<WorkflowStep>) => {
//     setSteps(prev => prev.map((step, i) => (i === index ? { ...step, ...updates } : step)));
//   }, []);

//   const duplicateStep = useCallback(
//     (index: number) => {
//       const stepToDuplicate = steps[index];
//       const newStep = createEmptyStep({
//         ...stepToDuplicate,
//         id: `${stepToDuplicate.id}_copy_${uuidv4().slice(0, 4)}`,
//         name: `${stepToDuplicate.name} (Copy)`,
//       });

//       setSteps(prev => {
//         const newSteps = [...prev];
//         newSteps.splice(index + 1, 0, newStep);
//         return newSteps;
//       });

//       setSelectedStepIndex(index + 1);
//     },
//     [steps]
//   );

//   const removeStep = useCallback(
//     (index: number) => {
//       const stepToRemove = steps[index];

//       setSteps(prev => {
//         const newSteps = prev.filter((_, i) => i !== index);

//         return newSteps.map(step => ({
//           ...step,
//           next: cleanStepReference(step.next, stepToRemove.id),
//           on_true: cleanStepReference(step.on_true, stepToRemove.id),
//           on_false: cleanStepReference(step.on_false, stepToRemove.id),
//         }));
//       });

//       if (initialStepId === stepToRemove.id && steps.length > 1) {
//         const newInitialIndex = index === 0 ? 0 : index - 1;
//         setInitialStepId(steps[newInitialIndex].id);
//       }

//       setSelectedStepIndex(null);
//     },
//     [steps, initialStepId]
//   );

//   const cleanStepReference = (
//     reference: string | string[] | undefined,
//     removedId: string
//   ): string | string[] | undefined => {
//     if (!reference) return undefined;

//     if (Array.isArray(reference)) {
//       const cleaned = reference.filter(id => id !== removedId);
//       return cleaned.length > 0 ? cleaned : undefined;
//     }

//     return reference !== removedId ? reference : undefined;
//   };

//   /* ---------------------- Form Submission ---------------------- */
//   const validate = useCallback(() => {
//     const errors = validateWorkflow(form, steps, initialStepId);
//     setValidationErrors(errors);
//     return errors.length === 0;
//   }, [form, steps, initialStepId]);
//   // Add this component after your ValidationErrors component
//   const ComplexityIndicator: React.FC<{
//     validation: {
//       complexity: { steps: number; max_depth: number; branches: number };
//       warnings: string[];
//       errors: string[];
//     } | null;
//     workflowType?: string;
//   }> = ({ validation, workflowType = 'standard' }) => {
//     if (!validation) return null;

//     const limits = {
//       system: { steps: 10, depth: 2, branches: 3 },
//       standard: { steps: 15, depth: 3, branches: 5 },
//       custom: { steps: 25, depth: 5, branches: 8 },
//     };

//     const limit = limits[workflowType as keyof typeof limits] || limits.standard;

//     return (
//       <Card
//         title="Complexity Analysis"
//         variant={
//           validation.errors.length > 0
//             ? 'destructive'
//             : validation.warnings.length > 0
//               ? 'warning'
//               : 'default'
//         }
//       >
//         <div style={{ marginBottom: '1rem' }}>
//           <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', flexWrap: 'wrap' }}>
//             <div>
//               Steps: {validation.complexity.steps}/{limit.steps}
//               {validation.complexity.steps > limit.steps && ' ⚠️'}
//             </div>
//             <div>
//               Depth: {validation.complexity.max_depth}/{limit.depth}
//               {validation.complexity.max_depth > limit.depth && ' ⚠️'}
//             </div>
//             <div>
//               Branches: {validation.complexity.branches}/{limit.branches}
//               {validation.complexity.branches > limit.branches && ' ⚠️'}
//             </div>
//           </div>
//         </div>

//         {validation.warnings.length > 0 && (
//           <div
//             style={{
//               marginTop: '0.5rem',
//               padding: '0.75rem',
//               background: '#fef5e7',
//               border: '1px solid #f9e79f',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//             }}
//           >
//             <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>⚠️ Warnings</div>
//             {validation.warnings.map((warning, index) => (
//               <div key={index}>• {warning}</div>
//             ))}
//           </div>
//         )}

//         {validation.errors.length > 0 && (
//           <div
//             style={{
//               marginTop: '0.5rem',
//               padding: '0.75rem',
//               background: '#fff5f5',
//               border: '1px solid #feb2b2',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//               color: '#c53030',
//             }}
//           >
//             <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>❌ Errors</div>
//             {validation.errors.map((error, index) => (
//               <div key={index}>• {error}</div>
//             ))}
//           </div>
//         )}
//       </Card>
//     );
//   };

//   const handleSubmit = async () => {
//     if (!isAdmin) {
//       alert('Only administrators can create workflows');
//       return;
//     }

//     if (!validate()) {
//       window.scrollTo({ top: 0, behavior: 'smooth' });
//       return;
//     }

//     setSaving(true);
//     try {
//       await automationService.createWorkflow(workflowTemplate);
//       alert('Workflow created successfully!');
//       navigate('/admin/workflows');
//     } catch (error: any) {
//       console.error('Failed to create workflow:', error);
//       alert(error?.message || 'Failed to create workflow. Please try again.');
//     } finally {
//       setSaving(false);
//     }
//   };

//   const updateForm = useCallback((updates: Partial<CreateWorkflowForm>) => {
//     setForm(prev => ({ ...prev, ...updates }));
//   }, []);

//   const handleTriggerTypeChange = useCallback((newTriggerType: 'event' | 'schedule' | 'manual') => {
//     setForm(prev => ({
//       ...prev,
//       trigger_type: newTriggerType,
//       trigger_config: {},
//     }));
//   }, []);

//   const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

//   if (!isAdmin) {
//     return (
//       <Container>
//         <Card>
//           <div style={{ textAlign: 'center', padding: '3rem' }}>
//             <h2>Access Denied</h2>
//             <p>You need administrator privileges to create workflows.</p>
//             <Button onClick={() => navigate('/admin/workflows')}>Back to Workflows</Button>
//           </div>
//         </Card>
//       </Container>
//     );
//   }

//   return (
//     <Container>
//       <Header>
//         <Title>Create New Workflow</Title>
//         <div style={{ display: 'flex', gap: '0.5rem' }}>
//           <Button variant="outline" onClick={() => navigate('/admin/workflows')}>
//             Cancel
//           </Button>
//           <Button onClick={validate} variant="outline">
//             Validate
//           </Button>
//           <Button onClick={handleSubmit} disabled={saving}>
//             {saving ? 'Creating...' : 'Create Workflow'}
//           </Button>
//         </div>
//       </Header>

//       <ValidationErrors errors={validationErrors} />
//       {/* Add complexity indicator */}
//       <ComplexityIndicator validation={complexityValidation} workflowType={form.workflow_type} />

//       <Grid>
//         {/* Main Content */}
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//           {/* Basic Information */}
//           <Card title="Workflow Information">
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//               <Input
//                 label="Workflow Name"
//                 value={form.name}
//                 onChange={value => updateForm({ name: value })}
//                 placeholder="e.g., Customer Onboarding Workflow"
//                 required
//               />

//               <Textarea
//                 label="Description"
//                 value={form.description}
//                 onChange={value => updateForm({ description: value })}
//                 placeholder="Describe what this workflow does..."
//                 rows={3}
//               />

//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
//                 <Select
//                   label="Trigger Type"
//                   value={form.trigger_type}
//                   onChange={value => handleTriggerTypeChange(value as any)}
//                   options={TRIGGER_TYPES}
//                 />

//                 <div
//                   style={{
//                     display: 'flex',
//                     alignItems: 'center',
//                     gap: '0.5rem',
//                     marginTop: '1.75rem',
//                   }}
//                 >
//                   <input
//                     type="checkbox"
//                     id="is_active"
//                     checked={form.is_active}
//                     onChange={e => updateForm({ is_active: e.target.checked })}
//                   />
//                   <label htmlFor="is_active">Active</label>
//                 </div>
//               </div>

//               {form.trigger_type === 'event' && (
//                 <Select
//                   label="Form Event"
//                   value={form.trigger_config.event_name || ''}
//                   onChange={value =>
//                     updateForm({
//                       trigger_config: { ...form.trigger_config, event_name: value },
//                     })
//                   }
//                   options={availableForms.map(form => ({
//                     value: form.trigger_event_name,
//                     label: `${form.name} (${form.trigger_event_name})`,
//                   }))}
//                   placeholder="Select a form event..."
//                 />
//               )}

//               {form.trigger_type === 'schedule' && (
//                 <Input
//                   label="Cron Schedule"
//                   value={form.trigger_config.cron || ''}
//                   onChange={value =>
//                     updateForm({
//                       trigger_config: { ...form.trigger_config, cron: value },
//                     })
//                   }
//                   placeholder="0 9 * * 1-5"
//                   helpText="Cron expression for when this workflow should run"
//                 />
//               )}

//               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                 <input
//                   type="checkbox"
//                   id="requires_approval"
//                   checked={form.requires_approval}
//                   onChange={e => updateForm({ requires_approval: e.target.checked })}
//                 />
//                 <label htmlFor="requires_approval">Requires Approval</label>
//               </div>

//               {form.requires_approval && (
//                 <Card variant="outlined">
//                   <h4 style={{ marginTop: 0 }}>Approval Configuration</h4>
//                   <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                     <Select
//                       label="Approval Step"
//                       value={form.approval_config?.at_step || ''}
//                       onChange={value =>
//                         updateForm({
//                           approval_config: {
//                             ...form.approval_config,
//                             at_step: value,
//                             required_roles: form.approval_config?.required_roles || [],
//                           },
//                         })
//                       }
//                       options={steps.map(step => ({ value: step.id, label: step.name }))}
//                       placeholder="Select step that requires approval"
//                     />

//                     <Input
//                       label="Required Roles"
//                       value={form.approval_config?.required_roles?.join(', ') || ''}
//                       onChange={value =>
//                         updateForm({
//                           approval_config: {
//                             ...form.approval_config,
//                             required_roles: value
//                               .split(',')
//                               .map(r => r.trim())
//                               .filter(Boolean),
//                           },
//                         })
//                       }
//                       placeholder="admin, manager"
//                       helpText="Comma-separated list of roles that can approve"
//                     />

//                     <Input
//                       label="Timeout (hours)"
//                       type="number"
//                       value={form.approval_config?.timeout_hours || ''}
//                       onChange={value =>
//                         updateForm({
//                           approval_config: {
//                             ...form.approval_config,
//                             timeout_hours: value ? parseInt(value) : undefined,
//                           },
//                         })
//                       }
//                       placeholder="24"
//                       helpText="Optional: hours until approval request expires"
//                     />
//                   </div>
//                 </Card>
//               )}
//             </div>
//           </Card>

//           {/* Workflow Steps */}
//           <Card title="Workflow Steps">
//             <div style={{ marginBottom: '1rem' }}>
//               <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
//                 {AVAILABLE_STEP_TYPES.map(type => (
//                   <Button
//                     key={type.value}
//                     size="sm"
//                     variant="outline"
//                     onClick={() => addStep(type.value)}
//                   >
//                     + {type.label}
//                   </Button>
//                 ))}
//               </div>
//             </div>

//             <DndContext
//               sensors={sensors}
//               collisionDetection={closestCenter}
//               onDragStart={handleDragStart}
//               onDragEnd={handleDragEnd}
//             >
//               <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
//                 <StepList>
//                   {steps.map((step, index) => (
//                     <SortableStep
//                       key={step.id}
//                       step={step}
//                       index={index}
//                       isSelected={selectedStepIndex === index}
//                       onSelect={setSelectedStepIndex}
//                       onEdit={setSelectedStepIndex}
//                       onDuplicate={duplicateStep}
//                       onDelete={removeStep}
//                     />
//                   ))}
//                 </StepList>
//               </SortableContext>
//               <DragOverlay>
//                 {activeStepId ? (
//                   <StepItem isDragging>
//                     <StepHeader>
//                       <div style={{ fontWeight: 600 }}>
//                         {steps.find(s => s.id === activeStepId)?.name}
//                       </div>
//                     </StepHeader>
//                   </StepItem>
//                 ) : null}
//               </DragOverlay>
//             </DndContext>

//             <div style={{ marginTop: '1rem' }}>
//               <Select
//                 label="Initial Step"
//                 value={initialStepId}
//                 onChange={setInitialStepId}
//                 options={steps.map(step => ({
//                   value: step.id,
//                   label: `${step.name} (${step.id})`,
//                 }))}
//                 helpText="The first step that will execute when this workflow runs"
//               />
//             </div>
//           </Card>
//         </div>

//         {/* Sidebar */}
//         <Sidebar>
//           {/* In your step editor section */}
//           {selectedStep && (
//             <StepEditorCard title={`Edit: ${selectedStep.name}`}>
//               {/* Basic Step Configuration */}
//               <div style={{ marginBottom: '1.5rem' }}>
//                 <Input
//                   label="Step Name"
//                   value={selectedStep.name}
//                   onChange={value => updateStep(selectedStepIndex!, { name: value })}
//                   placeholder="Enter step name..."
//                   required
//                 />
//               </div>

//               {/* Render appropriate editor based on step type */}
//               {selectedStep.type === 'query' && (
//                 <SecureQueryStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'calculation' && (
//                 <SecureCalculationStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'condition' && (
//                 <SecureConditionStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   allSteps={steps.filter(s => s.id !== selectedStep.id)}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'notification' && (
//                 <SecureNotificationStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'transaction' && (
//                 <SecureTransactionStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'update' && (
//                 <SecureUpdateStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {/* *** NEW: Add the three new step editors *** */}
//               {selectedStep.type === 'sub_workflow' && (
//                 <SubWorkflowStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {selectedStep.type === 'terminal_condition' && (
//                 <TerminalConditionStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                   allWorkflows={callableWorkflows}
//                 />
//               )}

//               {selectedStep.type === 'approval_step' && (
//                 <ApprovalStepEditor
//                   config={selectedStep.config}
//                   onChange={config => updateStep(selectedStepIndex!, { config })}
//                   availableVars={availableVariables}
//                   triggerType={form.trigger_type}
//                 />
//               )}

//               {/* Next Step Configuration (for non-terminal steps) */}
//               {!['terminal_condition', 'approval_step'].includes(selectedStep.type) && (
//                 <div
//                   style={{
//                     marginTop: '1.5rem',
//                     paddingTop: '1rem',
//                     borderTop: '1px solid #e2e8f0',
//                   }}
//                 >
//                   <Select
//                     label="Next Step"
//                     value={selectedStep.next || ''}
//                     onChange={value => updateStep(selectedStepIndex!, { next: value || undefined })}
//                     options={[
//                       { value: '', label: 'No next step (end workflow)' },
//                       ...steps
//                         .filter(step => step.id !== selectedStep.id)
//                         .map(step => ({ value: step.id, label: `${step.name} (${step.id})` })),
//                     ]}
//                     helpText="Select which step should execute after this one completes"
//                   />
//                 </div>
//               )}

//               {/* Condition Branch Configuration */}
//               {selectedStep.type === 'condition' && (
//                 <div
//                   style={{
//                     marginTop: '1rem',
//                     display: 'grid',
//                     gridTemplateColumns: '1fr 1fr',
//                     gap: '1rem',
//                   }}
//                 >
//                   <Select
//                     label="On True"
//                     value={selectedStep.on_true || ''}
//                     onChange={value =>
//                       updateStep(selectedStepIndex!, { on_true: value || undefined })
//                     }
//                     options={[
//                       { value: '', label: 'No branch' },
//                       ...steps
//                         .filter(step => step.id !== selectedStep.id)
//                         .map(step => ({ value: step.id, label: `${step.name} (${step.id})` })),
//                     ]}
//                     helpText="Step to execute when condition is true"
//                   />
//                   <Select
//                     label="On False"
//                     value={selectedStep.on_false || ''}
//                     onChange={value =>
//                       updateStep(selectedStepIndex!, { on_false: value || undefined })
//                     }
//                     options={[
//                       { value: '', label: 'No branch' },
//                       ...steps
//                         .filter(step => step.id !== selectedStep.id)
//                         .map(step => ({ value: step.id, label: `${step.name} (${step.id})` })),
//                     ]}
//                     helpText="Step to execute when condition is false"
//                   />
//                 </div>
//               )}
//             </StepEditorCard>
//           )}

//           {/* Workflow Visualizer */}
//           <Card title="Workflow Preview">
//             <VisualizerContainer>
//               <WorkflowVisualizer
//                 steps={steps}
//                 initialStepId={initialStepId}
//                 selectedStepId={selectedStep?.id}
//                 onStepSelect={stepId => {
//                   const index = steps.findIndex(s => s.id === stepId);
//                   setSelectedStepIndex(index >= 0 ? index : null);
//                 }}
//               />
//             </VisualizerContainer>
//           </Card>

//           {/* JSON Preview & Actions */}
//           <Card title="Preview & Actions">
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//               <details>
//                 <summary style={{ cursor: 'pointer', fontWeight: 600 }}>JSON Preview</summary>
//                 <pre
//                   style={{
//                     background: '#f8fafc',
//                     padding: '1rem',
//                     borderRadius: '4px',
//                     fontSize: '0.75rem',
//                     maxHeight: '200px',
//                     overflow: 'auto',
//                     marginTop: '0.5rem',
//                   }}
//                 >
//                   {JSON.stringify(workflowTemplate, null, 2)}
//                 </pre>
//               </details>

//               <Button onClick={handleSubmit} disabled={saving} fullWidth>
//                 {saving ? 'Creating Workflow...' : 'Create Workflow'}
//               </Button>
//             </div>
//           </Card>
//         </Sidebar>
//       </Grid>
//     </Container>
//   );
// };

// export default CreateWorkflowPage;
