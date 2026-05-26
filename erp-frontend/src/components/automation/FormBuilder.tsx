import React, { useState } from 'react';
import type { FormField, FormSchema } from '../../types/forms';

interface FormBuilderProps {
  schema: FormSchema;
  onChange: (schema: FormSchema) => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file', label: 'File Upload' },
];

export const FormBuilder: React.FC<FormBuilderProps> = ({ schema, onChange }) => {
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const addField = (type: FormField['type']) => {
    const newField: FormField = {
      id: String(Date.now()),
      name: `field_${Date.now()}`,
      type,
      label: `New ${type} field`,
      description: '',
      validation: {
        required: false,
      },
      helpText: '',
    };

    onChange({
      ...schema,
      fields: [...schema.fields, newField],
    });
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    onChange({
      ...schema,
      fields: schema.fields.map(field => (field.id === fieldId ? { ...field, ...updates } : field)),
    });
  };

  const removeField = (fieldId: string) => {
    onChange({
      ...schema,
      fields: schema.fields.filter(field => field.id !== fieldId),
    });
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    const currentIndex = schema.fields.findIndex(f => f.id === fieldId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= schema.fields.length) return;

    const newFields = [...schema.fields];
    [newFields[currentIndex], newFields[newIndex]] = [newFields[newIndex], newFields[currentIndex]];

    onChange({ ...schema, fields: newFields });
  };

  return (
    <div className="form-builder">
      <div className="form-header">
        <input
          type="text"
          value={schema.name}
          onChange={e => onChange({ ...schema, name: e.target.value })}
          placeholder="Form Name"
          className="form-name-input"
        />
        <textarea
          value={schema.description}
          onChange={e => onChange({ ...schema, description: e.target.value })}
          placeholder="Form Description"
          className="form-description-input"
        />
      </div>

      <div className="builder-content">
        <div className="field-palette">
          <h3>Add Fields</h3>
          {FIELD_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => addField(type.value as FormField['type'])}
              className="field-type-button"
            >
              + {type.label}
            </button>
          ))}
        </div>

        <div className="form-preview">
          <h3>Form Preview</h3>
          {schema.fields.map((field, index) => (
            <div
              key={field.id}
              className={`field-item ${selectedField === field.id ? 'selected' : ''}`}
              onClick={() => setSelectedField(field.id)}
            >
              <div className="field-controls">
                <button onClick={() => moveField(field.id, 'up')} disabled={index === 0}>
                  ↑
                </button>
                <button
                  onClick={() => moveField(field.id, 'down')}
                  disabled={index === schema.fields.length - 1}
                >
                  ↓
                </button>
                <button onClick={() => removeField(field.id)} className="delete-btn">
                  ×
                </button>
              </div>

              <div className="field-preview">
                <label>
                  {field.label} {field.validation?.required && '*'}
                </label>
                {field.type === 'select' ? (
                  <select disabled aria-label="Field options">
                    <option>Select option...</option>
                    {field.options?.map(opt => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea placeholder={field.placeholder} disabled />
                ) : field.type === 'checkbox' ? (
                  <input type="checkbox" disabled aria-label="Field required" />
                ) : (
                  <input type={field.type} placeholder={field.placeholder} disabled />
                )}
              </div>
            </div>
          ))}
        </div>

        {selectedField && (
          <div className="field-editor">
            <h3>Edit Field</h3>
            {(() => {
              const field = schema.fields.find(f => f.id === selectedField);
              if (!field) return null;

              return (
                <div className="field-properties">
                  <input
                    type="text"
                    value={field.label}
                    onChange={e => updateField(field.id, { label: e.target.value })}
                    placeholder="Field Label"
                  />

                  <input
                    type="text"
                    value={field.placeholder || ''}
                    onChange={e => updateField(field.id, { placeholder: e.target.value })}
                    placeholder="Placeholder Text"
                  />

                  <label>
                    <input
                      type="checkbox"
                      checked={field.validation?.required || false}
                      onChange={e =>
                        updateField(field.id, {
                          validation: {
                            ...field.validation,
                            required: e.target.checked,
                          },
                        })
                      }
                    />
                    Required Field
                  </label>

                  {field.type === 'select' && (
                    <div>
                      <label>Options (one per line):</label>
                      <textarea
                        value={field.options?.join('\n') || ''}
                        onChange={e =>
                          updateField(field.id, {
                            options: e.target.value.split('\n').filter(opt => opt.trim()),
                          })
                        }
                        placeholder="Option 1&#10;Option 2&#10;Option 3"
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <style jsx>{`
        .form-builder {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px;
        }

        .form-header input,
        .form-header textarea {
          width: 100%;
          padding: 10px;
          margin-bottom: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .builder-content {
          display: grid;
          grid-template-columns: 200px 1fr 250px;
          gap: 20px;
        }

        .field-palette {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
        }

        .field-type-button {
          display: block;
          width: 100%;
          padding: 8px;
          margin-bottom: 5px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }

        .field-type-button:hover {
          background: #e9e9e9;
        }

        .form-preview {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 15px;
        }

        .field-item {
          position: relative;
          margin-bottom: 15px;
          padding: 10px;
          border: 1px solid #eee;
          border-radius: 4px;
          cursor: pointer;
        }

        .field-item.selected {
          border-color: #007bff;
          background: #f8f9ff;
        }

        .field-controls {
          position: absolute;
          top: 5px;
          right: 5px;
          display: flex;
          gap: 2px;
        }

        .field-controls button {
          width: 20px;
          height: 20px;
          border: none;
          background: #ddd;
          border-radius: 2px;
          cursor: pointer;
          font-size: 12px;
        }

        .delete-btn {
          background: #ff4444 !important;
          color: white;
        }

        .field-preview label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }

        .field-preview input,
        .field-preview select,
        .field-preview textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .field-editor {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
        }

        .field-properties {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .field-properties input,
        .field-properties textarea {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .field-properties label {
          display: flex;
          align-items: center;
          gap: 5px;
        }
      `}</style>
    </div>
  );
};
