// // src/components/workflow/SubWorkflowStepEditor.tsx
// import React, { useState, useEffect, useCallback, useMemo } from 'react';
// import { automationService } from '../../../services/automationService';
// import { WorkflowSummary, AvailableVariable } from './types';

// /* ---------------------- Sub-Workflow Step Editor ---------------------- */
// export const SubWorkflowStepEditor: React.FC<{
//   config: any;
//   onChange: (config: any) => void;
//   availableVars: AvailableVariable[];
//   triggerType: 'event' | 'schedule' | 'manual';
// }> = ({ config, onChange, availableVars, triggerType }) => {
//   const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [selectedWorkflowId, setSelectedWorkflowId] = useState(config.workflow_id || '');
//   const [workflowVersion, setWorkflowVersion] = useState(config.workflow_version || 'latest');
//   const [inputMapping, setInputMapping] = useState<Record<string, string>>(
//     config.input_mapping || {}
//   );
//   const [outputMapping, setOutputMapping] = useState<Record<string, string>>(
//     config.output_mapping || {}
//   );
//   const [errorHandling, setErrorHandling] = useState(config.on_error || 'fail');
//   const [maxRetries, setMaxRetries] = useState(config.max_retries || 3);
//   const [retryDelay, setRetryDelay] = useState(config.retry_delay_seconds || 5);
//   const [timeout, setTimeout] = useState(config.timeout_seconds || 30);

//   // Fetch callable workflows
//   useEffect(() => {
//     const fetchWorkflows = async () => {
//       setLoading(true);
//       try {
//         const response = await automationService.getCallableWorkflows();
//         setWorkflows(response.workflows);
//       } catch (error) {
//         console.error('Failed to fetch workflows:', error);
//         setWorkflows([]);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchWorkflows();
//   }, []);

//   const selectedWorkflow = useMemo(
//     () => workflows.find(w => w.id === selectedWorkflowId),
//     [workflows, selectedWorkflowId]
//   );

//   // Filter variables by trigger type
//   const allowedVariables = useMemo(
//     () => availableVars.filter(v => v.allowed_in_trigger.includes(triggerType)),
//     [availableVars, triggerType]
//   );

//   // Get compatible variables for a specific input type
//   const getCompatibleVariables = useCallback(
//     (inputType: string): AvailableVariable[] => {
//       return allowedVariables.filter(v => {
//         if (inputType === 'string') return ['string', 'object'].includes(v.type);
//         if (inputType === 'number') return v.type === 'number';
//         if (inputType === 'date') return v.type === 'date';
//         if (inputType === 'boolean') return v.type === 'boolean';
//         return false;
//       });
//     },
//     [allowedVariables]
//   );

//   const updateConfig = useCallback(() => {
//     onChange({
//       workflow_id: selectedWorkflowId,
//       workflow_version: workflowVersion === 'latest' ? undefined : parseInt(workflowVersion),
//       input_mapping: inputMapping,
//       output_mapping: outputMapping,
//       on_error: errorHandling,
//       max_retries: errorHandling === 'retry' ? maxRetries : undefined,
//       retry_delay_seconds: errorHandling === 'retry' ? retryDelay : undefined,
//       timeout_seconds: timeout,
//     });
//   }, [
//     onChange,
//     selectedWorkflowId,
//     workflowVersion,
//     inputMapping,
//     outputMapping,
//     errorHandling,
//     maxRetries,
//     retryDelay,
//     timeout,
//   ]);

//   useEffect(() => {
//     updateConfig();
//   }, [updateConfig]);

//   const updateInputMapping = useCallback((inputName: string, variablePath: string) => {
//     setInputMapping(prev => ({ ...prev, [inputName]: variablePath }));
//   }, []);

//   const updateOutputMapping = useCallback((variableName: string, outputPath: string) => {
//     setOutputMapping(prev => ({ ...prev, [variableName]: outputPath }));
//   }, []);

//   const handleWorkflowChange = useCallback((newWorkflowId: string) => {
//     setSelectedWorkflowId(newWorkflowId);
//     setInputMapping({});
//     setOutputMapping({});
//   }, []);

//   // Group workflows by category
//   const groupedWorkflows = useMemo(
//     () =>
//       workflows.reduce(
//         (acc, workflow) => {
//           const category = workflow.category || 'Other';
//           if (!acc[category]) acc[category] = [];
//           acc[category].push(workflow);
//           return acc;
//         },
//         {} as Record<string, WorkflowSummary[]>
//       ),
//     [workflows]
//   );

