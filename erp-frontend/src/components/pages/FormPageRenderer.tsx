import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  useRef,
  KeyboardEvent,
} from 'react';
import {
  ArrowLeft,
  X,
  AlertCircle,
  CheckCircle,
  Info,
  Send,
  Loader,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import WorkflowStatusMonitor from '../WorkflowStatusMonitor';
import { CascadingAccountSelector } from '../CascadingAccountSelector';
import { useNavigate } from 'react-router-dom';

// ========== TYPES & INTERFACES ==========
interface Option {
  value: string;
  label: string;
}

interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
  email?: boolean;
  custom?: (value: any) => string | null;
}

interface FormField {
  id: string;
  name: string;
  label: string;
  type:
    | 'text'
    | 'email'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'password'
    | 'textarea'
    | 'select'
    | 'multiselect'
    | 'checkbox'
    | 'radio'
    | 'file'
    | 'color'
    | 'range'
    | 'hidden'
    | 'json'
    | 'account_select';
  required: boolean;
  placeholder?: string;
  help?: string;
  description?: string;
  options?: Option[];
  default?: any;
  validation?: ValidationRule;
  disabled?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  dependencies?: string[];
  conditional?: {
    field: string;
    value: any;
    operator?: 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than';
  };
  metadata?: Record<string, any>;
}

interface FormSchema {
  id?: string | number;
  title: string;
  description?: string;
  submitButtonText?: string;
  resetButtonText?: string;
  fields: FormField[];
}

interface FormPageRendererProps {
  config: {
    form_schema_id: number | string;
    patternId?: number | string;
    endpoint?: string;
    submitEndpoint: string;
    successUrl?: string;
    showBackButton?: boolean;
    submitButtonText?: string;
    context?: Record<string, any>;
    mode?: 'create' | 'edit' | 'view';
    entityId?: string | number;
    initialData?: Record<string, any>;
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
    onCancel?: () => void;
    disableRedirect?: boolean;
    className?: string;
    style?: { [key: string]: string | number };
  };
}

interface FormState {
  data: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  submitting: boolean;
  submitted: boolean;
}

