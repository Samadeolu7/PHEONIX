// src/constants/domainConfig.ts
/**
 * Domain configuration constants for field label abstraction.
 * Simple label mapping - no complex workflow or dashboard configs.
 */

export type DomainType = 'microfinance' | 'school' | 'hospital' | 'retail';

/**
 * Field label mapping - maps backend field names to display labels
 */
export interface FieldLabels {
  [backendFieldName: string]: string; // Use empty string to hide field
}

/**
 * Entity configuration for a domain
 */
export interface EntityConfig {
  entityName: string; // Singular name (e.g., "Student", "Client")
  entityNamePlural: string; // Plural name (e.g., "Students", "Clients")
  fields: FieldLabels; // Field label mappings
}

/**
 * Complete domain configuration
 */
export interface DomainConfig {
  domain: DomainType;
  displayName: string;

  // Entity configurations
  client: EntityConfig;
  loan: EntityConfig;
  income: EntityConfig;

  // Document type labels
  documentTypes: { [key: string]: string };

  // Relationship type labels
  relationshipTypes: { [key: string]: string };

  // Fields to hide (empty string in fields also works, but this is more explicit)
  hiddenFields: {
    client: string[];
    loan: string[];
    income: string[];
  };

  // Default filter values
  defaultFilters: {
    client?: Record<string, any>;
    loan?: Record<string, any>;
    income?: Record<string, any>;
  };
}

// ============================================
// MICROFINANCE DOMAIN (Default)
// ============================================

export const MICROFINANCE_CONFIG: DomainConfig = {
  domain: 'microfinance',
  displayName: 'Microfinance',

  client: {
    entityName: 'Client',
    entityNamePlural: 'Clients',
    fields: {
      client_id: 'Client ID',
      first_name: 'First Name',
      middle_name: 'Middle Name',
      last_name: 'Last Name',
      phone_primary: 'Phone Number',
      email: 'Email Address',
      date_of_birth: 'Date of Birth',
      gender: 'Gender',
      occupation: 'Occupation',
      employer_name: 'Employer',
      annual_income: 'Annual Income',
      classification: 'Client Classification',
      status: 'Status',
      kyc_status: 'KYC Status',
    },
  },

  loan: {
    entityName: 'Loan',
    entityNamePlural: 'Loans',
    fields: {
      principal: 'Loan Amount',
      interest_rate: 'Interest Rate (%)',
      disbursed_amount: 'Disbursed Amount',
      outstanding_principal: 'Outstanding Principal',
      outstanding_interest: 'Outstanding Interest',
      term_months: 'Loan Term (Months)',
      payment_frequency: 'Payment Frequency',
      disbursed_on: 'Disbursement Date',
      status: 'Loan Status',
    },
  },

  income: {
    entityName: 'Income',
    entityNamePlural: 'Income Records',
    fields: {
      name: 'Income Name',
      amount: 'Amount',
      category: 'Income Category',
      invoice_date: 'Invoice Date',
      due_date: 'Due Date',
      status: 'Payment Status',
    },
  },

  documentTypes: {
    id_card: 'ID Card',
    passport: 'Passport',
    utility_bill: 'Utility Bill',
    bank_statement: 'Bank Statement',
    other: 'Other Document',
  },

  relationshipTypes: {
    spouse: 'Spouse',
    parent: 'Parent',
    sibling: 'Sibling',
    business_partner: 'Business Partner',
    other: 'Other',
  },

  hiddenFields: {
    client: [],
    loan: [],
    income: [],
  },

  defaultFilters: {
    client: { status: 'active' },
    loan: { status: 'active' },
  },
};

// ============================================
// SCHOOL DOMAIN
// ============================================

export const SCHOOL_CONFIG: DomainConfig = {
  domain: 'school',
  displayName: 'School',

  client: {
    entityName: 'Student',
    entityNamePlural: 'Students',
    fields: {
      client_id: 'Admission Number',
      first_name: 'First Name',
      middle_name: 'Middle Name',
      last_name: 'Last Name',
      date_of_birth: 'Date of Birth',
      gender: 'Gender',
      phone_primary: 'Guardian Phone',
      email: 'Guardian Email',
      address_street: 'Home Address',
      address_city: 'City',
      address_state: 'State',
      classification: 'Grade Level',
      status: 'Enrollment Status',
      kyc_status: 'Registration Status',
      image: 'Student Photo',
      // Hide financial fields
      occupation: '',
      employer_name: '',
      annual_income: '',
      bank_name: '',
      bank_account_number: '',
    },
  },

  loan: {
    entityName: 'Fee Payment Plan',
    entityNamePlural: 'Payment Plans',
    fields: {
      principal: 'Total Fees',
      interest_rate: '', // Hide
      disbursed_amount: 'Total Amount',
      outstanding_principal: 'Outstanding Balance',
      outstanding_interest: '', // Hide
      outstanding_penalties: 'Late Fees',
      term_months: 'Payment Terms',
      payment_frequency: 'Payment Schedule',
      disbursed_on: 'Term Start Date',
      first_payment_date: 'First Payment Due',
      status: 'Payment Status',
      days_in_arrears: 'Days Overdue',
    },
  },

  income: {
    entityName: 'Fee',
    entityNamePlural: 'Fees',
    fields: {
      name: 'Fee Name',
      amount: 'Fee Amount',
      amount_paid: 'Amount Paid',
      category: 'Fee Type',
      invoice_date: 'Invoice Date',
      due_date: 'Due Date',
      status: 'Payment Status',
    },
  },

  documentTypes: {
    id_card: 'Birth Certificate',
    passport: 'Student Photo',
    utility_bill: 'Proof of Residence',
    bank_statement: 'Previous School Records',
    other: 'Other Document',
  },

  relationshipTypes: {
    spouse: 'Guardian',
    parent: 'Parent',
    sibling: 'Sibling',
    other: 'Emergency Contact',
  },

  hiddenFields: {
    client: [
      'occupation',
      'employer_name',
      'annual_income',
      'bank_name',
      'bank_account_number',
      'bank_verification_number',
      'employment_status',
      'risk_level',
    ],
    loan: ['interest_rate', 'outstanding_interest'],
    income: [],
  },

  defaultFilters: {
    client: {
      status: 'active',
      usage_context: 'student',
    },
    loan: {
      status: 'active',
      interest_rate: 0, // Only fee plans (0% loans)
    },
  },
};

