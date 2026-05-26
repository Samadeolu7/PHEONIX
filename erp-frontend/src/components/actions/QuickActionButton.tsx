import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { FormField } from '../../types/forms';
import { api } from '../../services/api';

interface DynamicFormProps {
  schema: { fields: FormField[] };
  onSubmit: (data: Record<string, any>) => Promise<void>;
  isSubmitting: boolean;
}

function DynamicForm({ schema, onSubmit, isSubmitting }: DynamicFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, any>>({});

  const handleChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors(prev => ({ ...prev, [fieldName]: null }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    schema.fields.forEach((field: FormField) => {
      const value = formData[field.name];

      if (field.required && (!value || value === '')) {
        newErrors[field.name] = `${field.label} is required`;
      }

      if (field.validation && value) {
        if (field.type === 'number') {
          const num = parseFloat(value);
          if (field.validation.min && num < field.validation.min) {
            newErrors[field.name] = `Minimum value is ${field.validation.min}`;
          }
          if (field.validation.max && num > field.validation.max) {
            newErrors[field.name] = `Maximum value is ${field.validation.max}`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <div className="space-y-4">
      {schema.fields.map(field => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>

          {field.type === 'text' && (
            <input
              type="text"
              value={formData[field.name] || ''}
              onChange={e => handleChange(field.name, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[field.name] ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
          )}

          {field.type === 'number' && (
            <input
              type="number"
              step="0.01"
              value={formData[field.name] || ''}
              onChange={e => handleChange(field.name, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[field.name] ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
          )}

          {field.type === 'date' && (
            <input
              type="date"
              value={formData[field.name] || new Date().toISOString().split('T')[0]}
              onChange={e => handleChange(field.name, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[field.name] ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
          )}

          {errors[field.name] && <p className="mt-1 text-sm text-red-600">{errors[field.name]}</p>}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </div>
  );
}

export default function QuickActionButton({
  pattern,
  context,
  onSuccess,
}: {
  pattern: any;
  context: any;
  onSuccess?: (result: any) => void;
}) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [formSchema, setFormSchema] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<any>(null);
  const [success, setSuccess] = useState(false);

  const handleOpen = async () => {
    try {
      setLoading(true);
      setError(null);

      // If the pattern has a generated form_schema id, use it; else fall back to patterns endpoint (if exists)
      const formSchemaId = pattern.pattern_data?.form_schema_id;
      let payload;
      if (formSchemaId) {
        const response = await api.get(`/forms/${formSchemaId}/`);
        payload = response.data || response;
      } else {
        // Try patterns endpoint as a fallback (not guaranteed to exist in all deployments)
        const response = await api.get(`/patterns/${pattern.id}/form-schema/`);
        payload = response.data || response;
      }
      setFormSchema(payload.data || payload);
      setIsOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load form');
      console.error('Error loading form:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: Record<string, any>) => {
    try {
      setSubmitting(true);
      setError(null);

      const payload: any = {
        pattern_id: pattern.id,
        form_data: formData,
        trigger_event: `transaction.${pattern.code}`,
        context: context,
      };

      if (context.account_id) {
        payload.account_id = context.account_id;
      }

      const response = await api.post('/form-submissions/', payload);

      setSuccess(true);

      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setFormSchema(null);

        if (onSuccess) {
          onSuccess(response.data);
        }

        // Navigate to workflow status page
        if (response.data?.workflow_run_id || response.workflow_run_id) {
          const workflowId = response.data?.workflow_run_id ?? response.workflow_run_id;
          navigate(`/workflows/${workflowId}`);
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit form');
      console.error('Error submitting form:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setFormSchema(null);
    setError(null);
    setSuccess(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={loading}
        className="px-4 py-2 rounded-lg font-medium transition-all hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: pattern.color || '#1a73e8',
          color: 'white',
        }}
        title={pattern.description}
      >
        {loading ? 'Loading...' : pattern.name}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{pattern.name}</h2>
              <button
                onClick={handleClose}
                aria-label="Close quick action"
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800">
                    Form submitted successfully! Redirecting...
                  </p>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : !formSchema ? (
                <p className="text-center text-gray-500 py-12">Form not found</p>
              ) : (
                <DynamicForm
                  schema={formSchema}
                  onSubmit={handleSubmit}
                  isSubmitting={submitting}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
