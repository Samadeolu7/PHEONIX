export type FormFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'file'
  | 'email'
  | 'textarea'
  | 'checkbox'
  | 'money';

export interface ValidationRules {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface FormField {
  helpText: any;
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  options?: string[];
  validation?: ValidationRules;
  defaultValue?: FormFieldValue;
  description?: string;
  required?: boolean;
}

export interface FormSchema {
  id: number;
  name: string;
  description?: string;
  fields: FormField[];
  automationId?: string;
}

export type FormFieldValue = string | number | boolean | string[];

export type FormValues = Record<string, FormFieldValue>;

export interface FormErrors {
  [key: string]: string;
}
