// Comprehensive validation utilities for procurement system

export interface ValidationRule<T = any> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface FieldValidationResult {
  [fieldName: string]: ValidationResult;
}

// Basic validation rules
export const validationRules = {
  required: <T>(message = 'This field is required'): ValidationRule<T> => ({
    validate: (value: T) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value: string) => !value || value.length >= min,
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value: string) => !value || value.length <= max,
    message: message || `Must be no more than ${max} characters`,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule<string> => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty for optional fields
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  phone: (message = 'Please enter a valid phone number'): ValidationRule<string> => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty for optional fields
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
    },
    message,
  }),

  number: (message = 'Must be a valid number'): ValidationRule<string | number> => ({
    validate: (value: string | number) => {
      if (!value && value !== 0) return true; // Allow empty for optional fields
      return !isNaN(Number(value));
    },
    message,
  }),

  positiveNumber: (message = 'Must be a positive number'): ValidationRule<string | number> => ({
    validate: (value: string | number) => {
      if (!value && value !== 0) return true; // Allow empty for optional fields
      const num = Number(value);
      return !isNaN(num) && num > 0;
    },
    message,
  }),

  nonNegativeNumber: (message = 'Must be zero or positive'): ValidationRule<string | number> => ({
    validate: (value: string | number) => {
      if (!value && value !== 0) return true; // Allow empty for optional fields
      const num = Number(value);
      return !isNaN(num) && num >= 0;
    },
    message,
  }),

  minValue: (min: number, message?: string): ValidationRule<string | number> => ({
    validate: (value: string | number) => {
      if (!value && value !== 0) return true; // Allow empty for optional fields
      const num = Number(value);
      return !isNaN(num) && num >= min;
    },
    message: message || `Must be at least ${min}`,
  }),

  maxValue: (max: number, message?: string): ValidationRule<string | number> => ({
    validate: (value: string | number) => {
      if (!value && value !== 0) return true; // Allow empty for optional fields
      const num = Number(value);
      return !isNaN(num) && num <= max;
    },
    message: message || `Must be no more than ${max}`,
  }),

  date: (message = 'Please enter a valid date'): ValidationRule<string> => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty for optional fields
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    message,
  }),

  futureDate: (message = 'Date must be in the future'): ValidationRule<string> => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty for optional fields
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    },
    message,
  }),

  pastDate: (message = 'Date must be in the past'): ValidationRule<string> => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty for optional fields
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date <= today;
    },
    message,
  }),

  custom: <T>(validator: (value: T) => boolean, message: string): ValidationRule<T> => ({
    validate: validator,
    message,
  }),
};

// Validation function
export function validateField<T>(value: T, rules: ValidationRule<T>[]): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Validate multiple fields
export function validateFields(
  data: Record<string, any>,
  schema: Record<string, ValidationRule<any>[]>
): FieldValidationResult {
  const results: FieldValidationResult = {};

  for (const [fieldName, rules] of Object.entries(schema)) {
    const value = data[fieldName];
    results[fieldName] = validateField(value, rules);
  }

  return results;
}

// Check if all fields are valid
export function isFormValid(validationResults: FieldValidationResult): boolean {
  return Object.values(validationResults).every(result => result.isValid);
}

// Get all error messages
export function getAllErrors(validationResults: FieldValidationResult): string[] {
  return Object.values(validationResults).flatMap(result => result.errors);
}

