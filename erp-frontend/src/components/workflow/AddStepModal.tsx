import React from 'react';
import { X } from 'lucide-react';

interface AddStepModalProps {
  onAdd: (type: string) => void;
  onClose: () => void;
}

const AddStepModal: React.FC<AddStepModalProps> = ({ onAdd, onClose }) => {
  const types = [
    // Core Steps
    {
      type: 'query',
      label: 'Query',
      icon: '🔍',
      color: '#3b82f6',
      description: 'Fetch data from database',
    },
    {
      type: 'condition',
      label: 'Condition',
      icon: '🔀',
      color: '#f59e0b',
      description: 'Branch based on conditions',
    },
    {
      type: 'calculation',
      label: 'Calculate',
      icon: '🧮',
      color: '#10b981',
      description: 'Perform calculations',
    },

    // Transaction Steps
    {
      type: 'transaction',
      label: 'Transaction',
      icon: '💳',
      color: '#8b5cf6',
      description: 'Create financial transaction',
    },
    {
      type: 'update',
      label: 'Update',
      icon: '✏️',
      color: '#ec4899',
      description: 'Update existing records',
    },

    // Communication
    {
      type: 'notification',
      label: 'Notify',
      icon: '📧',
      color: '#f43f5e',
      description: 'Send notifications',
    },

    // Workflow Control
    {
      type: 'approval',
      label: 'Approval',
      icon: '✅',
      color: '#14b8a6',
      description: 'Require human approval',
    },
    {
      type: 'sub_workflow',
      label: 'Sub-Workflow',
      icon: '🔗',
      color: '#6366f1',
      description: 'Call another workflow',
    },

    // Data Operations
    {
      type: 'data_transform',
      label: 'Transform',
      icon: '⚙️',
      color: '#06b6d4',
      description: 'Transform data (map, filter, etc)',
    },
    {
      type: 'http_request',
      label: 'HTTP',
      icon: '🌐',
      color: '#0ea5e9',
      description: 'Call external API',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          width: '800px',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Add Workflow Step</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Choose a step type to add to your workflow
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.75rem',
          }}
        >
          {types.map(t => (
            <button
              key={t.type}
              onClick={() => {
                onAdd(t.type);
                onClose();
              }}
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                background: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = t.color;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                <div
                  style={{
                    fontSize: '2rem',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {t.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4 }}>
                    {t.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem',
            background: '#f9fafb',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            color: '#6b7280',
          }}
        >
          <strong>💡 Tip:</strong> Steps execute in order from top to bottom. Use condition steps to
          create branching logic.
        </div>
      </div>
    </div>
  );
};

export default AddStepModal;
