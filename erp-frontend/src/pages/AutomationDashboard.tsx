import React, { useState, useEffect } from 'react';
import { AutomationTemplateBuilder } from '../components/automation/AutomationTemplateBuilder';
import { TestConnection } from '../components/automation/TestConnection';
import { AutomationTemplate } from '../types/automation';
import { automationService } from '../services/automationService';
import { useAuth } from '../contexts/AuthContext';

export const AutomationDashboard: React.FC = () => {
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutomationTemplate | undefined>();
  const { ensureAuth } = useAuth();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      await ensureAuth();
      const data = await automationService.getAutomationTemplates();
      setTemplates(data);
    } catch (error: unknown) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingTemplate(undefined);
    setShowBuilder(true);
  };

  const handleEdit = (template: AutomationTemplate) => {
    setEditingTemplate(template);
    setShowBuilder(true);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this automation template?')) {
      return;
    }

    try {
      await automationService.deleteAutomationTemplate(templateId);
      setTemplates(templates.filter(t => t.id !== Number(templateId)));
    } catch (error: unknown) {
      console.error('Failed to delete template:', error);
      alert('Failed to delete template. Please try again.');
    }
  };

  const handleSave = (template: AutomationTemplate) => {
    if (editingTemplate) {
      setTemplates(templates.map(t => (t.id === template.id ? template : t)));
    } else {
      setTemplates([...templates, template]);
    }
    setShowBuilder(false);
    setEditingTemplate(undefined);
  };

  const handleCancel = () => {
    setShowBuilder(false);
    setEditingTemplate(undefined);
  };

  if (showBuilder) {
    return (
      <AutomationTemplateBuilder
        template={editingTemplate}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading automation templates...</p>
      </div>
    );
  }

  return (
    <div className="automation-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Automation Templates</h1>
          <p>Create and manage automated workflows with forms, approvals, and integrations</p>
        </div>
        <button onClick={handleCreateNew} className="create-btn">
          + Create New Template
        </button>
      </div>

      <div className="dashboard-content">
        <TestConnection />

        {templates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <h3>No Automation Templates Yet</h3>
            <p>Create your first automation template to streamline your business processes</p>
            <button onClick={handleCreateNew} className="create-first-btn">
              Create Your First Template
            </button>
          </div>
        ) : (
          <div className="templates-grid">
            {templates.map(template => (
              <div key={template.id} className="template-card">
                <div className="card-header">
                  <h3>{template.name}</h3>
                  <div className="card-actions">
                    <button
                      onClick={() => handleEdit(template)}
                      className="edit-btn"
                      title="Edit template"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(String(template.id))}
                      className="delete-btn"
                      title="Delete template"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="card-content">
                  <p className="template-description">{template.description}</p>

                  <div className="template-stats">
                    <div className="stat">
                      <span className="stat-label">Form Fields:</span>
                      <span className="stat-value">{template.formSchema?.fields.length || 0}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Workflow Steps:</span>
                      <span className="stat-value">{template.workflow.length}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Approval Levels:</span>
                      <span className="stat-value">{template.approvalSteps.length}</span>
                    </div>
                  </div>

                  <div className="template-status">
                    <span className={`status-badge ${template.isActive ? 'active' : 'inactive'}`}>
                      {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="created-date">
                      Created {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="card-footer">
                  <button onClick={() => handleEdit(template)} className="primary-btn">
                    Configure
                  </button>
                  <button className="secondary-btn">View Submissions</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .automation-dashboard {
          min-height: 100vh;
          background: #f8f9fa;
        }

        .dashboard-header {
          background: white;
          padding: 30px;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-content h1 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 28px;
        }

        .header-content p {
          margin: 0;
          color: #666;
          font-size: 16px;
        }

        .create-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .create-btn:hover {
          background: #0056b3;
        }

        .dashboard-content {
          padding: 30px;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 50vh;
          color: #666;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }

        .empty-state h3 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 24px;
        }

        .empty-state p {
          margin: 0 0 30px 0;
          color: #666;
          font-size: 16px;
        }

        .create-first-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.2s;
        }

        .create-first-btn:hover {
          background: #218838;
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 24px;
        }

        .template-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          transition:
            transform 0.2s,
            box-shadow 0.2s;
        }

        .template-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .card-header {
          padding: 20px 20px 0 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .card-header h3 {
          margin: 0;
          color: #333;
          font-size: 20px;
          flex: 1;
        }

        .card-actions {
          display: flex;
          gap: 8px;
        }

        .edit-btn,
        .delete-btn {
          background: none;
          border: none;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.2s;
        }

        .edit-btn:hover {
          background: #e9ecef;
        }

        .delete-btn:hover {
          background: #f8d7da;
        }

        .card-content {
          padding: 20px;
        }

        .template-description {
          margin: 0 0 20px 0;
          color: #666;
          line-height: 1.5;
        }

        .template-stats {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }

        .stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat-label {
          color: #666;
          font-size: 14px;
        }

        .stat-value {
          background: #e9ecef;
          color: #495057;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .template-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .status-badge.active {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.inactive {
          background: #f8d7da;
          color: #721c24;
        }

        .created-date {
          color: #666;
          font-size: 12px;
        }

        .card-footer {
          padding: 0 20px 20px 20px;
          display: flex;
          gap: 10px;
        }

        .primary-btn,
        .secondary-btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .primary-btn {
          background: #007bff;
          color: white;
        }

        .primary-btn:hover {
          background: #0056b3;
        }

        .secondary-btn {
          background: #f8f9fa;
          color: #495057;
          border: 1px solid #dee2e6;
        }

        .secondary-btn:hover {
          background: #e9ecef;
        }
      `}</style>
    </div>
  );
};
