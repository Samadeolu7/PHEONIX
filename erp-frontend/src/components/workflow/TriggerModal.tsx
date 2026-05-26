import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FormData } from '../../types/workflow';
import { useForms } from '../../hooks/useAutomation';

interface TriggerModalProps {
  onSelect: (type: string, formId?: number) => void;
}

const TriggerModal: React.FC<TriggerModalProps> = ({ onSelect }) => {
  const [type, setType] = useState('form');
  const [selected, setSelected] = useState<number | null>(null);

  // Use React Query hook instead of manual fetch
  const { data: forms = [], isLoading: loading, error } = useForms();

  const handleContinue = () => {
    if (type === 'form' && !selected) return;
    onSelect(type, selected || undefined);
  };

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
          width: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Select Workflow Trigger
          </h2>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {['form', 'manual'].map(t => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                if (t === 'manual') setSelected(null);
              }}
              style={{
                width: '100%',
                padding: '1rem',
                marginBottom: '0.75rem',
                border: `2px solid ${type === t ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: '0.5rem',
                background: type === t ? '#eff6ff' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {t === 'form' ? '📋 Form Submission' : '⚡ Manual Trigger'}
            </button>
          ))}

          {type === 'form' && (
            <div style={{ marginTop: '1rem' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading forms...</div>
              ) : error ? (
                <div
                  style={{
                    color: '#ef4444',
                    padding: '1rem',
                    background: '#fef2f2',
                    borderRadius: '0.375rem',
                  }}
                >
                  {error instanceof Error ? error.message : 'Failed to load forms'}
                </div>
              ) : forms.length === 0 ? (
                <div
                  style={{
                    color: '#6b7280',
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '0.375rem',
                    textAlign: 'center',
                  }}
                >
                  No forms available. Create a form first to use as a trigger.
                </div>
              ) : (
                forms.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelected(f.id)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      border: `1px solid ${selected === f.id ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '0.375rem',
                      background: selected === f.id ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{f.name}</div>
                    {f.description && (
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {f.description}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleContinue}
            disabled={type === 'form' && !selected}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: type === 'form' && !selected ? '#9ca3af' : '#3b82f6',
              color: 'white',
              cursor: type === 'form' && !selected ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Continue <ChevronRight size={16} style={{ marginLeft: '0.5rem' }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TriggerModal;
