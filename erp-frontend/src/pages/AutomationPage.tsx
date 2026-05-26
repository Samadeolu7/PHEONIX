// src/pages/AutomationPage.tsx
import { useEffect, useState } from 'react';
import { AutomationTemplateForm, AutomationRunForm } from '../components/WorkflowForms';
import { useAutomation } from '../hooks/useAutomationV2';
import { AutomationTemplate } from '../types/automation';
import {
  CreateTemplateInput,
  transformTemplateInput,
} from '../transformers/automationTransformers';

const AutomationPage = () => {
  const {
    loading,
    error,
    fetchWorkflowSteps,
    fetchAccounts,
    fetchTemplates,
    createTemplate,
    startRun,
  } = useAutomation();

  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);

  // On mount, load existing templates:
  useEffect(() => {
    fetchTemplates().then(data => {
      setTemplates(data);
      if (data.length) setSelectedTemplate(data[0]);
    });
  }, []);

  const handleTemplateCreate = async (input: CreateTemplateInput) => {
    if (!createTemplate) return;
    const apiInput = transformTemplateInput(input);
    const newT = await createTemplate(apiInput);
    setTemplates(prev => [...prev, newT]);
    setSelectedTemplate(newT);
  };

  const handleRunStart = async (templateId: number, params: Record<string, any>) => {
    await startRun(templateId, params);
    alert('Automation run started!');
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      {error && <div className="text-red-600">Error: {error}</div>}
      {loading && <div className="text-gray-500">Loading…</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">New Automation Template</h2>
          <AutomationTemplateForm
            fetchWorkflowSteps={fetchWorkflowSteps}
            fetchAccounts={fetchAccounts}
            loading={loading}
            error={error}
            onSubmit={handleTemplateCreate}
          />
        </section>

        {selectedTemplate && (
          <section className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Run: {selectedTemplate.name}</h2>
            <AutomationRunForm template={selectedTemplate} onSubmit={handleRunStart} />
          </section>
        )}
      </div>

      {templates.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Available Templates</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tpl => (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl)}
                className={`p-4 border rounded-lg cursor-pointer transition ${
                  tpl.id === selectedTemplate?.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:border-gray-300'
                }`}
              >
                <h3 className="font-medium">{tpl.name}</h3>
                <p className="text-sm text-gray-600">{tpl.description}</p>
                <span
                  className={`inline-block mt-2 px-2 py-1 text-xs font-medium rounded-full ${
                    tpl.requiresApproval
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {tpl.requiresApproval ? 'Requires Approval' : 'Auto‑approve'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default AutomationPage;