// Procurement-specific validation schemas
export const procurementValidationSchemas = {
  supplier: {
    name: [validationRules.required('Supplier name is required'), validationRules.maxLength(100)],
    email: [validationRules.email()],
    phone: [validationRules.phone()],
    credit_limit: [validationRules.nonNegativeNumber('Credit limit must be zero or positive')],
  },

  purchaseOrder: {
    supplier_id: [validationRules.required('Please select a supplier')],
    delivery_location_id: [validationRules.required('Please select a delivery location')],
    expected_delivery_date: [validationRules.date()], // Remove futureDate requirement for flexibility
    items: [
      validationRules.custom(
        (items: any[]) => Array.isArray(items) && items.length > 0,
        'Please add at least one item'
      ),
    ],
  },

  purchaseOrderItem: {
    item_id: [validationRules.required('Please select an item')],
    quantity: [
      validationRules.required('Quantity is required'),
      validationRules.positiveNumber('Quantity must be positive'),
    ],
    unit_price: [
      validationRules.required('Unit price is required'),
      validationRules.nonNegativeNumber('Unit price must be zero or positive'),
    ],
  },

  requisition: {
    department_id: [validationRules.required('Please select a department')],
    justification: [
      validationRules.required('Justification is required'),
      validationRules.minLength(10, 'Please provide a detailed justification'),
    ],
    items: [
      validationRules.custom(
        (items: any[]) => Array.isArray(items) && items.length > 0,
        'Please add at least one item'
      ),
    ],
  },

  requisitionItem: {
    item_id: [validationRules.required('Please select an item')],
    quantity: [
      validationRules.required('Quantity is required'),
      validationRules.positiveNumber('Quantity must be positive'),
    ],
    estimated_cost: [validationRules.nonNegativeNumber('Estimated cost must be zero or positive')],
    specification: [
      validationRules.maxLength(500, 'Specification must be less than 500 characters'),
    ],
  },

  grn: {
    purchase_order: [validationRules.required('Please select a purchase order')],
    received_date: [validationRules.required('Received date is required'), validationRules.date()],
    received_time: [validationRules.required('Received time is required')],
    received_location: [validationRules.required('Please select a received location')],
    delivery_note_number: [validationRules.maxLength(50)],
    vehicle_number: [validationRules.maxLength(20)],
    driver_name: [validationRules.maxLength(100)],
    driver_phone: [validationRules.phone()],
  },

  grnItem: {
    quantity_to_receive: [
      validationRules.required('Quantity to receive is required'),
      validationRules.positiveNumber('Quantity must be positive'),
    ],
    quantity_accepted: [
      validationRules.nonNegativeNumber('Accepted quantity must be zero or positive'),
    ],
    quantity_rejected: [
      validationRules.nonNegativeNumber('Rejected quantity must be zero or positive'),
    ],
  },

  purchaseReturn: {
    grn: [validationRules.required('Please select a GRN')],
    return_date: [validationRules.required('Return date is required'), validationRules.date()],
    return_reason_category: [validationRules.required('Please select a return reason category')],
    refund_method: [validationRules.required('Please select a refund method')],
    items: [
      validationRules.custom(
        (items: any[]) => Array.isArray(items) && items.length > 0,
        'Please add at least one item to return'
      ),
    ],
  },

  returnItem: {
    quantity_returned: [
      validationRules.required('Return quantity is required'),
      validationRules.positiveNumber('Return quantity must be positive'),
    ],
    return_reason: [
      validationRules.required('Return reason is required'),
      validationRules.maxLength(200),
    ],
    condition: [validationRules.required('Please specify item condition')],
  },
};

// File validation utilities
export const fileValidation = {
  validateFileSize: (file: File, maxSizeMB: number): ValidationResult => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return {
      isValid: file.size <= maxSizeBytes,
      errors: file.size > maxSizeBytes ? [`File size must be less than ${maxSizeMB}MB`] : [],
    };
  },

  validateFileType: (file: File, allowedTypes: string[]): ValidationResult => {
    return {
      isValid: allowedTypes.includes(file.type),
      errors: !allowedTypes.includes(file.type) ? [`File type ${file.type} is not allowed`] : [],
    };
  },

  validateImage: (file: File, maxSizeMB = 10): ValidationResult => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const sizeResult = fileValidation.validateFileSize(file, maxSizeMB);
    const typeResult = fileValidation.validateFileType(file, allowedTypes);

    return {
      isValid: sizeResult.isValid && typeResult.isValid,
      errors: [...sizeResult.errors, ...typeResult.errors],
    };
  },

  validateDocument: (file: File, maxSizeMB = 50): ValidationResult => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const sizeResult = fileValidation.validateFileSize(file, maxSizeMB);
    const typeResult = fileValidation.validateFileType(file, allowedTypes);

    return {
      isValid: sizeResult.isValid && typeResult.isValid,
      errors: [...sizeResult.errors, ...typeResult.errors],
    };
  },
};

// Async validation utilities
export interface AsyncValidationRule<T = any> {
  validate: (value: T) => Promise<boolean>;
  message: string;
}

export async function validateFieldAsync<T>(
  value: T,
  rules: AsyncValidationRule<T>[]
): Promise<ValidationResult> {
  const errors: string[] = [];

  for (const rule of rules) {
    try {
      const isValid = await rule.validate(value);
      if (!isValid) {
        errors.push(rule.message);
      }
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Debounced validation for real-time feedback
export function createDebouncedValidator<T>(
  validator: (value: T) => ValidationResult | Promise<ValidationResult>,
  delay = 300
) {
  let timeoutId: NodeJS.Timeout;

  return (value: T, callback: (result: ValidationResult) => void) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      try {
        const result = await validator(value);
        callback(result);
      } catch (error) {
        callback({
          isValid: false,
          errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        });
      }
    }, delay);
  };
}

// Export enhanced validation system
export { EnhancedFormValidator } from './EnhancedFormValidator';
export type {
  RequisitionFormData,
  SubmissionType,
  ValidationState,
  EnhancedValidationResult,
} from './EnhancedFormValidator';
