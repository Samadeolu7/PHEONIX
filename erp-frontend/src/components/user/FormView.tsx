import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormSchema, FormValues, FormErrors, FormField } from '../../types/automation.types';
import { automationService } from '../../services/automationService';
import WorkflowStatusMonitor from '../WorkflowStatusMonitor';
import CascadingAccountSelector from '../CascadingAccountSelector';

const FormView: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [celeryHealthy, setCeleryHealthy] = useState<boolean>(true);
  const [celeryCheckLoading, setCeleryCheckLoading] = useState(true);
  const [submitResponse, setSubmitResponse] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (formId) {
      loadForm();
    }
  }, [formId]);

  // Check Celery health on mount
  useEffect(() => {
    const checkCeleryHealth = async () => {
      try {
        setCeleryCheckLoading(true);
        const response = await fetch('/api/automations/celery-health/');
        const data = await response.json();
        setCeleryHealthy(data.status === 'healthy');
      } catch (error) {
        console.error('Failed to check Celery health:', error);
        setCeleryHealthy(false);
      } finally {
        setCeleryCheckLoading(false);
      }
    };
    checkCeleryHealth();
  }, []);

  const loadForm = async () => {
    try {
      const data = await automationService.getForm(Number(formId));
      setForm(data);

      // Initialize form data with default values
      const initialData: FormValues = {};
      data.schema.fields.forEach((field: FormField) => {
        // Check both 'default' (from backend) and 'defaultValue' for compatibility
        if (field.default !== undefined) {
          initialData[field.id] = field.default;
          console.log(`[FormView] Setting ${field.id} = ${field.default} (from field.default)`);
        } else if (field.defaultValue !== undefined) {
          initialData[field.id] = field.defaultValue;
          console.log(
            `[FormView] Setting ${field.id} = ${field.defaultValue} (from field.defaultValue)`
          );
        }
      });
      console.log('[FormView] Initial form data:', initialData);
      setFormData(initialData);
    } catch (error) {
      console.error('Failed to load form:', error);
      alert('Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (fieldId: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));

    // Clear error for this field when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    if (!form) return false;

    const newErrors: FormErrors = {};

    form.schema.fields.forEach((field: FormField) => {
      if (field.required) {
        const value = formData[field.id];
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate() || !form?.id) return;

    setSubmitting(true);
    try {
      const result = await automationService.submitForm(form.id, formData);
      setSubmitResponse(result);
      setSubmitted(true);
      // Don't navigate immediately - let user see workflow status
    } catch (error: any) {
      console.error('Failed to submit form:', error);
      alert(error.message || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const commonStyle = {
      width: '100%',
      padding: '0.5rem 0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      outline: 'none',
    };

    const commonProps = {
      id: field.id,
      value: formData[field.id] || '',
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => handleChange(field.id, e.target.value),
      style: commonStyle,
      'aria-describedby': field.helpText ? `${field.id}-help` : undefined,
      'aria-invalid': errors[field.id] ? 'true' : 'false',
      onFocus: (e: any) => {
        e.target.style.borderColor = '#3b82f6';
        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
      },
      onBlur: (e: any) => {
        e.target.style.borderColor = '#d1d5db';
        e.target.style.boxShadow = 'none';
      },
    };

    switch (field.type) {
      case 'textarea':
        return <textarea {...commonProps} value={(formData[field.id] as string) || ''} rows={4} />;

      case 'select':
        return (
          <select {...commonProps} value={(formData[field.id] as string) || ''}>
            <option value="">Select...</option>
            {field.options?.map((option: any, index: number) => {
              // Handle both string and object options
              if (typeof option === 'string') {
                return (
                  <option key={option} value={option}>
                    {option}
                  </option>
                );
              } else if (
                option &&
                typeof option === 'object' &&
                'value' in option &&
                'label' in option
              ) {
                return (
                  <option key={(option as any).value || index} value={(option as any).value}>
                    {(option as any).label}
                  </option>
                );
              }
              return null;
            })}
          </select>
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            id={field.id}
            checked={(formData[field.id] as boolean) || false}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange(field.id, e.target.checked)
            }
            style={{
              width: '1rem',
              height: '1rem',
              color: '#2563eb',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
            }}
            aria-describedby={field.helpText ? `${field.id}-help` : undefined}
          />
        );

      case 'number':
        return (
          <input type="number" {...commonProps} value={(formData[field.id] as string) || ''} />
        );

      case 'email':
        return <input type="email" {...commonProps} value={(formData[field.id] as string) || ''} />;

      case 'date':
        return (
          <input
            type="date"
            {...commonProps}
            value={(formData[field.id] as string) || ''}
            style={{
              ...commonStyle,
              cursor: 'pointer',
              backgroundImage:
                "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/%3e%3c/svg%3e\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1.25rem',
              paddingRight: '2.5rem',
            }}
          />
        );

      case 'account_select':
        return (
          <CascadingAccountSelector
            value={formData[field.id] as number | null}
            onChange={accountId => handleChange(field.id, accountId)}
            filterParentId={field.metadata?.filter_parent_id}
            required={field.required}
            style={{
              pointerEvents: field.readonly ? 'none' : 'auto',
              opacity: field.readonly ? 0.5 : 1,
              cursor: field.readonly ? 'not-allowed' : 'pointer',
            }}
          />
        );

      default:
        return <input type="text" {...commonProps} value={(formData[field.id] as string) || ''} />;
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '3rem 0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              animation: 'spin 1s linear infinite',
              borderRadius: '50%',
              height: '3rem',
              width: '3rem',
              border: '2px solid #2563eb',
              borderTopColor: 'transparent',
              margin: '0 auto',
            }}
          ></div>
          <p style={{ marginTop: '1rem', color: '#4b5563' }}>Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <h2
          style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}
        >
          Form not found
        </h2>
        <button
          onClick={() => navigate('/forms')}
          style={{
            color: '#2563eb',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Return to forms
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '1.5rem' }}>
      <button
        onClick={() => navigate('/forms')}
        style={{
          display: 'flex',
          alignItems: 'center',
          color: '#2563eb',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          marginBottom: '1.5rem',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#1d4ed8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#2563eb')}
      >
        <span style={{ marginRight: '0.5rem' }}>←</span>
        Back to forms
      </button>

      {/* Celery Health Warning */}
      {!celeryCheckLoading && !celeryHealthy && !submitted && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ color: '#92400e', fontSize: '0.875rem' }}>
            ⚠️ <strong>Workflow System Offline:</strong> The workflow execution service (Celery) is
            currently unavailable. Your form will be submitted, but automated workflows will not
            execute until the system is back online.
          </p>
        </div>
      )}

      {/* Success Message with Workflow Monitor */}
      {submitted && submitResponse && (
        <div
          style={{
            backgroundColor: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h3
            style={{
              color: '#065f46',
              fontSize: '1.125rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
            }}
          >
            ✓ Form Submitted Successfully!
          </h3>
          <p style={{ color: '#047857', marginBottom: '1rem' }}>
            Reference: <strong>{submitResponse.submission_reference}</strong>
          </p>

          {/* Workflow Status Monitor */}
          {submitResponse.id && (
            <WorkflowStatusMonitor
              submissionId={submitResponse.id}
              submissionReference={submitResponse.submission_reference}
            />
          )}

          <button
            onClick={() => navigate('/forms/submissions')}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#059669')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#10b981')}
          >
            View All Submissions
          </button>
        </div>
      )}

      {!submitted && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            padding: '2rem',
          }}
        >
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#111827',
              marginBottom: '0.5rem',
            }}
          >
            {form.name}
          </h1>
          {form.description && (
            <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>{form.description}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {form.schema.fields.map((field: FormField) => (
              <div
                key={field.id}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              >
                <label
                  htmlFor={field.id}
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  {field.label}
                  {field.required && (
                    <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>
                  )}
                </label>

                {renderField(field)}

                {field.helpText && (
                  <p id={`${field.id}-help`} style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {field.helpText}
                  </p>
                )}

                {errors[field.id] && (
                  <p
                    style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}
                    role="alert"
                  >
                    {errors[field.id]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/forms')}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                color: '#374151',
                borderRadius: '0.5rem',
                background: 'white',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                background: submitting ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                opacity: submitting ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (!submitting) e.currentTarget.style.background = '#1d4ed8';
              }}
              onMouseLeave={e => {
                if (!submitting) e.currentTarget.style.background = '#2563eb';
              }}
            >
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      animation: 'spin 1s linear infinite',
                      borderRadius: '50%',
                      height: '1rem',
                      width: '1rem',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      marginRight: '0.5rem',
                    }}
                  ></div>
                  Submitting...
                </span>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FormView;
