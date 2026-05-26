// // src/components/workflow/TerminalConditionStepEditor.tsx
// import React, { useState, useEffect, useCallback, useMemo } from 'react';
// import { WorkflowSummary, AvailableVariable } from './types';

// // Extract condition row component
// const ConditionRow: React.FC<{
//   condition: any;
//   index: number;
//   onUpdate: (index: number, updates: any) => void;
//   onRemove: (index: number) => void;
//   allowedVariables: AvailableVariable[];
//   getOperatorsForType: (varType: string) => string[];
//   getComparisonValues: (varType: string, varPath: string) => AvailableVariable[];
// }> = ({
//   condition,
//   index,
//   onUpdate,
//   onRemove,
//   allowedVariables,
//   getOperatorsForType,
//   getComparisonValues,
// }) => {
//   const selectedVar = useMemo(
//     () => allowedVariables.find(v => v.path === condition.field),
//     [allowedVariables, condition.field]
//   );

//   const operators = useMemo(
//     () => (selectedVar ? getOperatorsForType(selectedVar.type) : ['==']),
//     [selectedVar, getOperatorsForType]
//   );

//   const comparisonVars = useMemo(
//     () => (selectedVar ? getComparisonValues(selectedVar.type, selectedVar.path) : []),
//     [selectedVar, getComparisonValues]
//   );

//   return (
//     <div
//       style={{
//         display: 'flex',
//         flexDirection: 'column',
//         gap: '0.5rem',
//         marginBottom: '0.5rem',
//         padding: '0.75rem',
//         border: '1px solid #e2e8f0',
//         borderRadius: '0.375rem',
//         background: '#fafafa',
//       }}
//     >
//       <div style={{ display: 'flex', gap: '0.5rem' }}>
//         <select
//           value={condition.field}
//           onChange={e =>
//             onUpdate(index, {
//               field: e.target.value,
//               operator: '==',
//               compare_to: '',
//             })
//           }
//           style={{
//             flex: 1,
//             padding: '0.375rem 0.5rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//         >
//           <option value="">Select variable...</option>
//           {allowedVariables.map(v => (
//             <option key={v.path} value={v.path}>
//               {v.name} ({v.type})
//             </option>
//           ))}
//         </select>

//         <select
//           value={condition.operator}
//           onChange={e => onUpdate(index, { operator: e.target.value })}
//           style={{
//             padding: '0.375rem 0.5rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//             minWidth: '100px',
//           }}
//           disabled={!condition.field}
//         >
//           {operators.map(op => (
//             <option key={op} value={op}>
//               {op}
//             </option>
//           ))}
//         </select>

//         <select
//           value={condition.compare_to}
//           onChange={e =>
//             onUpdate(index, {
//               compare_to: e.target.value,
//               compare_type: 'variable',
//             })
//           }
//           style={{
//             flex: 1,
//             padding: '0.375rem 0.5rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//           disabled={!condition.field || comparisonVars.length === 0}
//         >
//           <option value="">
//             {!condition.field
//               ? 'Select variable first...'
//               : comparisonVars.length === 0
//                 ? 'No compatible variables'
//                 : 'Compare to...'}
//           </option>
//           {comparisonVars.map(v => (
//             <option key={v.path} value={v.path}>
//               {v.name}
//             </option>
//           ))}
//         </select>

//         <button
//           onClick={() => onRemove(index)}
//           style={{
//             color: '#e53e3e',
//             background: 'none',
//             border: 'none',
//             cursor: 'pointer',
//             fontSize: '1.25rem',
//             padding: '0 0.5rem',
//           }}
//         >
//           ×
//         </button>
//       </div>
//     </div>
//   );
// };

// // Extract branch configuration component
// const BranchConfig: React.FC<{
//   type: 'true' | 'false';
//   config: {
//     action: string;
//     workflow_id: string;
//     input_mapping: Record<string, string>;
//     status: string;
//   };
//   onConfigChange: (updates: any) => void;
//   allWorkflows: WorkflowSummary[];
//   allowedVariables: AvailableVariable[];
// }> = ({ type, config, onConfigChange, allWorkflows, allowedVariables }) => {
//   const selectedWorkflow = useMemo(
//     () => allWorkflows.find(w => w.id === config.workflow_id),
//     [allWorkflows, config.workflow_id]
//   );

//   const handleActionChange = useCallback(
//     (action: string) => {
//       onConfigChange({ action });
//     },
//     [onConfigChange]
//   );

//   const handleWorkflowChange = useCallback(
//     (workflow_id: string) => {
//       onConfigChange({ workflow_id, input_mapping: {} });
//     },
//     [onConfigChange]
//   );

