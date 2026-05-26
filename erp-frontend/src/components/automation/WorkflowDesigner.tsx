import React, { useState } from 'react';
import { WorkflowAction, ApprovalStep } from '../../types/automation';
import { Account } from '../../types/accounts';
import { useAccounts } from '../../hooks/useAccounts';

interface WorkflowDesignerProps {
  actions: WorkflowAction[];
  approvalSteps: ApprovalStep[];
  onChange: (actions: WorkflowAction[], approvalSteps: ApprovalStep[]) => void;
}

const ACTION_TYPES = [
  {
    value: 'condition',
    label: 'Decision Point',
    icon: '🔀',
    description: 'Branch workflow based on conditions',
  },
  {
    value: 'notification',
    label: 'Send Notification',
    icon: '📧',
    description: 'Send email or system notification',
  },
  {
    value: 'api_call',
    label: 'External Integration',
    icon: '🔗',
    description: 'Connect to external services (bank, payment, etc.)',
  },
  { value: 'delay', label: 'Wait Period', icon: '⏰', description: 'Add delay before next step' },
  {
    value: 'transaction',
    label: 'Transaction',
    icon: '💰',
    description: 'Handle financial transactions (loans, payments, etc.)',
  },
];

export const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({
  actions,
  approvalSteps,
  onChange,
}) => {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [_draggedAction, _setDraggedAction] = useState<string | null>(null);
  const { data: _accounts } = useAccounts({ page: 1, pageSize: 100 });

  const addAction = (type: WorkflowAction['type']) => {
    const newAction: WorkflowAction = {
      id: String(Date.now()),
      type,
      name: ACTION_TYPES.find(t => t.value === type)?.label || type,
      description: '',
      order: actions.length,
      config: {
        notificationTemplate: '',
        recipients: [],
        approvers: [],
        conditions: [],
        delay: 0,
      },
      position: { x: 100, y: actions.length * 100 + 50 },
    };

    onChange([...actions, newAction], approvalSteps);
  };

  const updateAction = (actionId: string, updates: Partial<WorkflowAction>) => {
    const updatedActions = actions.map(action =>
      action.id === actionId ? { ...action, ...updates } : action
    );
    onChange(updatedActions, approvalSteps);
  };

  const removeAction = (actionId: string) => {
    const filteredActions = actions.filter(action => action.id !== actionId);
    onChange(filteredActions, approvalSteps);
  };

  const addApprovalStep = () => {
    const nextOrder = Math.max(...approvalSteps.map(s => s.order), -1) + 1;
    const newStep: ApprovalStep = {
      id: `approval_${Date.now()}`,
      name: `Approval Level ${approvalSteps.length + 1}`,
      label: `Approval Step ${approvalSteps.length + 1}`,
      approvers: [],
      level: approvalSteps.length + 1,
      requiresAll: false,
      allowComments: true,
      order: nextOrder,
      onApprove: {
        actions: [],
      },
      onReject: {
        actions: [],
      },
    };

    onChange(actions, [...approvalSteps, newStep]);
  };

  const updateApprovalStep = (stepId: string, updates: Partial<ApprovalStep>) => {
    const updatedSteps = approvalSteps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    );
    onChange(actions, updatedSteps);
  };

  const removeApprovalStep = (stepId: string) => {
    const filteredSteps = approvalSteps.filter(step => step.id !== stepId);
    onChange(actions, filteredSteps);
  };

  return (
    <div className="workflow-designer">
      <div className="designer-header">
        <h3>Workflow Designer</h3>
        <p>Design your automation workflow using user-friendly building blocks</p>
      </div>

      <div className="designer-content">
        <div className="action-palette">
          <h4>Available Actions</h4>
          {ACTION_TYPES.map(type => (
            <div
              key={type.value}
              className="action-type"
              onClick={() => addAction(type.value as WorkflowAction['type'])}
            >
              <span className="action-icon">{type.icon}</span>
              <div className="action-info">
                <strong>{type.label}</strong>
                <small>{type.description}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="workflow-canvas">
          <h4>Workflow Steps</h4>
          {actions.length === 0 ? (
            <div className="empty-canvas">
              <p>Click on actions from the left to start building your workflow</p>
            </div>
          ) : (
            <div className="workflow-steps">
              {actions.map((action, index) => (
                <div key={action.id} className="workflow-step">
                  <div className="step-number">{index + 1}</div>
                  <div
                    className={`step-card ${selectedAction === action.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAction(action.id)}
                  >
                    <div className="step-header">
                      <span className="step-icon">
                        {ACTION_TYPES.find(t => t.value === action.type)?.icon}
                      </span>
                      <span className="step-name">{action.name}</span>
                      <button
                        className="remove-step"
                        onClick={e => {
                          e.stopPropagation();
                          removeAction(action.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {action.description && (
                      <div className="step-description">{action.description}</div>
                    )}
                  </div>
                  {index < actions.length - 1 && <div className="step-connector">↓</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="action-config">
          {selectedAction ? (
            <ActionConfigPanel
              action={actions.find(a => a.id === selectedAction)!}
              onUpdate={updates => updateAction(selectedAction, updates)}
              accounts={_accounts as any}
            />
          ) : (
            <div className="no-selection">
              <p>Select a workflow step to configure it</p>
            </div>
          )}
        </div>
      </div>

      <div className="approval-steps-section">
        <div className="section-header">
          <h4>Approval Levels</h4>
          <button onClick={addApprovalStep} className="add-approval-btn">
            + Add Approval Level
          </button>
        </div>

        {approvalSteps.map(step => (
          <div key={step.id} className="approval-step-card">
            <div className="approval-header">
              <input
                type="text"
                value={step.name}
                onChange={e => updateApprovalStep(step.id, { name: e.target.value })}
                className="approval-name"
              />
              <button onClick={() => removeApprovalStep(step.id)} className="remove-approval">
                ×
              </button>
            </div>

            <div className="approval-config">
              <div className="config-row">
                <label>Level:</label>
                <input
                  type="number"
                  value={step.level}
                  onChange={e => updateApprovalStep(step.id, { level: parseInt(e.target.value) })}
                  min="1"
                />
              </div>

              <div className="config-row">
                <label>Approvers (comma-separated emails):</label>
                <input
                  type="text"
                  value={step.approvers.join(', ')}
                  onChange={e =>
                    updateApprovalStep(step.id, {
                      approvers: e.target.value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s),
                    })
                  }
                  placeholder="user1@example.com, user2@example.com"
                />
              </div>

              <div className="config-checkboxes">
                <label>
                  <input
                    type="checkbox"
                    checked={step.requiresAll}
                    onChange={e => updateApprovalStep(step.id, { requiresAll: e.target.checked })}
                  />
                  Require all approvers (otherwise any one approver is sufficient)
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={step.allowComments}
                    onChange={e => updateApprovalStep(step.id, { allowComments: e.target.checked })}
                  />
                  Allow comments during approval
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .workflow-designer {
          padding: 20px;
        }

        .designer-content {
          display: grid;
          grid-template-columns: 250px 1fr 300px;
          gap: 20px;
          margin: 20px 0;
        }

        .action-palette {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          height: fit-content;
        }

        .action-type {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          margin-bottom: 8px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-type:hover {
          border-color: #007bff;
          box-shadow: 0 2px 4px rgba(0, 123, 255, 0.1);
        }

        .action-icon {
          font-size: 20px;
          width: 30px;
          text-align: center;
        }

        .action-info strong {
          display: block;
          font-size: 14px;
        }

        .action-info small {
          color: #666;
          font-size: 12px;
        }

        .workflow-canvas {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          min-height: 400px;
        }

        .empty-canvas {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 300px;
          color: #666;
          border: 2px dashed #ddd;
          border-radius: 8px;
        }

        .workflow-steps {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .workflow-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 10px;
        }

        .step-number {
          background: #007bff;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }

        .step-card {
          background: white;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          padding: 15px;
          width: 280px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .step-card:hover {
          border-color: #007bff;
        }

        .step-card.selected {
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .step-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .step-icon {
          font-size: 18px;
        }

        .step-name {
          flex: 1;
          font-weight: bold;
        }

        .remove-step {
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          cursor: pointer;
          font-size: 14px;
        }

        .step-description {
          margin-top: 8px;
          color: #666;
          font-size: 14px;
        }

        .step-connector {
          font-size: 20px;
          color: #007bff;
          margin: 5px 0;
        }

        .action-config {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          height: fit-content;
        }

        .no-selection {
          text-align: center;
          color: #666;
          padding: 40px 20px;
        }

        .approval-steps-section {
          margin-top: 30px;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .add-approval-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }

        .approval-step-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 15px;
        }

        .approval-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .approval-name {
          font-size: 16px;
          font-weight: bold;
          border: none;
          background: transparent;
          flex: 1;
        }

        .remove-approval {
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          cursor: pointer;
        }

        .approval-config {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .config-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .config-row label {
          min-width: 120px;
          font-weight: 500;
        }

        .config-row input {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .config-checkboxes {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .config-checkboxes label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};
// Action configuration panel component

const ActionConfigPanel: React.FC<{
  action: WorkflowAction;
  onUpdate: (updates: Partial<WorkflowAction>) => void;
  accounts?: Account[];
}> = ({ action, onUpdate, accounts: _accounts = [] }) => {
  const renderConfigFields = () => {
    switch (action.type) {
      case 'notification':
        return (
          <div className="config-fields">
            <div className="field-group">
              <label>Recipients:</label>
              <input
                type="text"
                value={action.config.recipients || ''}
                onChange={e =>
                  onUpdate({ config: { ...action.config, recipients: e.target.value } })
                }
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
            <div className="field-group">
              <label>Message Template:</label>
              <textarea
                value={action.config.message || ''}
                onChange={e => onUpdate({ config: { ...action.config, message: e.target.value } })}
                placeholder="Your form submission has been received..."
              />
            </div>
          </div>
        );

      case 'api_call':
        return (
          <div className="config-fields">
            <div className="field-group">
              <label>Integration Type:</label>
              <select
                value={action.config.integrationType || ''}
                onChange={e =>
                  onUpdate({ config: { ...action.config, integrationType: e.target.value } })
                }
              >
                <option value="">Select integration...</option>
                <option value="bank_notification">Bank Account Notification</option>
                <option value="payment_gateway">Payment Processing</option>
                <option value="webhook">Custom Webhook</option>
                <option value="database_update">Database Update</option>
              </select>
            </div>
            <div className="field-group">
              <label>Endpoint URL:</label>
              <input
                type="url"
                value={action.config.url || ''}
                onChange={e => onUpdate({ config: { ...action.config, url: e.target.value } })}
                placeholder="https://api.example.com/webhook"
              />
            </div>
            <div className="field-group">
              <label>Authentication:</label>
              <select
                value={action.config.authType || 'none'}
                onChange={e => onUpdate({ config: { ...action.config, authType: e.target.value } })}
              >
                <option value="none">None</option>
                <option value="api_key">API Key</option>
                <option value="bearer_token">Bearer Token</option>
                <option value="basic_auth">Basic Auth</option>
              </select>
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="config-fields">
            <div className="field-group">
              <label>Condition Field:</label>
              <input
                type="text"
                value={action.config.field || ''}
                onChange={e => onUpdate({ config: { ...action.config, field: e.target.value } })}
                placeholder="amount, status, etc."
              />
            </div>
            <div className="field-group">
              <label>Operator:</label>
              <select
                value={action.config.operator || ''}
                onChange={e => onUpdate({ config: { ...action.config, operator: e.target.value } })}
              >
                <option value="">Select operator...</option>
                <option value="equals">Equals</option>
                <option value="greater_than">Greater than</option>
                <option value="less_than">Less than</option>
                <option value="contains">Contains</option>
              </select>
            </div>
            <div className="field-group">
              <label>Value:</label>
              <input
                type="text"
                value={action.config.value || ''}
                onChange={e => onUpdate({ config: { ...action.config, value: e.target.value } })}
                placeholder="Comparison value"
              />
            </div>
          </div>
        );

      case 'delay':
        return (
          <div className="config-fields">
            <div className="field-group">
              <label>Delay Duration:</label>
              <input
                type="number"
                value={action.config.duration || ''}
                onChange={e =>
                  onUpdate({ config: { ...action.config, duration: parseInt(e.target.value) } })
                }
                placeholder="Duration"
              />
            </div>
            <div className="field-group">
              <label>Time Unit:</label>
              <select
                value={action.config.unit || 'minutes'}
                onChange={e => onUpdate({ config: { ...action.config, unit: e.target.value } })}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        );

      default:
        return (
          <div className="config-fields">
            <p>No additional configuration needed for this action type.</p>
          </div>
        );
    }
  };

  return (
    <div className="action-config-panel">
      <h4>Configure Action</h4>

      <div className="field-group">
        <label>Action Name:</label>
        <input type="text" value={action.name} onChange={e => onUpdate({ name: e.target.value })} />
      </div>

      <div className="field-group">
        <label>Description:</label>
        <textarea
          value={action.description}
          onChange={e => onUpdate({ description: e.target.value })}
          placeholder="Describe what this action does..."
        />
      </div>

      {renderConfigFields()}

      <style jsx>{`
        .action-config-panel {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .config-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .field-group label {
          font-weight: 500;
          font-size: 14px;
        }

        .field-group input,
        .field-group select,
        .field-group textarea {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .field-group textarea {
          min-height: 60px;
          resize: vertical;
        }
      `}</style>
    </div>
  );
};
