// src/types/statements.ts

export interface StatementTransaction {
  id: number;
  date: string;
  reference: string;
  description: string;
  charges: string;
  payments: string;
  balance: string;
  type: 'charge' | 'payment' | 'adjustment';
}

export interface StatementPreview {
  client: {
    id: number;
    full_name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  period_start: string;
  period_end: string;
  opening_balance: string;
  closing_balance: string;
  total_charges: string;
  total_payments: string;
  transaction_count: number;
  transactions: StatementTransaction[];
  statement_date: string;
}

export interface StatementGenerationParams {
  client: number;
  period_start: string;
  period_end: string;
  include_paid: boolean;
  include_zero_balance: boolean;
  statement_template?: string;
}

export interface EmailComposition {
  to: string;
  subject: string;
  message: string;
  send_copy_to?: string[];
}

export interface StatementEmailData {
  email: string;
  subject: string;
  message: string;
}
