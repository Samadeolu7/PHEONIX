// ============================================================================
// SUPPLIER QUOTES WORKFLOW TYPES
// ============================================================================

import { PaginatedResponse } from './inventory';

// Quote Status Enum
export enum QuoteStatus {
  RECEIVED = 'received',
  SELECTED = 'selected',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// Quote Item Interface
export interface QuoteItem {
  id: number;
  item: number;
  item_name: string;
  description: string;
  quantity: string; // Decimal string
  unit_price: string; // Decimal string
  total_price: string; // Decimal string
  lead_time_days: number;
}

// Quote Interface
export interface Quote {
  id: number;
  quote_number: string;
  requisition: number | null;
  supplier: number;
  supplier_name: string;
  quote_date: string;
  valid_until: string;
  subtotal: string; // Decimal string
  tax_amount: string; // Decimal string
  shipping_cost: string; // Decimal string
  total_amount: string; // Decimal string
  status: 'received' | 'selected' | 'rejected' | 'expired';
  payment_terms: string;
  delivery_terms: string;
  notes: string;
  attachment?: string;
  items: QuoteItem[];
  created_at: string;
  updated_at: string;
}

// Quote Creation Data Interface
export interface CreateQuoteData {
  requisition?: number | null;
  supplier: number;
  quote_date: string;
  valid_until: string;
  subtotal: string; // Decimal string
  tax_amount?: string; // Decimal string
  shipping_cost?: string; // Decimal string
  total_amount: string; // Decimal string
  status?: 'received' | 'selected' | 'rejected' | 'expired';
  payment_terms?: string;
  delivery_terms?: string;
  notes?: string;
  attachment?: string;
  items: {
    item: number;
    description: string;
    quantity: string; // Decimal string
    unit_price: string; // Decimal string
    total_price: string; // Decimal string
    lead_time_days?: number;
  }[];
}

// Quote Update Data Interface
export interface UpdateQuoteData extends Partial<CreateQuoteData> {
  status?: 'received' | 'selected' | 'rejected' | 'expired';
}

// Quote Comparison Interface - Updated to match API response
export interface QuoteComparison {
  quote: Quote;
  total_amount: number;
  delivery_terms: string;
  payment_terms: string;
}

// Quote Comparison Response - Updated to match new API structure
export interface QuoteComparisonResponse {
  requisition_id: number;
  count: number;
  quotes: Quote[];
}

// Comparison Row Interface
export interface ComparisonRow {
  item_id: number;
  item_name: string;
  quantity: string;
  quotes: {
    quote_id: number;
    supplier_name: string;
    unit_price: string;
    total_price: string;
    lead_time_days: number;
  }[];
  lowest_price_quote_id: number;
}

// Quote List Parameters Interface
export interface QuoteListParams {
  search?: string;
  status?: QuoteStatus;
  supplier_id?: number;
  requisition_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  ordering?: string;
}

// Quote Selection Data Interface
export interface QuoteSelectionData {
  comments?: string;
}

// Quote Filter Interface
export interface QuoteFilters {
  status?: QuoteStatus[];
  supplier_id?: number;
  requisition_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// Quote Validation Rules
export const QUOTE_VALIDATION_RULES = {
  supplier: {
    required: true,
  },
  quoteDate: {
    required: true,
  },
  validUntil: {
    required: true,
  },
  items: {
    required: true,
    minItems: 1,
  },
  quantity: {
    required: true,
    min: 0.01,
    max: 999999.99,
  },
  unitPrice: {
    required: true,
    min: 0.01,
    max: 9999999.99,
  },
  leadTimeDays: {
    min: 0,
    max: 365,
  },
  paymentTerms: {
    maxLength: 200,
  },
  deliveryTerms: {
    maxLength: 200,
  },
  notes: {
    maxLength: 1000,
  },
} as const;

// Status transition rules for Quotes
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.RECEIVED]: [QuoteStatus.SELECTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  [QuoteStatus.SELECTED]: [QuoteStatus.REJECTED], // Can be unselected
  [QuoteStatus.REJECTED]: [QuoteStatus.RECEIVED], // Can be reconsidered
  [QuoteStatus.EXPIRED]: [], // Terminal state
};

// Helper functions for Quote validation
export const validateQuoteItem = (item: Partial<CreateQuoteData['items'][0]>): string[] => {
  const errors: string[] = [];

  if (!item.item) {
    errors.push('Item selection is required');
  }

  if (!item.quantity || parseFloat(item.quantity) <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (!item.unit_price || parseFloat(item.unit_price) <= 0) {
    errors.push('Unit price must be greater than 0');
  }

  if (!item.description || item.description.trim().length === 0) {
    errors.push('Item description is required');
  }

  if (item.lead_time_days !== undefined && item.lead_time_days < 0) {
    errors.push('Lead time cannot be negative');
  }

  return errors;
};

export const validateQuote = (quote: Partial<CreateQuoteData>): string[] => {
  const errors: string[] = [];

  if (!quote.supplier) {
    errors.push('Supplier selection is required');
  }

  if (!quote.quote_date) {
    errors.push('Quote date is required');
  }

  if (!quote.valid_until) {
    errors.push('Valid until date is required');
  }

  if (quote.quote_date && quote.valid_until && quote.quote_date >= quote.valid_until) {
    errors.push('Valid until date must be after quote date');
  }

  if (!quote.items || quote.items.length === 0) {
    errors.push('At least one item is required');
  }

  // Validate each item
  if (quote.items) {
    quote.items.forEach((item, index) => {
      const itemErrors = validateQuoteItem(item);
      itemErrors.forEach(error => {
        errors.push(`Item ${index + 1}: ${error}`);
      });
    });
  }

  return errors;
};

// Status display helpers for Quotes
export const getQuoteStatusColor = (status: QuoteStatus): string => {
  switch (status) {
    case QuoteStatus.RECEIVED:
      return 'blue';
    case QuoteStatus.SELECTED:
      return 'green';
    case QuoteStatus.REJECTED:
      return 'red';
    case QuoteStatus.EXPIRED:
      return 'gray';
    default:
      return 'gray';
  }
};

export const getQuoteStatusLabel = (status: QuoteStatus): string => {
  switch (status) {
    case QuoteStatus.RECEIVED:
      return 'Received';
    case QuoteStatus.SELECTED:
      return 'Selected';
    case QuoteStatus.REJECTED:
      return 'Rejected';
    case QuoteStatus.EXPIRED:
      return 'Expired';
    default:
      return 'Unknown';
  }
};
