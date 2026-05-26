// config/domainConfig.ts
/**
 * Minimal domain configuration for field label abstraction.
 * No workflow or dashboard configs - just label mapping.
 */

export type DomainType = 'microfinance' | 'school' | 'hospital' | 'retail';

/**
 * Field label mapping configuration
 * Maps backend field names to display labels for each domain
 */
export interface FieldLabelMap {
  [backendFieldName: string]: string | null; // null = hide field
}

/**
 * Domain-specific configuration
 */
export interface DomainConfig {
  domain: DomainType;

  // Label mappings for different entities
  labels: {
    client: {
      entityName: string; // "Client" or "Student" or "Patient"
      entityNamePlural: string; // "Clients" or "Students" or "Patients"
      fields: FieldLabelMap; // Field-level label overrides
    };
    loan: {
      entityName: string;
      entityNamePlural: string;
      fields: FieldLabelMap;
    };
    income: {
      entityName: string;
      entityNamePlural: string;
      fields: FieldLabelMap;
    };
    document: {
      entityName: string;
      entityNamePlural: string;
      // Document type label mappings
      types: {
        [backendType: string]: string;
      };
    };
    relationship: {
      entityName: string;
      entityNamePlural: string;
      // Relationship type label mappings
      types: {
        [backendType: string]: string;
      };
    };
  };

  // Fields that should be hidden in this domain
  hiddenFields: {
    client: string[];
    loan: string[];
    income: string[];
  };

  // Fields that are required in this domain
  requiredFields: {
    client: string[];
    loan?: string[];
    income?: string[];
  };

  // Default filter values for queries
  defaultFilters: {
    client?: Record<string, any>;
    loan?: Record<string, any>;
    income?: Record<string, any>;
  };
}

// ============================================
// MICROFINANCE DOMAIN (Default/Standard)
// ============================================

