import React, { useState } from 'react';
import { X, Plus, Calculator, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { Variable } from '../../types/workflow';

interface CreateVariableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (variable: Omit<Variable, 'id'>) => void;
  availableVariables: Variable[];
  formSchemaId?: number; // If provided, save to backend
}

const CreateVariableModal: React.FC<CreateVariableModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  availableVariables,
  formSchemaId,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<Variable['type']>('string');
  const [formula, setFormula] = useState('');
  const [transformType, setTransformType] = useState<'formula' | 'template' | 'function'>(
    'formula'
  );
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !formula) {
      setError('Name and formula/template/function are required');
      return;
    }

    const variableData = {
      name: name.trim(),
      type,
      source: 'calculated' as const,
      path: `calc.${name.replace(/\s+/g, '_').toLowerCase()}`,
      calculation_type: transformType,
      formula: transformType === 'formula' ? formula : undefined,
      template: transformType === 'template' ? formula : undefined,
      function: transformType === 'function' ? formula : undefined,
      description,
    };

    // If formSchemaId provided, save to backend
    if (formSchemaId) {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/automations/forms/${formSchemaId}/create-variable/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: variableData.name,
            type: variableData.type,
            calculation_type: transformType,
            formula: transformType === 'formula' ? formula : undefined,
            template: transformType === 'template' ? formula : undefined,
            function: transformType === 'function' ? formula : undefined,
            description,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create variable');
        }

        const data = await response.json();

        setSuccess(true);

        // Call onCreate with the variable
        onCreate({
          name: variableData.name,
          type: variableData.type,
          source: variableData.source,
          path: variableData.path,
        });

        // Close after success
        setTimeout(() => {
          handleReset();
          onClose();
        }, 1500);
      } catch (err: any) {
        setError(err.message || 'Failed to create variable');
      } finally {
        setSaving(false);
      }
    } else {
      // Just call onCreate without backend save
      onCreate({
        name: variableData.name,
        type: variableData.type,
        source: variableData.source,
        path: variableData.path,
      });
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setName('');
    setFormula('');
    setDescription('');
    setError(null);
    setSuccess(false);
  };

  const insertVariable = (varPath: string) => {
    setFormula(prev => prev + (prev ? ' ' : '') + '${' + varPath + '}');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          width: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                background: '#d1fae5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calculator size={20} color="#10b981" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                Create Calculated Variable
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                Transform existing variables into new ones
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            disabled={saving}
            style={{
              background: 'none',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              opacity: saving ? 0.5 : 1,
            }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Success Message */}
          {success && (
            <div
              style={{
                padding: '1rem',
                background: '#d1fae5',
                border: '1px solid #10b981',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle size={20} color="#10b981" />
              <span style={{ color: '#065f46', fontWeight: 600 }}>
                Variable created successfully!
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
              <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Variable Name */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Variable Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., total_with_tax"
                disabled={saving || success}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  opacity: saving || success ? 0.6 : 1,
                }}
                aria-label="Variable name"
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Will be accessible as: calc.
                {name.replace(/\s+/g, '_').toLowerCase() || 'variable_name'}
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                disabled={saving || success}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  opacity: saving || success ? 0.6 : 1,
                }}
                aria-label="Description"
              />
            </div>

            {/* Result Type */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Result Type
              </label>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}
              >
                {(['string', 'number', 'date', 'boolean'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    disabled={saving || success}
                    style={{
                      padding: '0.5rem',
                      border: `2px solid ${type === t ? '#10b981' : '#e5e7eb'}`,
                      borderRadius: '0.375rem',
                      background: type === t ? '#d1fae5' : 'white',
                      cursor: saving || success ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: type === t ? 600 : 400,
                      opacity: saving || success ? 0.6 : 1,
                    }}
                    type="button"
                    aria-label={`Set type to ${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Transformation Type */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Transformation Type
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { value: 'formula', label: 'Formula', icon: '🧮' },
                  { value: 'template', label: 'Template', icon: '📝' },
                  { value: 'function', label: 'Function', icon: '⚙️' },
                ].map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setTransformType(value as any);
                      setFormula(''); // Reset formula when changing type
                    }}
                    disabled={saving || success}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: `2px solid ${transformType === value ? '#10b981' : '#e5e7eb'}`,
                      borderRadius: '0.5rem',
                      background: transformType === value ? '#d1fae5' : 'white',
                      cursor: saving || success ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: saving || success ? 0.6 : 1,
                    }}
                    type="button"
                    aria-label={`Select ${label}`}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{icon}</div>
                    <div style={{ fontWeight: transformType === value ? 600 : 400 }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Formula Builder */}
            {transformType === 'formula' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                  }}
                >
                  Formula <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={formula}
                  onChange={e => {
                    setFormula(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g., ${form.amount} * 1.1"
                  rows={3}
                  disabled={saving || success}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    opacity: saving || success ? 0.6 : 1,
                  }}
                  aria-label="Formula"
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Supported: +, -, *, /, (), sum(), avg(), round(), abs()
                </div>
              </div>
            )}

            {transformType === 'template' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                  }}
                >
                  Template String <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={formula}
                  onChange={e => {
                    setFormula(e.target.value);
                    setError(null);
                  }}
                  placeholder="Transaction of ${form.amount} for ${form.account_name}"
                  rows={3}
                  disabled={saving || success}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    opacity: saving || success ? 0.6 : 1,
                  }}
                  aria-label="Template string"
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Use ${`{variable_path}`} to insert variables
                </div>
              </div>
            )}

            {transformType === 'function' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                  }}
                >
                  Function <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formula}
                  onChange={e => {
                    setFormula(e.target.value);
                    setError(null);
                  }}
                  disabled={saving || success}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    opacity: saving || success ? 0.6 : 1,
                  }}
                  aria-label="Select function"
                >
                  <option value="">Select function...</option>
                  <option value="uppercase">UPPERCASE - Convert text to uppercase</option>
                  <option value="lowercase">lowercase - Convert text to lowercase</option>
                  <option value="trim">Trim - Remove whitespace</option>
                  <option value="format_currency">Format Currency - Format as money</option>
                  <option value="format_date">Format Date - Format date string</option>
                  <option value="round_2">Round to 2 Decimals</option>
                </select>
              </div>
            )}

            {/* Available Variables */}
            {!success && (
              <div
                style={{
                  padding: '0.75rem',
                  background: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    color: '#374151',
                  }}
                >
                  Available Variables ({availableVariables.length})
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.375rem',
                    maxHeight: '150px',
                    overflow: 'auto',
                  }}
                >
                  {availableVariables.map(v => (
                    <button
                      key={v.id}
                      onClick={() => insertVariable(v.path)}
                      disabled={saving || success}
                      style={{
                        padding: '0.375rem 0.625rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        cursor: saving || success ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        opacity: saving || success ? 0.6 : 1,
                      }}
                      type="button"
                      aria-label={`Insert ${v.name}`}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background:
                            v.type === 'number'
                              ? '#10b981'
                              : v.type === 'string'
                                ? '#3b82f6'
                                : '#6b7280',
                        }}
                      />
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {formula && !success && (
              <div
                style={{
                  padding: '0.75rem',
                  background: '#eff6ff',
                  borderRadius: '0.375rem',
                  border: '1px solid #bfdbfe',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                    color: '#1e40af',
                  }}
                >
                  Preview
                </div>
                <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#1e40af' }}>
                  {name || 'variable_name'} = {formula}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !formula || saving || success}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: !name.trim() || !formula || saving || success ? '#9ca3af' : '#10b981',
              color: 'white',
              cursor: !name.trim() || !formula || saving || success ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            aria-label="Create variable"
          >
            {saving ? (
              <>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Creating...
              </>
            ) : success ? (
              <>
                <CheckCircle size={16} />
                Created
              </>
            ) : (
              <>
                <Plus size={16} />
                Create Variable
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVariableModal;