//   const handleStatusChange = useCallback(
//     (status: string) => {
//       onConfigChange({ status });
//     },
//     [onConfigChange]
//   );

//   const handleInputMappingChange = useCallback(
//     (inputName: string, variablePath: string) => {
//       onConfigChange({
//         input_mapping: {
//           ...config.input_mapping,
//           [inputName]: variablePath,
//         },
//       });
//     },
//     [onConfigChange, config.input_mapping]
//   );

//   const isTrueBranch = type === 'true';
//   const branchStyles = isTrueBranch
//     ? {
//         background: '#f0fff4',
//         border: '2px solid #9ae6b4',
//         color: '#38a169',
//       }
//     : {
//         background: '#fff5f5',
//         border: '2px solid #fc8181',
//         color: '#e53e3e',
//       };

//   return (
//     <div
//       style={{
//         padding: '1rem',
//         background: branchStyles.background,
//         borderRadius: '0.375rem',
//         border: branchStyles.border,
//       }}
//     >
//       <div
//         style={{
//           fontSize: '0.875rem',
//           fontWeight: 600,
//           color: branchStyles.color,
//           marginBottom: '0.75rem',
//         }}
//       >
//         {isTrueBranch ? '✓ If TRUE' : '✗ If FALSE'}
//       </div>

//       <div style={{ marginBottom: '0.75rem' }}>
//         <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//           Action
//         </label>
//         <select
//           value={config.action}
//           onChange={e => handleActionChange(e.target.value)}
//           style={{
//             width: '100%',
//             padding: '0.375rem 0.5rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//         >
//           <option value="terminate">Terminate with status</option>
//           <option value="call_workflow">Call another workflow</option>
//         </select>
//       </div>

//       {config.action === 'terminate' && (
//         <div>
//           <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//             Status
//           </label>
//           <select
//             value={config.status}
//             onChange={e => handleStatusChange(e.target.value)}
//             style={{
//               width: '100%',
//               padding: '0.375rem 0.5rem',
//               border: '1px solid #e2e8f0',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//             }}
//           >
//             {isTrueBranch ? (
//               <>
//                 <option value="APPROVED">Approved</option>
//                 <option value="COMPLETED">Completed</option>
//                 <option value="SUCCESS">Success</option>
//                 <option value="RESOLVED">Resolved</option>
//               </>
//             ) : (
//               <>
//                 <option value="REJECTED">Rejected</option>
//                 <option value="FAILED">Failed</option>
//                 <option value="CANCELLED">Cancelled</option>
//                 <option value="ERROR">Error</option>
//               </>
//             )}
//           </select>
//         </div>
//       )}

//       {config.action === 'call_workflow' && (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//           <div>
//             <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//               Select Workflow
//             </label>
//             <select
//               value={config.workflow_id}
//               onChange={e => handleWorkflowChange(e.target.value)}
//               style={{
//                 width: '100%',
//                 padding: '0.375rem 0.5rem',
//                 border: '1px solid #e2e8f0',
//                 borderRadius: '0.375rem',
//                 fontSize: '0.875rem',
//               }}
//             >
//               <option value="">Select workflow...</option>
//               {allWorkflows.map(w => (
//                 <option key={w.id} value={w.id}>
//                   {w.name} ({w.workflow_type})
//                 </option>
//               ))}
//             </select>
//           </div>

//           {selectedWorkflow && selectedWorkflow.required_inputs.length > 0 && (
//             <div>
//               <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//                 Input Mapping
//               </label>
//               {selectedWorkflow.required_inputs.map(input => {
//                 const compatibleVars = allowedVariables.filter(v => {
//                   if (input.type === 'string') return ['string', 'object'].includes(v.type);
//                   if (input.type === 'number') return v.type === 'number';
//                   if (input.type === 'date') return v.type === 'date';
//                   if (input.type === 'boolean') return v.type === 'boolean';
//                   return false;
//                 });