export const MICROFINANCE_CONFIG: DomainConfig = {
  domain: 'microfinance',

  labels: {
    client: {
      entityName: 'Client',
      entityNamePlural: 'Clients',
      fields: {
        // Keep all standard labels
        client_id: 'Client ID',
        first_name: 'First Name',
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
        interest_rate: 'Interest Rate',
        disbursed_amount: 'Disbursed Amount',
        outstanding_principal: 'Outstanding Principal',
        outstanding_interest: 'Outstanding Interest',
        term_months: 'Loan Term (Months)',
        payment_frequency: 'Payment Frequency',
        disbursed_on: 'Disbursement Date',
        first_payment_date: 'First Payment Date',
        status: 'Loan Status',
        days_in_arrears: 'Days in Arrears',
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
    document: {
      entityName: 'Document',
      entityNamePlural: 'Documents',
      types: {
        id_card: 'ID Card',
        passport: 'Passport',
        utility_bill: 'Utility Bill',
        bank_statement: 'Bank Statement',
        employment_letter: 'Employment Letter',
        salary_slip: 'Salary Slip',
        other: 'Other Document',
      },
    },
    relationship: {
      entityName: 'Relationship',
      entityNamePlural: 'Relationships',
      types: {
        spouse: 'Spouse',
        parent: 'Parent',
        child: 'Child',
        sibling: 'Sibling',
        business_partner: 'Business Partner',
        other: 'Other',
      },
    },
  },

  hiddenFields: {
    client: [],
    loan: [],
    income: [],
  },

  requiredFields: {
    client: ['first_name', 'last_name', 'phone_primary', 'date_of_birth'],
    loan: ['principal', 'interest_rate', 'term_months'],
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

  labels: {
    client: {
      entityName: 'Student',
      entityNamePlural: 'Students',
      fields: {
        // Rename fields for school context
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
        occupation: null,
        employer_name: null,
        annual_income: null,
        bank_name: null,
        bank_account_number: null,
        bank_verification_number: null,
        employment_status: null,
      },
    },
    loan: {
      entityName: 'Fee Payment Plan',
      entityNamePlural: 'Payment Plans',
      fields: {
        principal: 'Total Fees',
        interest_rate: null, // Hide (always 0 for schools)
        disbursed_amount: 'Billed Amount',
        outstanding_principal: 'Outstanding Balance',
        outstanding_interest: null,
        outstanding_penalties: 'Late Fees',
        term_months: 'Payment Terms',
        payment_frequency: 'Payment Schedule',
        disbursed_on: 'Term Start Date',
        first_payment_date: 'First Payment Due',
        final_payment_date: 'Final Payment Due',
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
    document: {
      entityName: 'Document',
      entityNamePlural: 'Documents',
      types: {
        id_card: 'Birth Certificate',
        passport: 'Student Photo',
        utility_bill: 'Proof of Residence',
        bank_statement: 'Previous School Records',
        employment_letter: 'Guardian Employment Letter',
        other: 'Other Document',
      },
    },
    relationship: {
      entityName: 'Relationship',
      entityNamePlural: 'Relationships',
      types: {
        spouse: 'Guardian',
        parent: 'Parent',
        child: 'Dependent',
        sibling: 'Sibling',
        other: 'Emergency Contact',
      },
    },
  },

  hiddenFields: {
    client: [
      'occupation',
      'employer_name',
      'annual_income',
      'income_source',
      'bank_name',
      'bank_account_number',
      'bank_account_name',
      'bank_verification_number',
      'employment_status',
      'marital_status',
      'risk_level',
    ],
    loan: ['interest_rate', 'outstanding_interest', 'credit_score'],
    income: [],
  },

  requiredFields: {
    client: [
      'first_name',
      'last_name',
      'date_of_birth',
      'gender',
      'phone_primary',
      'address_street',
      'classification', // Grade level
    ],
  },

  defaultFilters: {
    client: {
      status: 'active',
      usage_context: 'student', // Backend field to filter
    },
    loan: {
      status: 'active',
      interest_rate: 0, // Only show 0% loans (fee plans)
    },
  },
};

// ============================================
// HOSPITAL DOMAIN (Example for future expansion)
// ============================================

export const HOSPITAL_CONFIG: DomainConfig = {
  domain: 'hospital',

  labels: {
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
        // Hide financial fields
        occupation: null,
        employer_name: null,
        annual_income: null,
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
    document: {
      entityName: 'Medical Record',
      entityNamePlural: 'Medical Records',
      types: {
        id_card: 'National ID',
        passport: 'Passport',
        utility_bill: 'Proof of Address',
        other: 'Medical Document',
      },
    },
    relationship: {
      entityName: 'Emergency Contact',
      entityNamePlural: 'Emergency Contacts',
      types: {
        spouse: 'Spouse',
        parent: 'Parent',
        child: 'Child',
        other: 'Emergency Contact',
      },
    },
  },

  hiddenFields: {
    client: ['occupation', 'employer_name', 'annual_income', 'bank_name'],
    loan: ['interest_rate'],
    income: [],
  },

  requiredFields: {
    client: ['first_name', 'last_name', 'phone_primary', 'date_of_birth'],
  },

  defaultFilters: {
    client: { status: 'active', usage_context: 'patient' },
  },
};

// ============================================
// CONFIG REGISTRY
// ============================================

const DOMAIN_CONFIGS: Record<DomainType, DomainConfig> = {
  microfinance: MICROFINANCE_CONFIG,
  school: SCHOOL_CONFIG,
  hospital: HOSPITAL_CONFIG,
  retail: MICROFINANCE_CONFIG, // Use default for now
};

/**
 * Get domain configuration by type
 */
export function getDomainConfig(domainType: DomainType): DomainConfig {
  return DOMAIN_CONFIGS[domainType] || MICROFINANCE_CONFIG;
}

/**
 * Get field label for a specific domain and entity
 */
export function getFieldLabel(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income',
  fieldName: string
): string | null {
  const config = getDomainConfig(domainType);
  const label = config.labels[entity].fields[fieldName];

  // If label is null, field should be hidden
  // If undefined, use the field name as-is
  return label === null ? null : label || fieldName;
}

/**
 * Check if field should be visible in current domain
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

  // Check if label is set to null
  const label = config.labels[entity].fields[fieldName];
  if (label === null) {
    return false;
  }

  return true;
}

/**
 * Get entity name (singular) for current domain
 */
export function getEntityName(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income' | 'document' | 'relationship'
): string {
  const config = getDomainConfig(domainType);
  return config.labels[entity].entityName;
}

/**
 * Get entity name (plural) for current domain
 */
export function getEntityNamePlural(
  domainType: DomainType,
  entity: 'client' | 'loan' | 'income' | 'document' | 'relationship'
): string {
  const config = getDomainConfig(domainType);
  return config.labels[entity].entityNamePlural;
}

/**
 * Get document type label for current domain
 */
export function getDocumentTypeLabel(domainType: DomainType, documentType: string): string {
  const config = getDomainConfig(domainType);
  return config.labels.document.types[documentType] || documentType;
}

/**
 * Get relationship type label for current domain
 */
export function getRelationshipTypeLabel(domainType: DomainType, relationshipType: string): string {
  const config = getDomainConfig(domainType);
  return config.labels.relationship.types[relationshipType] || relationshipType;
}

export default {
  getDomainConfig,
  getFieldLabel,
  isFieldVisible,
  getEntityName,
  getEntityNamePlural,
  getDocumentTypeLabel,
  getRelationshipTypeLabel,
};