// ========== CUSTOM HOOKS ==========
const useFormSchema = (config: FormPageRendererProps['config']) => {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFormSchema = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Support multiple endpoint patterns for backward compatibility
      let url = '';
      if (config.endpoint) {
        url = config.endpoint;
      } else if (config.patternId) {
        url = `/api/patterns/${config.patternId}/form-schema/`;
      } else {
        url = `/api/forms/${config.form_schema_id}/`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to load form schema`);
      }

      const data = await response.json();
      const schemaData = data.schema || data;

      if (!schemaData || !Array.isArray(schemaData.fields)) {
        throw new Error('Invalid schema format: missing fields array');
      }

      setSchema(schemaData);
    } catch (err: unknown) {
      console.error('Failed to fetch form schema:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load form schema';
      setError(errorMsg);
      setSchema(null);
    } finally {
      setLoading(false);
    }
  }, [config.form_schema_id, config.patternId, config.endpoint]);

  useEffect(() => {
    fetchFormSchema();
  }, [fetchFormSchema]);

  return { schema, loading, error, refetch: fetchFormSchema };
};

const useForm = (schema: FormSchema | null, initialData?: Record<string, any>) => {
  const [state, setState] = useState<FormState>({
    data: {},
    errors: {},
    touched: {},
    submitting: false,
    submitted: false,
  });

  // Initialize form data
  useEffect(() => {
    if (schema) {
      const initialFormData: Record<string, any> = {};
      const initialTouched: Record<string, boolean> = {};

      schema.fields.forEach(field => {
        // Priority: initialData > field.default > type-specific default
        if (initialData && initialData[field.name] !== undefined) {
          initialFormData[field.name] = initialData[field.name];
          initialTouched[field.name] = true;
        } else if (field.default !== undefined) {
          initialFormData[field.name] = field.default;
        } else {
          // Set appropriate defaults based on field type
          switch (field.type) {
            case 'checkbox':
              initialFormData[field.name] = false;
              break;
            case 'multiselect':
            case 'radio':
              initialFormData[field.name] = [];
              break;
            case 'number':
              initialFormData[field.name] = '';
              break;
            case 'json':
              initialFormData[field.name] = {};
              break;
            default:
              initialFormData[field.name] = '';
          }
        }
      });

      setState(prev => ({
        ...prev,
        data: initialFormData,
        touched: initialTouched,
      }));
    }
  }, [schema, initialData]);

  const validateField = useCallback((field: FormField, value: any): string | null => {
    const { validation } = field;

    if (!validation) return null;

    // Required validation
    if (validation.required && field.required) {
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && Object.keys(value).length === 0)
      ) {
        return `${field.label} is required`;
      }
    }

    if (value === '' || value === null || value === undefined) {
      return null; // Empty values are handled by required validation
    }

    // Type-specific validation
    switch (field.type) {
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) return 'Must be a valid number';
        if (validation.min !== undefined && num < validation.min) {
          return `Minimum value is ${validation.min}`;
        }
        if (validation.max !== undefined && num > validation.max) {
          return `Maximum value is ${validation.max}`;
        }
        break;
      }

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return 'Please enter a valid email address';
        }
        break;
      }

      case 'text':
      case 'textarea':
      case 'password': {
        if (validation.maxLength && value.length > validation.maxLength) {
          return `Maximum ${validation.maxLength} characters allowed`;
        }
        if (validation.pattern) {
          try {
            const regex = new RegExp(validation.pattern);
            if (!regex.test(value)) {
              return 'Invalid format';
            }
          } catch (e: unknown) {
            console.error('Invalid regex pattern:', validation.pattern);
          }
        }
        break;
      }

      case 'date':
      case 'datetime-local': {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return 'Please enter a valid date';
        }
        break;
      }

      case 'json': {
        try {
          if (typeof value === 'string') {
            JSON.parse(value);
          } else if (typeof value !== 'object') {
            return 'Must be valid JSON';
          }
        } catch {
          return 'Invalid JSON format';
        }
        break;
      }
    }

    // Custom validation function
    if (validation.custom) {
      const customError = validation.custom(value);
      if (customError) return customError;
    }

    return null;
  }, []);

  const validateForm = useCallback(
    (fields?: FormField[]): boolean => {
      if (!schema) return false;

      const fieldsToValidate = fields || schema.fields;
      const newErrors: Record<string, string> = {};

      fieldsToValidate.forEach(field => {
        if (field.hidden) return;

        const error = validateField(field, state.data[field.name]);
        if (error) {
          newErrors[field.name] = error;
        }
      });

      setState(prev => ({ ...prev, errors: newErrors }));
      return Object.keys(newErrors).length === 0;
    },
    [schema, state.data, validateField]
  );

  const handleFieldChange = useCallback((fieldName: string, value: any, markAsTouched = true) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, [fieldName]: value },
      errors: { ...prev.errors, [fieldName]: undefined },
      touched: markAsTouched ? { ...prev.touched, [fieldName]: true } : prev.touched,
    }));
  }, []);

  const handleFieldBlur = useCallback(
    (fieldName: string, field: FormField) => {
      setState(prev => ({
        ...prev,
        touched: { ...prev.touched, [fieldName]: true },
      }));

      // Validate on blur
      const error = validateField(field, state.data[fieldName]);
      if (error) {
        setState(prev => ({
          ...prev,
          errors: { ...prev.errors, [fieldName]: error },
        }));
      }
    },
    [state.data, validateField]
  );

  const resetForm = useCallback(() => {
    if (schema) {
      const initialFormData: Record<string, any> = {};

      schema.fields.forEach(field => {
        if (field.default !== undefined) {
          initialFormData[field.name] = field.default;
        } else {
          switch (field.type) {
            case 'checkbox':
              initialFormData[field.name] = false;
              break;
            case 'multiselect':
            case 'radio':
              initialFormData[field.name] = [];
              break;
            case 'json':
              initialFormData[field.name] = {};
              break;
            default:
              initialFormData[field.name] = '';
          }
        }
      });

      setState({
        data: initialFormData,
        errors: {},
        touched: {},
        submitting: false,
        submitted: false,
      });
    }
  }, [schema]);

  const setSubmitting = useCallback((submitting: boolean) => {
    setState(prev => ({ ...prev, submitting }));
  }, []);

  const setSubmitted = useCallback((submitted: boolean) => {
    setState(prev => ({ ...prev, submitted }));
  }, []);

  return {
    ...state,
    handleFieldChange,
    handleFieldBlur,
    validateForm,
    validateField,
    resetForm,
    setSubmitting,
    setSubmitted,
    setErrors: (errors: Record<string, string>) => setState(prev => ({ ...prev, errors })),
  };
};

// ========== FIELD COMPONENTS ==========
interface FieldWrapperProps {
  field: FormField;
  children: React.ReactNode;
  error?: string | null;
  touched?: boolean;
  isDirty?: boolean;
}

const FieldWrapper: React.FC<FieldWrapperProps> = ({
  field,
  children,
  error,
  touched,
  isDirty,
}) => {
  const fieldId = `field-${field.id || field.name}`;
  const hasError = !!error && touched;

  if (field.hidden) {
    return null;
  }

  return (
    <div className={`space-y-2 ${field.readonly ? 'opacity-75' : ''}`}>
      {field.type !== 'checkbox' && field.type !== 'radio' && (
        <label
          htmlFor={fieldId}
          className={`block text-sm font-medium ${hasError ? 'text-red-700' : 'text-gray-700'}`}
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
          {isDirty && <span className="ml-2 text-xs text-blue-500">(edited)</span>}
        </label>
      )}

      {field.description && <p className="text-sm text-gray-500 mb-2">{field.description}</p>}

      {children}

      {field.help && !hasError && (
        <div className="flex items-start space-x-2 text-gray-500 text-sm">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{field.help}</span>
        </div>
      )}

      {hasError && (
        <div className="flex items-start space-x-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {field.validation?.maxLength && (field.type === 'textarea' || field.type === 'text') && (
        <div className="text-right text-xs text-gray-500">
          {(value || '').length} / {field.validation.maxLength}
        </div>
      )}
    </div>
  );
};

interface FormFieldComponentProps {
  field: FormField;
  value: any;
  onChange: (name: string, value: any) => void;
  onBlur?: (name: string) => void;
  error?: string | null;
  touched?: boolean;
  disabled?: boolean;
  isDirty?: boolean;
}

const FormFieldComponent: React.FC<FormFieldComponentProps> = React.memo(
  ({
    field,
    value,
    onChange,
    onBlur,
    error,
    touched,
    disabled,
    isDirty,
  }: FormFieldComponentProps) => {
    const fieldId = `field-${field.id || field.name}`;
    const [showPassword, setShowPassword] = useState(false);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleChange = useCallback(
      (e: React.ChangeEvent<any>) => {
        let newValue: any;

        switch (field.type) {
          case 'checkbox':
            newValue = e.target.checked;
            break;
          case 'number':
            newValue = e.target.value === '' ? '' : Number(e.target.value);
            break;
          case 'multiselect': {
            const currentValues = Array.isArray(value) ? value : [];
            if (e.target.checked) {
              newValue = [...currentValues, e.target.value];
            } else {
              newValue = currentValues.filter((v: string) => v !== e.target.value);
            }
            break;
          }
          case 'file': {
            const file = e.target.files?.[0];
            if (file) {
              newValue = file;
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = event => {
                  setFilePreview(event.target?.result as string);
                };
                reader.readAsDataURL(file);
              }
            }
            break;
          }
          case 'json': {
            try {
              if (typeof e.target.value === 'string') {
                newValue = JSON.parse(e.target.value);
              } else {
                newValue = e.target.value;
              }
            } catch {
              newValue = e.target.value;
            }
            break;
          }
          default:
            newValue = e.target.value;
        }

        onChange(field.name, newValue);
      },
      [field, value, onChange]
    );

    const handleBlur = useCallback(() => {
      if (onBlur) {
        onBlur(field.name);
      }
    }, [field.name, onBlur]);

    const renderField = () => {
      const baseClasses = `w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
        error && touched ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
      } ${disabled || field.disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'} ${
        field.readonly ? 'bg-gray-50 text-gray-500' : ''
      }`;

      switch (field.type) {
        case 'text':
        case 'email':
        case 'number':
        case 'date':
        case 'datetime-local':
          return (
            <div className="relative">
              <input
                id={fieldId}
                type={field.type}
                value={value || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={field.placeholder}
                className={baseClasses}
                required={field.required}
                disabled={disabled || field.disabled}
                readOnly={field.readonly}
                min={field.type === 'number' ? field.validation?.min : undefined}
                max={field.type === 'number' ? field.validation?.max : undefined}
                maxLength={field.validation?.maxLength}
                aria-invalid={!!error && touched}
                aria-describedby={
                  error && touched ? `${fieldId}-error` : field.help ? `${fieldId}-help` : undefined
                }
              />
            </div>
          );

        case 'password':
          return (
            <div className="relative">
              <input
                id={fieldId}
                type={showPassword ? 'text' : 'password'}
                value={value || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={field.placeholder}
                className={baseClasses}
                required={field.required}
                disabled={disabled || field.disabled}
                readOnly={field.readonly}
                maxLength={field.validation?.maxLength}
                aria-invalid={!!error && touched}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          );

        case 'textarea':
          return (
            <textarea
              id={fieldId}
              value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              rows={4}
              placeholder={field.placeholder}
              className={baseClasses}
              required={field.required}
              disabled={disabled || field.disabled}
              readOnly={field.readonly}
              maxLength={field.validation?.maxLength}
              aria-invalid={!!error && touched}
            />
          );

        case 'select':
          return (
            <div className="relative">
              <select
                id={fieldId}
                value={value || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`${baseClasses} appearance-none pr-10`}
                required={field.required}
                disabled={disabled || field.disabled}
                readOnly={field.readonly}
                aria-invalid={!!error && touched}
              >
                <option value="">Select an option...</option>
                {field.options?.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          );

        case 'checkbox':
          return (
            <label
              className={`flex items-center space-x-3 ${disabled || field.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <div className="relative">
                <input
                  id={fieldId}
                  type="checkbox"
                  checked={!!value}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className="sr-only peer"
                  disabled={disabled || field.disabled}
                  readOnly={field.readonly}
                  aria-invalid={!!error && touched}
                />
                <div
                  className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${
                    error && touched
                      ? 'border-red-500 peer-checked:bg-red-500'
                      : 'border-gray-300 peer-checked:bg-blue-500 hover:border-gray-400'
                  } ${disabled || field.disabled ? 'bg-gray-100' : 'bg-white'}`}
                >
                  {value && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
              <span className={`text-gray-700 ${disabled || field.disabled ? 'opacity-50' : ''}`}>
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
          );

        case 'radio':
          return (
            <div className="space-y-2">
              {field.options?.map(option => (
                <label
                  key={option.value}
                  className={`flex items-center space-x-3 ${disabled || field.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <div className="relative">
                    <input
                      type="radio"
                      name={field.name}
                      value={option.value}
                      checked={value === option.value}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className="sr-only peer"
                      disabled={disabled || field.disabled}
                      readOnly={field.readonly}
                      aria-invalid={!!error && touched}
                    />
                    <div
                      className={`w-5 h-5 border rounded-full flex items-center justify-center transition-all ${
                        error && touched
                          ? 'border-red-500 peer-checked:border-red-500'
                          : 'border-gray-300 peer-checked:border-blue-500 hover:border-gray-400'
                      } ${disabled || field.disabled ? 'bg-gray-100' : 'bg-white'}`}
                    >
                      {value === option.value && (
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-gray-700 ${disabled || field.disabled ? 'opacity-50' : ''}`}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          );

        case 'multiselect':
          return (
            <div className="space-y-2">
              {field.options?.map(option => {
                const isChecked = Array.isArray(value) && value.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex items-center space-x-3 ${disabled || field.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  >
                    <div className="relative">
                      <input
                        type="checkbox"
                        value={option.value}
                        checked={isChecked}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="sr-only peer"
                        disabled={disabled || field.disabled}
                        readOnly={field.readonly}
                        aria-invalid={!!error && touched}
                      />
                      <div
                        className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${
                          error && touched
                            ? 'border-red-500 peer-checked:bg-red-500'
                            : 'border-gray-300 peer-checked:bg-blue-500 hover:border-gray-400'
                        } ${disabled || field.disabled ? 'bg-gray-100' : 'bg-white'}`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <span
                      className={`text-gray-700 ${disabled || field.disabled ? 'opacity-50' : ''}`}
                    >
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          );

        case 'file':
          return (
            <div className="space-y-3">
              <input
                id={fieldId}
                type="file"
                ref={fileInputRef}
                onChange={handleChange}
                onBlur={handleBlur}
                className={baseClasses}
                required={field.required}
                disabled={disabled || field.disabled}
                readOnly={field.readonly}
                accept={field.metadata?.accept}
                aria-invalid={!!error && touched}
              />
              {filePreview && (
                <div className="mt-2">
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="max-h-48 rounded-lg border border-gray-300"
                  />
                </div>
              )}
              {value && typeof value === 'string' && (
                <div className="text-sm text-gray-500">Current file: {value.split('/').pop()}</div>
              )}
            </div>
          );

        case 'json':
          return (
            <textarea
              id={fieldId}
              value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              rows={6}
              placeholder={field.placeholder}
              className={`${baseClasses} font-mono text-sm`}
              required={field.required}
              disabled={disabled || field.disabled}
              readOnly={field.readonly}
              aria-invalid={!!error && touched}
            />
          );

        case 'account_select':
          // Custom account selector using CascadingAccountSelector
          return (
            <div className="relative">
              <CascadingAccountSelector
                value={value ? parseInt(value as string) : null}
                onChange={accountId => {
                  onChange(field.name, accountId);
                  if (onBlur) {
                    onBlur(field.name);
                  }
                }}
                filterParentId={field.metadata?.filter_parent_id}
                placeholder={field.placeholder || 'Select account'}
                required={field.required}
                style={{
                  opacity: disabled || field.disabled ? 0.5 : 1,
                  pointerEvents: disabled || field.disabled || field.readonly ? 'none' : 'auto',
                  cursor: disabled || field.disabled || field.readonly ? 'not-allowed' : 'pointer',
                }}
              />
              {field.metadata?.pre_selected && field.readonly && (
                <div className="mt-2 text-xs text-blue-600 flex items-center space-x-1">
                  <Info className="w-3 h-3" />
                  <span>This account was pre-selected during setup</span>
                </div>
              )}
              {field.metadata?.help_text && (
                <div className="mt-1 text-xs text-gray-500">{field.metadata.help_text}</div>
              )}
            </div>
          );

        default:
          return <div className="text-amber-600 text-sm">Unsupported field type: {field.type}</div>;
      }
    };

    return (
      <FieldWrapper field={field} error={error} touched={touched} isDirty={isDirty}>
        {renderField()}
      </FieldWrapper>
    );
  }
);

