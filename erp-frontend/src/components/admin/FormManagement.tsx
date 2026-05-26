import { FormSchema } from '../../types/forms';
import React, { useEffect, useState } from 'react';
import { FormBuilder } from '../automation/FormBuilder';
import { Plus, Edit2, Trash2, FileText } from 'lucide-react';

const FormManagement: React.FC = () => {
  const [forms, setForms] = useState<FormSchema[]>([]);
  const [editing, setEditing] = useState<FormSchema | null>(null);
  const [creating, setCreating] = useState(false);

  const loadForms = async () => {
    try {
      const response = await fetch('/api/automations/forms/');
      const data = await response.json();
      setForms(data);
    } catch (error: unknown) {
      console.error('Failed to load forms:', error);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const saveForm = async (form: FormSchema) => {
    try {
      const url = form.id ? `/api/automations/forms/${form.id}/` : '/api/automations/forms/';

      const response = await fetch(url, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (response.ok) {
        alert('Form saved successfully!');
        loadForms();
        setEditing(null);
        setCreating(false);
      }
    } catch (error: unknown) {
      console.error('Failed to save form:', error);
    }
  };

  const deleteForm = async (id: number) => {
    if (!confirm('Delete this form?')) return;

    try {
      await fetch(`/api/automations/forms/${id}/`, { method: 'DELETE' });
      loadForms();
    } catch (error: unknown) {
      console.error('Failed to delete form:', error);
    }
  };

  if (creating || editing) {
    return <FormBuilder schema={(editing || {}) as FormSchema} onChange={saveForm} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Form Management</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Create Form
        </button>
      </div>

      <div className="grid gap-4">
        {forms.map(form => (
          <div
            key={form.id}
            className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{form.name}</h3>
                <p className="text-gray-600 text-sm mt-1">{form.description}</p>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-gray-500">
                    Event:{' '}
                    <span className="font-mono text-blue-600">
                      {(form as any).trigger_event_name}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    Fields:{' '}
                    <span className="font-semibold">
                      {(form as any).schema?.fields?.length || form.fields?.length || 0}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(form)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => form.id && deleteForm(form.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {forms.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No forms yet. Create your first form to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormManagement;