//                 return (
//                   <div key={input.name} style={{ marginBottom: '0.5rem' }}>
//                     <div style={{ fontSize: '0.7rem', fontWeight: 500, marginBottom: '0.125rem' }}>
//                       {input.name} <span style={{ color: '#e53e3e' }}>*</span>
//                       <span style={{ fontWeight: 400, color: '#718096' }}> ({input.type})</span>
//                     </div>
//                     <select
//                       value={config.input_mapping[input.name] || ''}
//                       onChange={e => handleInputMappingChange(input.name, e.target.value)}
//                       style={{
//                         width: '100%',
//                         padding: '0.25rem 0.375rem',
//                         border: '1px solid #e2e8f0',
//                         borderRadius: '0.25rem',
//                         fontSize: '0.75rem',
//                       }}
//                     >
//                       <option value="">
//                         {compatibleVars.length === 0
//                           ? 'No compatible variables'
//                           : 'Select variable...'}
//                       </option>
//                       {compatibleVars.map(v => (
//                         <option key={v.path} value={v.path}>
//                           {v.name} ({v.source})
//                         </option>
//                       ))}
//                     </select>
//                   </div>
//                 );
//               })}
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export const TerminalConditionStepEditor: React.FC<{
//   config: any;
//   onChange: (config: any) => void;
//   availableVars: AvailableVariable[];
//   triggerType: 'event' | 'schedule' | 'manual';
//   allWorkflows: WorkflowSummary[];
// }> = ({ config, onChange, availableVars, triggerType, allWorkflows }) => {
//   const [conditions, setConditions] = useState(config.conditions || []);
//   const [logic, setLogic] = useState(config.logic || 'AND');

//   // True branch
//   const [onTrueAction, setOnTrueAction] = useState(config.on_true?.action || 'terminate');
//   const [onTrueWorkflow, setOnTrueWorkflow] = useState(config.on_true?.workflow_id || '');
//   const [onTrueInputMapping, setOnTrueInputMapping] = useState(config.on_true?.input_mapping || {});
//   const [onTrueStatus, setOnTrueStatus] = useState(config.on_true?.success_status || 'APPROVED');

//   // False branch
//   const [onFalseAction, setOnFalseAction] = useState(config.on_false?.action || 'terminate');
//   const [onFalseWorkflow, setOnFalseWorkflow] = useState(config.on_false?.workflow_id || '');
//   const [onFalseInputMapping, setOnFalseInputMapping] = useState(
//     config.on_false?.input_mapping || {}
//   );
//   const [onFalseStatus, setOnFalseStatus] = useState(config.on_false?.failure_status || 'REJECTED');

//   const allowedVariables = useMemo(
//     () => availableVars.filter(v => v.allowed_in_trigger.includes(triggerType)),
//     [availableVars, triggerType]
//   );

//   const getOperatorsForType = useCallback((varType: string): string[] => {
//     switch (varType) {
//       case 'number':
//         return ['==', '!=', '>', '>=', '<', '<='];
//       case 'string':
//         return ['==', '!=', 'contains', 'starts_with', 'ends_with'];
//       case 'boolean':
//         return ['==', '!='];
//       case 'date':
//         return ['==', '!=', '>', '>=', '<', '<='];
//       default:
//         return ['==', '!='];
//     }
//   }, []);

//   const getComparisonValues = useCallback(
//     (varType: string, varPath: string): AvailableVariable[] => {
//       return allowedVariables.filter(v => v.type === varType && v.path !== varPath);
//     },
//     [allowedVariables]
//   );

//   const addCondition = useCallback(() => {
//     const newConditions = [
//       ...conditions,
//       {
//         field: '',
//         operator: '==',
//         compare_to: '',
//         compare_type: 'variable' as const,
//       },
//     ];
//     setConditions(newConditions);
//   }, [conditions]);

//   const updateCondition = useCallback((index: number, updates: any) => {
//     setConditions(prev =>
//       prev.map((c: any, i: number) => (i === index ? { ...c, ...updates } : c))
//     );
//   }, []);

//   const removeCondition = useCallback((index: number) => {
//     setConditions(prev => prev.filter((_: any, i: number) => i !== index));
//   }, []);

//   const updateConfig = useCallback(() => {
//     onChange({
//       conditions,
//       logic,
//       on_true: {
//         action: onTrueAction,
//         workflow_id: onTrueAction === 'call_workflow' ? onTrueWorkflow : undefined,
//         input_mapping: onTrueAction === 'call_workflow' ? onTrueInputMapping : undefined,
//         success_status: onTrueAction === 'terminate' ? onTrueStatus : undefined,
//       },
//       on_false: {
//         action: onFalseAction,
//         workflow_id: onFalseAction === 'call_workflow' ? onFalseWorkflow : undefined,
//         input_mapping: onFalseAction === 'call_workflow' ? onFalseInputMapping : undefined,
//         failure_status: onFalseAction === 'terminate' ? onFalseStatus : undefined,
//       },
//     });
//   }, [
//     conditions,
//     logic,
//     onTrueAction,
//     onTrueWorkflow,
//     onTrueInputMapping,
//     onTrueStatus,
//     onFalseAction,
//     onFalseWorkflow,
//     onFalseInputMapping,
//     onFalseStatus,
//     onChange,
//   ]);

//   useEffect(() => {
//     updateConfig();
//   }, [updateConfig]);

//   const handleTrueBranchChange = useCallback((updates: any) => {
//     if (updates.action !== undefined) setOnTrueAction(updates.action);
//     if (updates.workflow_id !== undefined) setOnTrueWorkflow(updates.workflow_id);
//     if (updates.input_mapping !== undefined) setOnTrueInputMapping(updates.input_mapping);
//     if (updates.status !== undefined) setOnTrueStatus(updates.status);
//   }, []);

//   const handleFalseBranchChange = useCallback((updates: any) => {
//     if (updates.action !== undefined) setOnFalseAction(updates.action);
//     if (updates.workflow_id !== undefined) setOnFalseWorkflow(updates.workflow_id);
//     if (updates.input_mapping !== undefined) setOnFalseInputMapping(updates.input_mapping);
//     if (updates.status !== undefined) setOnFalseStatus(updates.status);
//   }, []);

//   const trueBranchConfig = useMemo(
//     () => ({
//       action: onTrueAction,
//       workflow_id: onTrueWorkflow,
//       input_mapping: onTrueInputMapping,
//       status: onTrueStatus,
//     }),
//     [onTrueAction, onTrueWorkflow, onTrueInputMapping, onTrueStatus]
//   );

//   const falseBranchConfig = useMemo(
//     () => ({
//       action: onFalseAction,
//       workflow_id: onFalseWorkflow,
//       input_mapping: onFalseInputMapping,
//       status: onFalseStatus,
//     }),
//     [onFalseAction, onFalseWorkflow, onFalseInputMapping, onFalseStatus]
//   );

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//       {/* Info Banner */}
//       <div
//         style={{
//           padding: '0.75rem',
//           background: '#ebf8ff',
//           borderRadius: '0.375rem',
//           border: '1px solid #90cdf4',
//           fontSize: '0.875rem',
//           color: '#2c5282',
//         }}
//       >
//         ℹ️ <strong>Terminal Condition:</strong> This step will either terminate the workflow or call
//         another workflow. It cannot continue to another step in this workflow.
//       </div>

//       {/* Logic Type */}
//       <div>
//         <label
//           style={{
//             display: 'block',
//             fontSize: '0.875rem',
//             fontWeight: 500,
//             marginBottom: '0.5rem',
//           }}
//         >
//           Logic
//         </label>
//         <select
//           value={logic}
//           onChange={e => setLogic(e.target.value)}
//           style={{
//             width: '100%',
//             padding: '0.5rem 0.75rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//         >
//           <option value="AND">AND (all conditions must be true)</option>
//           <option value="OR">OR (any condition can be true)</option>
//         </select>
//       </div>

//       {/* Conditions */}
//       <div>
//         <div
//           style={{
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'center',
//             marginBottom: '0.5rem',
//           }}
//         >
//           <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Conditions</label>
//           <button
//             onClick={addCondition}
//             disabled={allowedVariables.length === 0}
//             style={{
//               fontSize: '0.875rem',
//               color: '#4299e1',
//               background: 'none',
//               border: 'none',
//               cursor: allowedVariables.length > 0 ? 'pointer' : 'not-allowed',
//               padding: '0.25rem',
//             }}
//           >
//             + Add Condition
//           </button>
//         </div>

//         {conditions.map((condition: any, index: number) => (
//           <ConditionRow
//             key={index}
//             condition={condition}
//             index={index}
//             onUpdate={updateCondition}
//             onRemove={removeCondition}
//             allowedVariables={allowedVariables}
//             getOperatorsForType={getOperatorsForType}
//             getComparisonValues={getComparisonValues}
//           />
//         ))}

//         {conditions.length === 0 && (
//           <div
//             style={{
//               padding: '1.5rem',
//               textAlign: 'center',
//               color: '#a0aec0',
//               fontSize: '0.875rem',
//               border: '1px dashed #e2e8f0',
//               borderRadius: '0.375rem',
//             }}
//           >
//             No conditions. Click &quot;+ Add Condition&quot; to add one.
//           </div>
//         )}
//       </div>

//       {/* Branches */}
//       <div
//         style={{
//           display: 'grid',
//           gridTemplateColumns: '1fr 1fr',
//           gap: '1rem',
//           paddingTop: '0.75rem',
//           borderTop: '2px solid #e2e8f0',
//         }}
//       >
//         {/* TRUE Branch */}
//         <BranchConfig
//           type="true"
//           config={trueBranchConfig}
//           onConfigChange={handleTrueBranchChange}
//           allWorkflows={allWorkflows}
//           allowedVariables={allowedVariables}
//         />

//         {/* FALSE Branch */}
//         <BranchConfig
//           type="false"
//           config={falseBranchConfig}
//           onConfigChange={handleFalseBranchChange}
//           allWorkflows={allWorkflows}
//           allowedVariables={allowedVariables}
//         />
//       </div>
//     </div>
//   );
// };

// export default TerminalConditionStepEditor;
