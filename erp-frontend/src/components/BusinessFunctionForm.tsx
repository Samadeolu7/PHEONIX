import { useMemo, useState, type FC } from 'react';
import type { BusinessFunction } from '../types/business';
import { DynamicForm } from './automation/DynamicForm';
import type { FormField } from '../types/forms';
import { functionTypeSchemas } from '../schemas/functionTypeSchemas';

type FunctionType = BusinessFunction['function_type'];

interface BusinessFunctionFormProps {
  initialData?: Partial<BusinessFunction>;
  onSubmit: (data: BusinessFunction) => void | Promise<void>;
  onCancel: () => void;
}

export const BusinessFunctionForm: FC<BusinessFunctionFormProps> = ({
  initialData = {},
  onSubmit,
  onCancel,
}: BusinessFunctionFormProps) => {
  const [name, setName] = useState<string>(initialData?.name ?? '');
  const [friendlyName, setFriendlyName] = useState<string>(initialData?.friendly_name ?? '');
  const [functionType, setFunctionType] = useState<FunctionType>(
    (initialData?.function_type as FunctionType) ?? ('api_call' as FunctionType)
  );
  const [config, setConfig] = useState<Record<string, unknown>>(
    (initialData?.config as Record<string, unknown>) ?? {}
  );
  const [errors, setErrors] = useState<Record<'name' | 'friendlyName', string>>({
    name: '',
    friendlyName: '',
  });

  const currentSchema = useMemo(() => {
    const fields = (functionTypeSchemas as Record<FunctionType, FormField[]>)[functionType] ?? [];
    return {
      id: Date.now(),
      name: `${name} Configuration`,
      fields,
    };
  }, [functionType, name]);

  const validate = (): boolean => {
    const next: Record<'name' | 'friendlyName', string> = { name: '', friendlyName: '' };
    if (!name.trim()) next.name = 'Name is required';
    if (!friendlyName.trim()) next.friendlyName = 'Friendly name is required';
    setErrors(next);
    return !next.name && !next.friendlyName;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return;
    // Construct a BusinessFunction object (adjust the fields to your exact model)
    const payload: BusinessFunction = {
      id: initialData?.id ?? crypto.randomUUID(),
      name,
      friendly_name: friendlyName,
      function_type: functionType,
      config,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await onSubmit(payload);
  };

  return (
    <div className="business-function-form">
      <div className="form-field">
        <label>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder="bank_transfer"
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>

      <div className="form-field">
        <label>Friendly Name</label>
        <input
          type="text"
          value={friendlyName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFriendlyName(e.target.value)}
          placeholder="Bank Transfer"
        />
        {errors.friendlyName && <span className="error">{errors.friendlyName}</span>}
      </div>

      <div className="form-field">
        <label>Function Type</label>
        <select
          value={functionType}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setFunctionType(e.target.value as FunctionType)
          }
          aria-label="Function Type"
        >
          {Object.keys(functionTypeSchemas).map(ft => (
            <option key={ft} value={ft}>
              {ft.charAt(0).toUpperCase() + ft.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Configuration</label>
        <DynamicForm
          schema={currentSchema}
          initialData={config}
          onSubmit={async () => {
            // values are tracked in config state, this just commits them
            // no-op here; we submit via the main Save button
          }}
          submitLabel="Validate"
          onCancel={() => setConfig((initialData?.config as Record<string, unknown>) ?? {})}
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={handleSubmit}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};