// ============================================
// HOSPITAL DOMAIN
// ============================================

export const HOSPITAL_CONFIG: DomainConfig = {
  domain: 'hospital',
  displayName: 'Hospital',

  client: {
    entityName: 'Patient',
    entityNamePlural: 'Patients',
    fields: {
      client_id: 'Patient ID',
      first_name: 'First Name',
      last_name: 'Last Name',
      phone_primary: 'Contact Number',
      email: 'Email',
      date_of_birth: 'Date of Birth',
      gender: 'Gender',
      address_street: 'Address',
      classification: 'Patient Category',
      status: 'Patient Status',
      occupation: '',
      employer_name: '',
      annual_income: '',
    },
  },

  loan: {
    entityName: 'Medical Bill',
    entityNamePlural: 'Medical Bills',
    fields: {
      principal: 'Total Bill',
      outstanding_principal: 'Outstanding Amount',
      term_months: 'Payment Terms',
      status: 'Bill Status',
      interest_rate: '',
    },
  },

  income: {
    entityName: 'Payment',
    entityNamePlural: 'Payments',
    fields: {
      name: 'Service Name',
      amount: 'Amount',
      category: 'Service Category',
      status: 'Payment Status',
    },
  },

  documentTypes: {
    id_card: 'National ID',
    passport: 'Passport',
    utility_bill: 'Proof of Address',
    other: 'Medical Document',
  },

  relationshipTypes: {
    spouse: 'Spouse',
    parent: 'Parent',
    other: 'Emergency Contact',
  },

  hiddenFields: {
    client: ['occupation', 'employer_name', 'annual_income'],
    loan: ['interest_rate'],
    income: [],
  },

  defaultFilters: {
    client: { status: 'active', usage_context: 'patient' },
  },
};

// ============================================
// CONFIG REGISTRY
// ============================================

export const DOMAIN_CONFIGS: Record<DomainType, DomainConfig> = {
  microfinance: MICROFINANCE_CONFIG,
  school: SCHOOL_CONFIG,
  hospital: HOSPITAL_CONFIG,
  retail: MICROFINANCE_CONFIG, // Default to microfinance for now
};

/**
 * Get domain configuration by type
 */
export function getDomainConfig(domainType: DomainType): DomainConfig {
  return DOMAIN_CONFIGS[domainType] || MICROFINANCE_CONFIG;
}

/**
 * Get field label for a specific entity and field
 */
export function getFieldLabel(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income',
  fieldName: string
): string {
  const config = getDomainConfig(domainType);
  const label = config[entity].fields[fieldName];

  // If empty string, field should be hidden - return empty
  // If undefined, use field name as-is
  // Otherwise return the label
  if (label === '') return '';
  return label || fieldName;
}

/**
 * Check if field should be visible
 */
export function isFieldVisible(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income',
  fieldName: string
): boolean {
  const config = getDomainConfig(domainType);

  // Check if explicitly hidden
  if (config.hiddenFields[entity].includes(fieldName)) {
    return false;
  }

  // Check if label is empty string (means hide)
  const label = config[entity].fields[fieldName];
  if (label === '') {
    return false;
  }

  return true;
}

/**
 * Get entity name (singular)
 */
export function getEntityName(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income'
): string {
  const config = getDomainConfig(domainType);
  return config[entity].entityName;
}

/**
 * Get entity name (plural)
 */
export function getEntityNamePlural(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income'
): string {
  const config = getDomainConfig(domainType);
  return config[entity].entityNamePlural;
}

/**
 * Get document type label
 */
export function getDocumentTypeLabel(domainType: DomainType, documentType: string): string {
  const config = getDomainConfig(domainType);
  return config.documentTypes[documentType] || documentType;
}

/**
 * Get relationship type label
 */
export function getRelationshipTypeLabel(domainType: DomainType, relationshipType: string): string {
  const config = getDomainConfig(domainType);
  return config.relationshipTypes[relationshipType] || relationshipType;
}