FormFieldComponent.displayName = 'FormFieldComponent';

// ========== MAIN COMPONENT ==========
const FormPageRenderer: React.FC<FormPageRendererProps> = ({ config }) => {
  const navigate = useNavigate();
  const { schema, loading, error: schemaError, refetch } = useFormSchema(config);
  const {
    data: formData,
    errors,
    touched,
    submitting,
    submitted,
    handleFieldChange,
    handleFieldBlur,
    validateForm,
    resetForm,
    setSubmitting,
    setSubmitted,
    setErrors,
  } = useForm(schema, config.initialData);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResponse, setSubmitResponse] = useState<any>(null);
  const [celeryHealthy, setCeleryHealthy] = useState<boolean | null>(null);
  const [celeryCheckLoading, setCeleryCheckLoading] = useState(true);

  // Check Celery health on mount
  useEffect(() => {
    const checkCeleryHealth = async () => {
      try {
        const response = await fetch('/api/automations/celery-health/');
        const data = await response.json();
        setCeleryHealthy(data.status === 'healthy');
      } catch (err) {
        console.error('Celery health check failed:', err);
        setCeleryHealthy(false);
      } finally {
        setCeleryCheckLoading(false);
      }
    };

    checkCeleryHealth();
  }, []);

  const isDirty = useCallback(
    (fieldName: string): boolean => {
      if (!schema || !config.initialData) return false;
      const field = schema.fields.find(f => f.name === fieldName);
      if (!field) return false;

      const initialValue = config.initialData[fieldName];
      const currentValue = formData[fieldName];

      if (field.type === 'json') {
        return JSON.stringify(initialValue) !== JSON.stringify(currentValue);
      }

      return initialValue !== currentValue;
    },
    [schema, config.initialData, formData]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      if (!validateForm() || !schema) {
        // Scroll to first error
        const firstErrorField = Object.keys(errors)[0];
        if (firstErrorField) {
          const element = document.getElementById(`field-${firstErrorField}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        // Prepare submission data
        const submissionData: Record<string, any> = {
          form_schema_id: config.form_schema_id, // Backend expects form_schema_id, not form_schema
          data: formData,
          context: config.context || {},
          mode: config.mode || 'create',
        };

        // Add entity ID for edit mode
        if (config.mode === 'edit' && config.entityId) {
          submissionData.entity_id = config.entityId;
        }

        // Add pattern ID if exists
        if (config.patternId) {
          submissionData.pattern_id = config.patternId;
        }

        const response = await fetch(config.submitEndpoint, {
          method: config.mode === 'edit' && config.entityId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            // Add auth token if available
            ...(localStorage.getItem('token') && {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            }),
          },
          body: JSON.stringify(submissionData),
        });

        const responseData = await response.json();

        if (!response.ok) {
          // Handle validation errors from server
          if (response.status === 422 && responseData.errors) {
            setErrors(responseData.errors);
            throw new Error('Please fix the validation errors');
          }

          throw new Error(
            responseData.message ||
              responseData.error ||
              `HTTP ${response.status}: Submission failed`
          );
        }

        setSubmitted(true);
        setSubmitResponse(responseData);

        // Call onSuccess callback if provided
        if (config.onSuccess) {
          config.onSuccess(responseData);
        }

        // Handle redirect if enabled
        if (!config.disableRedirect) {
          if (config.successUrl) {
            setTimeout(() => {
              navigate(config.successUrl!);
            }, 1500);
          } else if (responseData.redirect_url) {
            setTimeout(() => {
              navigate(responseData.redirect_url);
            }, 1500);
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit form';
        setSubmitError(errorMessage);

        // Call onError callback if provided
        if (config.onError) {
          config.onError(err);
        }

        console.error('Form submission error:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [
      schema,
      formData,
      config,
      validateForm,
      errors,
      setSubmitting,
      setSubmitted,
      setErrors,
      config.onSuccess,
      config.onError,
    ]
  );

  const handleCancel = useCallback(() => {
    if (config.onCancel) {
      config.onCancel();
    } else {
      window.history.back();
    }
  }, [config.onCancel]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<any>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Memoized field list for performance
  const fieldList = useMemo(() => {
    if (!schema?.fields) return null;

    return schema.fields
      .filter(field => !field.hidden)
      .map(field => {
        const shouldDisable = config.mode === 'view' || field.disabled;

        return (
          <FormFieldComponent
            key={field.id || field.name}
            field={field}
            value={formData[field.name]}
            onChange={handleFieldChange}
            onBlur={name => handleFieldBlur(name, field)}
            error={errors[field.name]}
            touched={touched[field.name]}
            disabled={shouldDisable}
            isDirty={isDirty(field.name)}
          />
        );
      });
  }, [schema, formData, errors, touched, handleFieldChange, handleFieldBlur, config.mode, isDirty]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Loading form...</p>
          <button onClick={() => refetch()} className="text-sm text-blue-600 hover:text-blue-800">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (schemaError || !schema) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Form</h2>
              <p className="text-red-700 mb-4">
                {schemaError || 'The form schema could not be loaded.'}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={refetch}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                >
                  Try Again
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-2xl mx-auto p-4 md:p-6 ${config.className || ''}`}
      style={config.style}
      onKeyDown={handleKeyPress}
    >
      {/* Header */}
      <div className="mb-8 space-y-6">
        {config.showBackButton && (
          <button
            onClick={handleCancel}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors group"
            type="button"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back</span>
          </button>
        )}

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {schema.title}
            {config.mode === 'edit' && (
              <span className="ml-2 text-sm font-normal text-blue-600">(Edit Mode)</span>
            )}
            {config.mode === 'view' && (
              <span className="ml-2 text-sm font-normal text-gray-600">(View Only)</span>
            )}
          </h1>
          {schema.description && (
            <p className="text-gray-600 leading-relaxed">{schema.description}</p>
          )}
        </div>
      </div>

      {/* Success Message */}
      {submitted && (
        <div className="mb-8 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-start space-x-4 animate-in fade-in slide-in-from-top-5">
            <div className="bg-green-100 p-2 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 text-lg mb-1">
                {config.mode === 'edit' ? 'Updated Successfully!' : 'Submitted Successfully!'}
              </h3>
              <p className="text-green-700 text-sm">
                {config.disableRedirect
                  ? 'Your submission has been processed.'
                  : config.successUrl
                    ? 'Redirecting...'
                    : 'Redirecting...'}
              </p>
              {submitResponse?.message && (
                <p className="text-green-600 text-sm mt-2">{submitResponse.message}</p>
              )}
              {submitResponse?.submission_reference && (
                <p className="text-green-600 text-xs mt-2 font-mono">
                  Ref: {submitResponse.submission_reference}
                </p>
              )}
            </div>
          </div>

          {/* Workflow Status Monitoring */}
          {submitResponse?.id && submitResponse?.submission_reference && (
            <WorkflowStatusMonitor
              submissionId={submitResponse.id}
              submissionReference={submitResponse.submission_reference}
              onComplete={data => {
                console.log('Workflow completed:', data);
              }}
              onError={error => {
                console.error('Workflow error:', error);
              }}
            />
          )}
        </div>
      )}

      {/* Celery Health Warning */}
      {!celeryCheckLoading && celeryHealthy === false && !submitted && (
        <div className="mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-yellow-900 text-sm mb-1">
                Workflow System Offline
              </h4>
              <p className="text-yellow-700 text-xs">
                The automation system is currently unavailable. Your form will be submitted, but
                automated workflows will not execute until the system is back online.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div className="mb-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start space-x-4 animate-in fade-in slide-in-from-top-5">
            <div className="bg-red-100 p-2 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 text-lg mb-1">Submission Failed</h3>
              <p className="text-red-700 text-sm">{submitError}</p>
            </div>
            <button
              onClick={() => setSubmitError(null)}
              className="text-red-600 hover:text-red-800 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-gray-200">
          <div className="space-y-8">{fieldList}</div>

          {/* Form Actions */}
          {config.mode !== 'view' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-8 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                <span className="text-red-500">*</span> indicates required field
              </div>

              <div className="flex items-center space-x-4 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center space-x-2 flex-1 sm:flex-none"
                >
                  <X className="w-4 h-4" />
                  <span>{schema.resetButtonText || 'Reset'}</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting || submitted}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg text-sm font-medium flex items-center justify-center space-x-2 flex-1 sm:flex-none"
                >
                  {submitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : submitted ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Submitted</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {config.submitButtonText || schema.submitButtonText || 'Submit Form'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {config.mode !== 'view' && (
            <div className="mt-6 text-xs text-gray-400 text-center">
              <p>Press Ctrl+Enter to submit</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

// Export individual components for reuse in other modals
export { FormFieldComponent, FieldWrapper };
export type { FormField, FormSchema, FormPageRendererProps };
export default FormPageRenderer;
