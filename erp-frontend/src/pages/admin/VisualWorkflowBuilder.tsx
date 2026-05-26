import React, { useState, useEffect } from 'react';
import {
  Plus,
  Play,
  Database,
  Calculator,
  Mail,
  GitBranch,
  Save,
  AlertCircle,
  Check,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface AvailableVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'object';
  source: 'form' | 'query' | 'calculation';
  path: string; // e.g., "form.amount", "step_1.results.0.balance"
}

interface StepConfig {
  id: string;
  name: string;
  type: 'query' | 'condition' | 'calculation' | 'transaction' | 'notification';
  config: any;
  next?: string;
  on_true?: string;
  on_false?: string;
}

// ============================================
// VISUAL STEP EDITOR - Query Step
// ============================================

const QueryStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [entity, setEntity] = useState(config.entity || '');
  const [filters, setFilters] = useState<Array<{ field: string; operator: string; value: string }>>(
    config.filters || []
  );

  const entities = ['Account', 'Transaction', 'User']; // From backend whitelist
  const [fields, setFields] = useState<string[]>([]);

  // Load available fields for selected entity
  useEffect(() => {
    if (entity) {
      // In real app, fetch from backend
      fetch(`/api/automations/entities/${entity}/fields/`)
        .then(res => res.json())
        .then(data => setFields(data.fields))
        .catch(() => setFields(['id', 'name', 'balance', 'status'])); // Fallback
    }
  }, [entity]);

  const addFilter = () => {
    const newFilters = [...filters, { field: '', operator: '==', value: '' }];
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  const updateFilter = (index: number, updates: Partial<(typeof filters)[0]>) => {
    const newFilters = filters.map((f, i) => (i === index ? { ...f, ...updates } : f));
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    onChange({ entity, filters: newFilters });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Query Entity</label>
        <select
          value={entity}
          onChange={e => {
            setEntity(e.target.value);
            onChange({ entity: e.target.value, filters });
          }}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select entity...</option>
          {entities.map(e => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Filters</label>
          <button onClick={addFilter} className="text-sm text-blue-600 hover:text-blue-700">
            + Add Filter
          </button>
        </div>

        {filters.map((filter, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <select
              value={filter.field}
              onChange={e => updateFilter(index, { field: e.target.value })}
              className="flex-1 px-2 py-1 border rounded text-sm"
            >
              <option value="">Field...</option>
              {fields.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <select
              value={filter.operator}
              onChange={e => updateFilter(index, { operator: e.target.value })}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">{'>='}</option>
              <option value="<">{'<'}</option>
              <option value="<=">{'<='}</option>
            </select>

            <select
              value={filter.value}
              onChange={e => updateFilter(index, { value: e.target.value })}
              className="flex-1 px-2 py-1 border rounded text-sm"
            >
              <option value="">Value...</option>
              {availableVars.map(v => (
                <option key={v.path} value={`\${${v.path}}`}>
                  {v.name} ({v.source})
                </option>
              ))}
            </select>

            <button onClick={() => removeFilter(index)} className="text-red-600 hover:text-red-700">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// VISUAL STEP EDITOR - Calculation Step
// ============================================

const CalculationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [formula, setFormula] = useState<string[]>(config.formula || []);
  const [resultName, setResultName] = useState(config.result_name || 'result');

  const operators = ['+', '-', '*', '/', '(', ')'];

  const addToFormula = (item: string) => {
    const newFormula = [...formula, item];
    setFormula(newFormula);
    onChange({ formula: newFormula.join(' '), result_name: resultName });
  };

  const clearFormula = () => {
    setFormula([]);
    onChange({ formula: '', result_name: resultName });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Result Variable Name</label>
        <input
          type="text"
          value={resultName}
          onChange={e => {
            setResultName(e.target.value);
            onChange({ formula: formula.join(' '), result_name: e.target.value });
          }}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="e.g., calculated_amount"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Formula Builder</label>
          <button onClick={clearFormula} className="text-sm text-red-600 hover:text-red-700">
            Clear
          </button>
        </div>

        <div className="p-3 border rounded-md bg-gray-50 mb-3 min-h-[60px] font-mono text-sm">
          {formula.join(' ') || 'Click items below to build formula...'}
        </div>

        <div className="space-y-2">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Available Variables</div>
            <div className="flex flex-wrap gap-1">
              {availableVars
                .filter(v => v.type === 'number')
                .map(v => (
                  <button
                    key={v.path}
                    onClick={() => addToFormula(v.path)}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    {v.name}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Operators</div>
            <div className="flex gap-1">
              {operators.map(op => (
                <button
                  key={op}
                  onClick={() => addToFormula(op)}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Numbers</div>
            <input
              type="number"
              placeholder="Enter number and press Enter"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  addToFormula((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// VISUAL STEP EDITOR - Condition Step
// ============================================

const ConditionStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
  allSteps: StepConfig[];
}> = ({ config, onChange, availableVars, allSteps }) => {
  const [conditions, setConditions] = useState(config.conditions || []);
  const [logic, setLogic] = useState(config.logic || 'AND');
  const [onTrue, setOnTrue] = useState(config.on_true || '');
  const [onFalse, setOnFalse] = useState(config.on_false || '');

  const addCondition = () => {
    const newConditions = [...conditions, { field: '', operator: '==', value: '' }];
    setConditions(newConditions);
    updateConfig(newConditions, logic, onTrue, onFalse);
  };

  const updateCondition = (index: number, updates: any) => {
    const newConditions = conditions.map((c: any, i: number) =>
      i === index ? { ...c, ...updates } : c
    );
    setConditions(newConditions);
    updateConfig(newConditions, logic, onTrue, onFalse);
  };

  const updateConfig = (conds: any[], log: string, trueStep: string, falseStep: string) => {
    onChange({
      conditions: conds,
      logic: log,
      on_true: trueStep,
      on_false: falseStep,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Logic</label>
        <select
          value={logic}
          onChange={e => {
            setLogic(e.target.value);
            updateConfig(conditions, e.target.value, onTrue, onFalse);
          }}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="AND">AND (all must be true)</option>
          <option value="OR">OR (any must be true)</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Conditions</label>
          <button onClick={addCondition} className="text-sm text-blue-600 hover:text-blue-700">
            + Add Condition
          </button>
        </div>

        {conditions.map((cond: any, index: number) => (
          <div key={index} className="flex gap-2 mb-2 p-2 border rounded">
            <select
              value={cond.field}
              onChange={e => updateCondition(index, { field: e.target.value })}
              className="flex-1 px-2 py-1 border rounded text-sm"
            >
              <option value="">Select variable...</option>
              {availableVars.map(v => (
                <option key={v.path} value={v.path}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>

            <select
              value={cond.operator}
              onChange={e => updateCondition(index, { operator: e.target.value })}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="==">=</option>
              <option value="!=">≠</option>
              <option value=">">{'>'}</option>
              <option value=">=">{'>='}</option>
              <option value="<">{'<'}</option>
              <option value="<=">{'<='}</option>
            </select>

            <input
              type="text"
              value={cond.value}
              onChange={e => updateCondition(index, { value: e.target.value })}
              className="flex-1 px-2 py-1 border rounded text-sm"
              placeholder="Value"
            />

            <button
              onClick={() => {
                const newConditions = conditions.filter((_: any, i: number) => i !== index);
                setConditions(newConditions);
                updateConfig(newConditions, logic, onTrue, onFalse);
              }}
              className="text-red-600 hover:text-red-700"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t">
        <div>
          <label className="block text-sm font-medium mb-2 text-green-600">If TRUE, go to:</label>
          <select
            value={onTrue}
            onChange={e => {
              setOnTrue(e.target.value);
              updateConfig(conditions, logic, e.target.value, onFalse);
            }}
            className="w-full px-3 py-2 border border-green-300 rounded-md"
          >
            <option value="">Select step...</option>
            {allSteps.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-red-600">If FALSE, go to:</label>
          <select
            value={onFalse}
            onChange={e => {
              setOnFalse(e.target.value);
              updateConfig(conditions, logic, onTrue, e.target.value);
            }}
            className="w-full px-3 py-2 border border-red-300 rounded-md"
          >
            <option value="">Select step...</option>
            {allSteps.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

// ============================================
// VISUAL STEP EDITOR - Notification Step
// ============================================

const NotificationStepEditor: React.FC<{
  config: any;
  onChange: (config: any) => void;
  availableVars: AvailableVariable[];
}> = ({ config, onChange, availableVars }) => {
  const [type, setType] = useState(config.type || 'email');
  const [recipient, setRecipient] = useState(config.recipient || '');
  const [subject, setSubject] = useState(config.subject || '');
  const [message, setMessage] = useState(config.message || '');

  const insertVariable = (varPath: string) => {
    setMessage(prev => prev + ` \${${varPath}} `);
    onChange({ type, recipient, subject, message: message + ` \${${varPath}} ` });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Notification Type</label>
        <select
          value={type}
          onChange={e => {
            setType(e.target.value);
            onChange({ type: e.target.value, recipient, subject, message });
          }}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="in_app">In-App Notification</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Recipient</label>
        <select
          value={recipient}
          onChange={e => {
            setRecipient(e.target.value);
            onChange({ type, recipient: e.target.value, subject, message });
          }}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select recipient...</option>
          {availableVars
            .filter(v => v.type === 'string')
            .map(v => (
              <option key={v.path} value={`\${${v.path}}`}>
                {v.name}
              </option>
            ))}
        </select>
      </div>

      {type === 'email' && (
        <div>
          <label className="block text-sm font-medium mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => {
              setSubject(e.target.value);
              onChange({ type, recipient, subject: e.target.value, message });
            }}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Email subject"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Message</label>
        <textarea
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            onChange({ type, recipient, subject, message: e.target.value });
          }}
          className="w-full px-3 py-2 border rounded-md"
          rows={5}
          placeholder="Type your message here..."
        />

        <div className="mt-2">
          <div className="text-xs font-medium text-gray-600 mb-1">Insert Variables:</div>
          <div className="flex flex-wrap gap-1">
            {availableVars.map(v => (
              <button
                key={v.path}
                onClick={() => insertVariable(v.path)}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                + {v.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN WORKFLOW BUILDER
// ============================================

export default function VisualWorkflowBuilder() {
  const [workflowName, setWorkflowName] = useState('');
  const [triggerType, setTriggerType] = useState<'event' | 'schedule' | 'manual'>('event');
  const [eventName, setEventName] = useState('');
  const [steps, setSteps] = useState<StepConfig[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  // Calculate available variables based on trigger and previous steps
  const availableVariables: AvailableVariable[] = React.useMemo(() => {
    const vars: AvailableVariable[] = [];

    // If event trigger, add form variables
    if (triggerType === 'event' && eventName) {
      // In real app, fetch from backend based on event_name
      vars.push(
        { name: 'Form: Account ID', type: 'string', source: 'form', path: 'form.account_id' },
        { name: 'Form: Amount', type: 'number', source: 'form', path: 'form.amount' },
        { name: 'Form: User Email', type: 'string', source: 'form', path: 'form.user.email' }
      );
    }

    // Add variables from previous steps
    steps.forEach((step, index) => {
      if (step.type === 'query') {
        vars.push({
          name: `${step.name}: Results`,
          type: 'object',
          source: 'query',
          path: `step_${step.id}.results`,
        });
      } else if (step.type === 'calculation') {
        const resultName = step.config.result_name || 'result';
        vars.push({
          name: `${step.name}: ${resultName}`,
          type: 'number',
          source: 'calculation',
          path: `step_${step.id}.${resultName}`,
        });
      }
    });

    return vars;
  }, [triggerType, eventName, steps]);

  const addStep = (type: StepConfig['type']) => {
    const newStep: StepConfig = {
      id: `step_${Date.now()}`,
      name: `New ${type} Step`,
      type,
      config: {},
    };
    setSteps([...steps, newStep]);
    setSelectedStepId(newStep.id);
  };

  const updateStep = (id: string, updates: Partial<StepConfig>) => {
    setSteps(steps.map(s => (s.id === id ? { ...s, ...updates } : s)));
  };

  const deleteStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
    if (selectedStepId === id) setSelectedStepId(null);
  };

  const validateWorkflow = async () => {
    setValidating(true);
    try {
      const workflowDef = {
        name: workflowName,
        trigger_type: triggerType,
        trigger_config: { event_name: eventName },
        workflow_definition: {
          steps,
          initial_step: steps[0]?.id,
        },
      };

      const response = await fetch('/api/automations/workflows/validate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowDef),
      });

      const result = await response.json();
      setValidationResult(result);
    } catch (error: unknown) {
      setValidationResult({ valid: false, errors: ['Validation failed'] });
    } finally {
      setValidating(false);
    }
  };

  const selectedStep = steps.find(s => s.id === selectedStepId);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-6">Create Workflow</h1>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Workflow Name</label>
              <input
                type="text"
                value={workflowName}
                onChange={e => setWorkflowName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., Process Withdrawal"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Trigger Type</label>
              <select
                value={triggerType}
                onChange={e => setTriggerType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="event">Form Event</option>
                <option value="schedule">Scheduled</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            {triggerType === 'event' && (
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Event Name</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="e.g., withdrawal_request"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => addStep('query')}
              className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              Add Query
            </button>
            <button
              onClick={() => addStep('condition')}
              className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4" />
              Add Condition
            </button>
            <button
              onClick={() => addStep('calculation')}
              className="px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              Add Calculation
            </button>
            <button
              onClick={() => addStep('notification')}
              className="px-3 py-2 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Add Notification
            </button>
          </div>

          {/* Validation Result */}
          {validationResult && (
            <div
              className={`p-4 rounded-md mb-4 ${
                validationResult.valid
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {validationResult.valid ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-medium">
                  {validationResult.valid ? 'Workflow is valid!' : 'Validation errors:'}
                </span>
              </div>
              {!validationResult.valid && (
                <ul className="list-disc list-inside text-sm">
                  {validationResult.errors?.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={validateWorkflow}
              disabled={validating}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {validating ? 'Validating...' : 'Validate Workflow'}
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              <Save className="w-4 h-4 inline mr-2" />
              Save Workflow
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Steps List */}
          <div className="col-span-2 space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                onClick={() => setSelectedStepId(step.id)}
                className={`bg-white rounded-lg p-4 cursor-pointer border-2 ${
                  selectedStepId === step.id ? 'border-blue-500' : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">
                      {index + 1}. {step.name}
                    </div>
                    <div className="text-sm text-gray-500">{step.type}</div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      deleteStep(step.id);
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {steps.length === 0 && (
              <div className="bg-white rounded-lg p-12 text-center text-gray-500">
                <p>No steps yet. Add your first step using the buttons above.</p>
              </div>
            )}
          </div>

          {/* Step Editor */}
          <div className="bg-white rounded-lg p-6">
            {selectedStep ? (
              <div>
                <h3 className="text-lg font-medium mb-4">Edit Step</h3>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Step Name</label>
                  <input
                    type="text"
                    value={selectedStep.name}
                    onChange={e => updateStep(selectedStep.id, { name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>

                {selectedStep.type === 'query' && (
                  <QueryStepEditor
                    config={selectedStep.config}
                    onChange={config => updateStep(selectedStep.id, { config })}
                    availableVars={availableVariables}
                  />
                )}

                {selectedStep.type === 'calculation' && (
                  <CalculationStepEditor
                    config={selectedStep.config}
                    onChange={config => updateStep(selectedStep.id, { config })}
                    availableVars={availableVariables}
                  />
                )}

                {selectedStep.type === 'condition' && (
                  <ConditionStepEditor
                    config={selectedStep.config}
                    onChange={config => updateStep(selectedStep.id, { config })}
                    availableVars={availableVariables}
                    allSteps={steps.filter(s => s.id !== selectedStep.id)}
                  />
                )}

                {selectedStep.type === 'notification' && (
                  <NotificationStepEditor
                    config={selectedStep.config}
                    onChange={config => updateStep(selectedStep.id, { config })}
                    availableVars={availableVariables}
                  />
                )}

                {selectedStep.type !== 'condition' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-2">Next Step</label>
                    <select
                      value={selectedStep.next || ''}
                      onChange={e => updateStep(selectedStep.id, { next: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">End workflow</option>
                      {steps
                        .filter(s => s.id !== selectedStep.id)
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <p>Select a step to edit</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