//   const hasUnmappedRequiredInputs = useMemo(
//     () => selectedWorkflow?.required_inputs.some(input => !inputMapping[input.name]) ?? false,
//     [selectedWorkflow, inputMapping]
//   );

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//       {/* Workflow Selection */}
//       <div>
//         <label
//           style={{
//             display: 'block',
//             fontSize: '0.875rem',
//             fontWeight: 500,
//             marginBottom: '0.5rem',
//           }}
//         >
//           Select Workflow to Call
//         </label>
//         <select
//           value={selectedWorkflowId}
//           onChange={e => handleWorkflowChange(e.target.value)}
//           style={{
//             width: '100%',
//             padding: '0.5rem 0.75rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//           disabled={loading}
//         >
//           <option value="">{loading ? 'Loading workflows...' : 'Select workflow...'}</option>
//           {Object.entries(groupedWorkflows).map(([category, categoryWorkflows]) => (
//             <optgroup key={category} label={category}>
//               {categoryWorkflows.map(w => (
//                 <option key={w.id} value={w.id}>
//                   {w.workflow_type === 'system' && '⭐ '}
//                   {w.name} (v{w.version}){w.is_atomic && ' [Atomic]'}
//                 </option>
//               ))}
//             </optgroup>
//           ))}
//         </select>

//         {selectedWorkflow && <WorkflowDetails workflow={selectedWorkflow} />}
//       </div>

//       {/* Version Selection */}
//       {selectedWorkflow && (
//         <VersionSelection
//           workflow={selectedWorkflow}
//           workflowVersion={workflowVersion}
//           onVersionChange={setWorkflowVersion}
//         />
//       )}

//       {/* Input Mapping */}
//       {selectedWorkflow && selectedWorkflow.required_inputs.length > 0 && (
//         <InputMappingSection
//           workflow={selectedWorkflow}
//           inputMapping={inputMapping}
//           onInputMappingChange={updateInputMapping}
//           getCompatibleVariables={getCompatibleVariables}
//           hasUnmappedRequiredInputs={hasUnmappedRequiredInputs}
//         />
//       )}

//       {/* Output Mapping */}
//       {selectedWorkflow && selectedWorkflow.outputs.length > 0 && (
//         <OutputMappingSection
//           workflow={selectedWorkflow}
//           outputMapping={outputMapping}
//           onOutputMappingChange={updateOutputMapping}
//         />
//       )}

//       {/* Error Handling */}
//       {selectedWorkflow && (
//         <ErrorHandlingSection
//           errorHandling={errorHandling}
//           onErrorHandlingChange={setErrorHandling}
//           maxRetries={maxRetries}
//           onMaxRetriesChange={setMaxRetries}
//           retryDelay={retryDelay}
//           onRetryDelayChange={setRetryDelay}
//           isAtomic={selectedWorkflow.is_atomic}
//         />
//       )}

//       {/* Timeout */}
//       {selectedWorkflow && <TimeoutSection timeout={timeout} onTimeoutChange={setTimeout} />}

//       {/* No Workflow Selected */}
//       {!selectedWorkflow && !loading && (
//         <div
//           style={{
//             padding: '2rem',
//             textAlign: 'center',
//             color: '#a0aec0',
//             fontSize: '0.875rem',
//             border: '1px dashed #e2e8f0',
//             borderRadius: '0.375rem',
//           }}
//         >
//           Select a workflow to configure inputs and outputs
//         </div>
//       )}
//     </div>
//   );
// };

// /* ---------------------- Sub-Components ---------------------- */

// const WorkflowDetails: React.FC<{ workflow: WorkflowSummary }> = ({ workflow }) => (
//   <div
//     style={{
//       marginTop: '0.5rem',
//       padding: '0.75rem',
//       background: '#f8fafc',
//       borderRadius: '0.375rem',
//       fontSize: '0.875rem',
//     }}
//   >
//     <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
//       {workflow.workflow_type === 'system' && '⭐ '}
//       {workflow.name}
//     </div>
//     <div style={{ fontSize: '0.75rem', color: '#718096' }}>{workflow.description}</div>
//     <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
//       Est. Duration: {workflow.estimated_duration_ms}ms | Used {workflow.usage_count} times
//     </div>
//     {workflow.is_atomic && (
//       <div
//         style={{
//           marginTop: '0.5rem',
//           padding: '0.5rem',
//           background: '#ebf8ff',
//           border: '1px solid #90cdf4',
//           borderRadius: '0.25rem',
//           fontSize: '0.75rem',
//           color: '#2c5282',
//         }}
//       >
//         ℹ️ Atomic workflow: All steps execute together or none at all
//       </div>
//     )}
//   </div>
// );

