import React, { useState } from 'react';
import { FormBuilder } from './FormBuilder';
import { WorkflowDesigner } from './WorkflowDesigner';
import { AutomationTemplate, WorkflowAction, ApprovalStep } from '../../types/automation';
import type { FormSchema } from '../../types/forms';
import { automationService } from '../../services/automationService';

interface AutomationTemplateBuilderProps {
  template?: AutomationTemplate;
  onSave?: (template: AutomationTemplate) => void;
  onCancel?: () => void;
}

export const AutomationTemplateBuilder: React.FC<AutomationTemplateBuilderProps> = ({
  template,
  onSave,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<'form' | 'workflow' | 'review'>('form');
  const [isLoading, setIsLoading] = useState(false);

  const [formSchema, setFormSchema] = useState<FormSchema>(
    template?.formSchema || {
      id: Date.now(),
      name: 'New Form',
      fields: [],
    }
  );

  const [workflowActions, setWorkflowActions] = useState<WorkflowAction[]>(
    template?.workflow || []
  );

  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>(template?.approvalSteps || []);

  const [templateInfo, setTemplateInfo] = useState({
    name: template?.name || 'New Automation Template',
    description: template?.description || '',
    isActive: template?.isActive ?? true,
  });

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const automationTemplate: Partial<AutomationTemplate> = {
        ...templateInfo,
        formSchema,
        workflow: workflowActions,
        approvalSteps,
      };

      let savedTemplate: AutomationTemplate;
      if (template?.id) {
        savedTemplate = await automationService.updateAutomationTemplate(
          template.id,
          automationTemplate
        );
      } else {
        savedTemplate = await automationService.createAutomationTemplate(automationTemplate);
      }

      onSave?.(savedTemplate);
    } catch (error: unknown) {
      console.error('Failed to save automation template:', error);
      alert('Failed to save template. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'form':
        return <FormBuilder schema={formSchema} onChange={setFormSchema} />;

      case 'workflow':
        return (
          <WorkflowDesigner
            actions={workflowActions}
            approvalSteps={approvalSteps}
            onChange={(actions, steps) => {
              setWorkflowActions(actions);
              setApprovalSteps(steps);
            }}
          />
        );

      case 'review':
        return (
          <div className="review-section">
            <h3>Review Your Automation Template</h3>

            <div className="review-card">
              <h4>Template Information</h4>
              <div className="info-grid">
                <div>
                  <label>Name:</label>
                  <input
                    type="text"
                    value={templateInfo.name}
                    onChange={e => setTemplateInfo({ ...templateInfo, name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Description:</label>
                  <textarea
                    value={templateInfo.description}
                    onChange={e =>
                      setTemplateInfo({ ...templateInfo, description: e.target.value })
                    }
                    placeholder="Describe what this automation does..."
                  />
                </div>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={templateInfo.isActive}
                      onChange={e =>
                        setTemplateInfo({ ...templateInfo, isActive: e.target.checked })
                      }
                    />
                    Active (users can submit forms)
                  </label>
                </div>
              </div>
            </div>

            <div className="review-card">
              <h4>Form Summary</h4>
              <p>
                <strong>Form Name:</strong> {formSchema.name}
              </p>
              <p>
                <strong>Fields:</strong> {formSchema.fields.length} fields configured
              </p>
              <div className="field-list">
                {formSchema.fields.map(field => (
                  <div key={field.id} className="field-summary">
                    <span className="field-name">{field.label}</span>
                    <span className="field-type">{field.type}</span>
                    {field.required && <span className="required-badge">Required</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="review-card">
              <h4>Workflow Summary</h4>
              <p>
                <strong>Actions:</strong> {workflowActions.length} workflow steps
              </p>
              <div className="workflow-summary">
                {workflowActions.map((action, index) => (
                  <div key={action.id} className="action-summary">
                    <span className="step-number">{index + 1}</span>
                    <span className="action-name">{action.name}</span>
                    <span className="action-type">{action.type}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="review-card">
              <h4>Approval Levels</h4>
              <p>
                <strong>Levels:</strong> {approvalSteps.length} approval levels configured
              </p>
              <div className="approval-summary">
                {approvalSteps.map(step => (
                  <div key={step.id} className="approval-summary-item">
                    <span className="level-badge">Level {step.level}</span>
                    <span className="step-name">{step.name}</span>
                    <span className="approver-count">{step.approvers.length} approvers</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="automation-template-builder">
      <div className="builder-header">
        <h2>{template ? 'Edit' : 'Create'} Automation Template</h2>

        <div className="step-navigation">
          <button
            className={`step-btn ${currentStep === 'form' ? 'active' : ''}`}
            onClick={() => setCurrentStep('form')}
          >
            1. Design Form
          </button>
          <button
            className={`step-btn ${currentStep === 'workflow' ? 'active' : ''}`}
            onClick={() => setCurrentStep('workflow')}
          >
            2. Configure Workflow
          </button>
          <button
            className={`step-btn ${currentStep === 'review' ? 'active' : ''}`}
            onClick={() => setCurrentStep('review')}
          >
            3. Review & Save
          </button>
        </div>
      </div>

      <div className="builder-content">{renderStepContent()}</div>

      <div className="builder-footer">
        <div className="footer-actions">
          <button onClick={onCancel} className="cancel-btn">
            Cancel
          </button>

          {currentStep !== 'form' && (
            <button
              onClick={() => {
                const steps: ('form' | 'workflow' | 'review')[] = ['form', 'workflow', 'review'];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex > 0) {
                  setCurrentStep(steps[currentIndex - 1]);
                }
              }}
              className="prev-btn"
            >
              Previous
            </button>
          )}

          {currentStep !== 'review' ? (
            <button
              onClick={() => {
                const steps: ('form' | 'workflow' | 'review')[] = ['form', 'workflow', 'review'];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex < steps.length - 1) {
                  setCurrentStep(steps[currentIndex + 1]);
                }
              }}
              className="next-btn"
            >
              Next
            </button>
          ) : (
            <button onClick={handleSave} disabled={isLoading} className="save-btn">
              {isLoading ? 'Saving...' : 'Save Template'}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .automation-template-builder {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f8f9fa;
        }

        .builder-header {
          background: white;
          padding: 20px;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .builder-header h2 {
          margin: 0;
          color: #333;
        }

        .step-navigation {
          display: flex;
          gap: 10px;
        }

        .step-btn {
          padding: 10px 20px;
          border: 2px solid #dee2e6;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .step-btn:hover {
          border-color: #007bff;
        }

        .step-btn.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .builder-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .builder-footer {
          background: white;
          padding: 20px;
          border-top: 1px solid #dee2e6;
        }

        .footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .footer-actions button {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .cancel-btn {
          background: #6c757d;
          color: white;
        }

        .cancel-btn:hover {
          background: #5a6268;
        }

        .prev-btn {
          background: #f8f9fa;
          color: #333;
          border: 1px solid #dee2e6;
        }

        .prev-btn:hover {
          background: #e9ecef;
        }

        .next-btn,
        .save-btn {
          background: #007bff;
          color: white;
        }

        .next-btn:hover,
        .save-btn:hover {
          background: #0056b3;
        }

        .save-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .review-section {
          max-width: 800px;
          margin: 0 auto;
        }

        .review-card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .review-card h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
        }

        .info-grid {
          display: grid;
          gap: 15px;
        }

        .info-grid label {
          display: block;
          font-weight: 500;
          margin-bottom: 5px;
        }

        .info-grid input,
        .info-grid textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .field-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }

        .field-summary {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .field-name {
          font-weight: 500;
          flex: 1;
        }

        .field-type {
          background: #e9ecef;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          text-transform: uppercase;
        }

        .required-badge {
          background: #dc3545;
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 11px;
        }

        .workflow-summary,
        .approval-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }

        .action-summary,
        .approval-summary-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .step-number,
        .level-badge {
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
        }

        .action-name,
        .step-name {
          font-weight: 500;
          flex: 1;
        }

        .action-type {
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          text-transform: capitalize;
        }

        .approver-count {
          background: #17a2b8;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};
