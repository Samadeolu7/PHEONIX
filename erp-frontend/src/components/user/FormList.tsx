import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { FormSchema } from '../../types/automation.types';
import { automationService } from '../../services/automationService';

const FormList: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadForms();
  }, []);

  const loadForms = async () => {
    try {
      const data = await automationService.getForms();
      setForms(data);
    } catch (error: unknown) {
      console.error('Failed to load forms:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem 0' }}>Loading forms...</div>;
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        Available Forms
      </h2>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {forms.map(form => (
          <div
            key={form.id}
            onClick={() => navigate(`/forms/${form.id}`)}
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}
            >
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '0.25rem',
                  }}
                >
                  {form.name}
                </h3>
                <p style={{ color: '#4b5563', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {form.description}
                </p>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  {form.schema.fields.length} fields
                </div>
              </div>
              <ChevronRight style={{ width: '1.25rem', height: '1.25rem', color: '#9ca3af' }} />
            </div>
          </div>
        ))}

        {forms.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
            <FileText
              style={{ width: '3rem', height: '3rem', margin: '0 auto 0.75rem', color: '#d1d5db' }}
            />
            <p>No forms available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormList;