// const VersionSelection: React.FC<{
//   workflow: WorkflowSummary;
//   workflowVersion: string;
//   onVersionChange: (version: string) => void;
// }> = ({ workflow, workflowVersion, onVersionChange }) => (
//   <div>
//     <label
//       style={{
//         display: 'block',
//         fontSize: '0.875rem',
//         fontWeight: 500,
//         marginBottom: '0.5rem',
//       }}
//     >
//       Version
//     </label>
//     <select
//       value={workflowVersion}
//       onChange={e => onVersionChange(e.target.value)}
//       style={{
//         width: '100%',
//         padding: '0.5rem 0.75rem',
//         border: '1px solid #e2e8f0',
//         borderRadius: '0.375rem',
//         fontSize: '0.875rem',
//       }}
//     >
//       <option value="latest">Latest (Recommended)</option>
//       <option value={workflow.version}>v{workflow.version} (Current)</option>
//     </select>
//     <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
//       Use "Latest" to automatically use newest version, or pin to specific version
//     </div>
//   </div>
// );

// const InputMappingSection: React.FC<{
//   workflow: WorkflowSummary;
//   inputMapping: Record<string, string>;
//   onInputMappingChange: (inputName: string, variablePath: string) => void;
//   getCompatibleVariables: (inputType: string) => AvailableVariable[];
//   hasUnmappedRequiredInputs: boolean;
// }> = ({
//   workflow,
//   inputMapping,
//   onInputMappingChange,
//   getCompatibleVariables,
//   hasUnmappedRequiredInputs,
// }) => (
//   <div
//     style={{
//       padding: '1rem',
//       background: '#f8fafc',
//       borderRadius: '0.375rem',
//       border: '1px solid #e2e8f0',
//     }}
//   >
//     <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.75rem' }}>
//       Input Mapping
//     </div>

//     {workflow.required_inputs.map(input => {
//       const compatibleVars = getCompatibleVariables(input.type);
//       const isMapped = !!inputMapping[input.name];

//       return (
//         <div key={input.name} style={{ marginBottom: '0.75rem' }}>
//           <label
//             style={{
//               display: 'block',
//               fontSize: '0.75rem',
//               fontWeight: 500,
//               marginBottom: '0.25rem',
//             }}
//           >
//             {input.name} <span style={{ color: '#e53e3e' }}>*</span>
//             <span style={{ fontWeight: 400, color: '#718096' }}> ({input.type})</span>
//           </label>
//           <select
//             value={inputMapping[input.name] || ''}
//             onChange={e => onInputMappingChange(input.name, e.target.value)}
//             style={{
//               width: '100%',
//               padding: '0.375rem 0.5rem',
//               border: isMapped ? '1px solid #48bb78' : '1px solid #e2e8f0',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//               background: isMapped ? '#f0fff4' : '#fff',
//             }}
//           >
//             <option value="">
//               {compatibleVars.length === 0 ? 'No compatible variables' : 'Select variable...'}
//             </option>
//             {compatibleVars.map(v => (
//               <option key={v.path} value={v.path}>
//                 {v.name} ({v.source})
//               </option>
//             ))}
//           </select>
//           {input.description && (
//             <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.25rem' }}>
//               {input.description}
//             </div>
//           )}
//           {input.validation && (
//             <div style={{ fontSize: '0.7rem', color: '#ed8936', marginTop: '0.25rem' }}>
//               Validation: {input.validation}
//             </div>
//           )}
//         </div>
//       );
//     })}

//     {/* Validation Status */}
//     {hasUnmappedRequiredInputs && (
//       <div
//         style={{
//           marginTop: '0.5rem',
//           padding: '0.5rem',
//           background: '#fff5f5',
//           border: '1px solid #feb2b2',
//           borderRadius: '0.25rem',
//           fontSize: '0.75rem',
//           color: '#c53030',
//         }}
//       >
//         ⚠️ Please map all required inputs
//       </div>
//     )}
//   </div>
// );

// const OutputMappingSection: React.FC<{
//   workflow: WorkflowSummary;
//   outputMapping: Record<string, string>;
//   onOutputMappingChange: (variableName: string, outputPath: string) => void;
// }> = ({ workflow, outputMapping, onOutputMappingChange }) => (
//   <div
//     style={{
//       padding: '1rem',
//       background: '#f8fafc',
//       borderRadius: '0.375rem',
//       border: '1px solid #e2e8f0',
//     }}
//   >
//     <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.75rem' }}>
//       Output Mapping
//     </div>
//     <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.75rem' }}>
//       Save workflow outputs as variables for use in subsequent steps
//     </div>

