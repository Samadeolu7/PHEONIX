import React, { useState } from 'react';
import { FormSchema, FormField } from '@/types/automation.types';
import { Plus, Trash2 } from 'lucide-react';

const FormBuilder: React.FC<{
  form?: FormSchema;
  onSave: (form: FormSchema) => void;
  onCancel: () => void;
}> = ({ form, onSave, onCancel }) => {
  const [formData, setFormData] = useState<FormSchema>(
    form || {
      name: '',
      description: '',
      trigger_event_name: '',
      schema: { fields: [] },
    }
  );

  const addField = () => {
    setFormData({
      ...formData,
      schema: {
        fields: [
          ...formData.schema.fields,
          {
            id: `field_${Date.now()}`,
            label: 'New Field',
            type: 'text',
            required: false,
          },
        ],
      },
    });
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...formData.schema.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFormData({ ...formData, schema: { fields: newFields } });
  };

  const removeField = (index: number) => {
    setFormData({
      ...formData,
      schema: {
        fields: formData.schema.fields.filter((_, i) => i !== index),
      },
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-6">{form ? 'Edit Form' : 'Create New Form'}</h2>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Form Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="e.g., Withdrawal Request"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Trigger Event Name
            <span className="text-xs text-gray-500 ml-2">
              (This event will be triggered when form is submitted)
            </span>
          </label>
          <input
            type="text"
            value={formData.trigger_event_name}
            onChange={e => setFormData({ ...formData, trigger_event_name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md font-mono text-sm"
            placeholder="e.g., withdrawal_request"
          />
        </div>
      </div>

      <div className="border-t pt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Form Fields</h3>
          <button
            onClick={addField}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Field
          </button>
        </div>

        <div className="space-y-3">
          {formData.schema.fields.map((field, index) => (
            <div key={field.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Label</label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={e => updateField(index, { label: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Type</label>
                  <select
                    value={field.type}
                    onChange={e => updateField(index, { type: e.target.value as any })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Select</option>
                    <option value="textarea">Text Area</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => updateField(index, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    onClick={() => removeField(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {field.type === 'select' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium mb-1">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={field.options?.join(', ') || ''}
                    onChange={e =>
                      updateField(index, {
                        options: e.target.value.split(',').map(s => s.trim()),
                      })
                    }
                    className="w-full px-2 py-1 text-sm border rounded"
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-6 border-t">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border rounded-md hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onSave(formData)}
          disabled={
            !formData.name || !formData.trigger_event_name || formData.schema.fields.length === 0
          }
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Save Form
        </button>
      </div>
    </div>
  );
};

export { FormBuilder };
