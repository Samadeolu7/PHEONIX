import type { FormField, FormFieldType } from '../types/forms';

export const createField = (
  name: string,
  label: string,
  type: FormFieldType,
  required = false,
  options?: string[]
): FormField => ({
  id: String(name),
  name,
  label,
  type,
  required,
  options,
  helpText: '',
});

export const functionTypeSchemas = {
  api: [
    createField('apiEndpoint', 'API Endpoint', 'text', true),
    createField('method', 'HTTP Method', 'select', true, ['GET', 'POST', 'PUT', 'DELETE']),
    createField('headers', 'Headers', 'textarea'),
  ],
  database: [
    createField('query', 'Query', 'textarea', true),
    createField('params', 'Parameters', 'textarea'),
  ],
  system: [
    createField('command', 'System Command', 'text', true),
    createField('args', 'Arguments', 'text'),
  ],
  custom: [
    createField('scriptName', 'Script Name', 'text', true),
    createField('params', 'Parameters', 'textarea'),
  ],
};