//     {workflow.outputs.map(output => (
//       <div key={output.name} style={{ marginBottom: '0.75rem' }}>
//         <label
//           style={{
//             display: 'block',
//             fontSize: '0.75rem',
//             fontWeight: 500,
//             marginBottom: '0.25rem',
//           }}
//         >
//           {output.name}
//           <span style={{ fontWeight: 400, color: '#718096' }}> ({output.type})</span>
//         </label>
//         <input
//           type="text"
//           value={outputMapping[output.name] || ''}
//           onChange={e => onOutputMappingChange(output.name, e.target.value)}
//           placeholder="Save as variable name (optional)"
//           style={{
//             width: '100%',
//             padding: '0.375rem 0.5rem',
//             border: '1px solid #e2e8f0',
//             borderRadius: '0.375rem',
//             fontSize: '0.875rem',
//           }}
//         />
//         {output.description && (
//           <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.25rem' }}>
//             {output.description}
//           </div>
//         )}
//       </div>
//     ))}
//   </div>
// );

// const ErrorHandlingSection: React.FC<{
//   errorHandling: string;
//   onErrorHandlingChange: (value: string) => void;
//   maxRetries: number;
//   onMaxRetriesChange: (value: number) => void;
//   retryDelay: number;
//   onRetryDelayChange: (value: number) => void;
//   isAtomic: boolean;
// }> = ({
//   errorHandling,
//   onErrorHandlingChange,
//   maxRetries,
//   onMaxRetriesChange,
//   retryDelay,
//   onRetryDelayChange,
//   isAtomic,
// }) => (
//   <div>
//     <label
//       style={{
//         display: 'block',
//         fontSize: '0.875rem',
//         fontWeight: 500,
//         marginBottom: '0.5rem',
//       }}
//     >
//       Error Handling
//     </label>
//     <select
//       value={errorHandling}
//       onChange={e => onErrorHandlingChange(e.target.value)}
//       style={{
//         width: '100%',
//         padding: '0.5rem 0.75rem',
//         border: '1px solid #e2e8f0',
//         borderRadius: '0.375rem',
//         fontSize: '0.875rem',
//       }}
//     >
//       <option value="fail">Fail entire workflow</option>
//       <option value="continue">Continue to next step</option>
//       <option value="retry">Retry with backoff</option>
//       {isAtomic && <option value="rollback">Rollback changes</option>}
//     </select>

//     {errorHandling === 'retry' && (
//       <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
//         <div style={{ flex: 1 }}>
//           <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//             Max Retries
//           </label>
//           <input
//             type="number"
//             min="1"
//             max="10"
//             value={maxRetries}
//             onChange={e => onMaxRetriesChange(parseInt(e.target.value))}
//             style={{
//               width: '100%',
//               padding: '0.375rem 0.5rem',
//               border: '1px solid #e2e8f0',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//             }}
//           />
//         </div>
//         <div style={{ flex: 1 }}>
//           <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
//             Retry Delay (seconds)
//           </label>
//           <input
//             type="number"
//             min="1"
//             max="60"
//             value={retryDelay}
//             onChange={e => onRetryDelayChange(parseInt(e.target.value))}
//             style={{
//               width: '100%',
//               padding: '0.375rem 0.5rem',
//               border: '1px solid #e2e8f0',
//               borderRadius: '0.375rem',
//               fontSize: '0.875rem',
//             }}
//           />
//         </div>
//       </div>
//     )}
//   </div>
// );

// const TimeoutSection: React.FC<{
//   timeout: number;
//   onTimeoutChange: (value: number) => void;
// }> = ({ timeout, onTimeoutChange }) => (
//   <div>
//     <label
//       style={{
//         display: 'block',
//         fontSize: '0.875rem',
//         fontWeight: 500,
//         marginBottom: '0.5rem',
//       }}
//     >
//       Timeout (seconds)
//     </label>
//     <input
//       type="number"
//       min="5"
//       max="300"
//       value={timeout}
//       onChange={e => onTimeoutChange(parseInt(e.target.value))}
//       style={{
//         width: '100%',
//         padding: '0.5rem 0.75rem',
//         border: '1px solid #e2e8f0',
//         borderRadius: '0.375rem',
//         fontSize: '0.875rem',
//       }}
//     />
//     <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
//       Workflow will be cancelled if it takes longer than this
//     </div>
//   </div>
// );

// export default SubWorkflowStepEditor;
