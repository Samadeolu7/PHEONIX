import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  DollarSign,
  Calendar,
  TrendingUp,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader,
  Info,
  Sparkles,
  Settings,
  Settings2,
  CreditCard,
  Briefcase,
  Receipt,
} from 'lucide-react';

interface Product {
  id?: number;
  name: string;
  code: string;
  product_type: 'SAVINGS' | 'LOAN' | 'EXPENSE' | 'INVESTMENT' | 'INSURANCE';
  description?: string;
  is_active: boolean;
  branch: number;

  // Interest & Fee Configuration
  interest_rate?: number;
  interest_calculation_method?: 'simple' | 'compound' | 'reducing_balance';
  interest_posting_method?: 'auto_journal' | 'pending_approval' | 'accrual';
  interest_posting_cron?: string;
  fee_structure?: any;
  auto_debit_fees?: boolean;

  // Transaction Limits
  min_transaction_amount?: number;
  max_transaction_amount?: number;
  daily_transaction_limit?: number;
  monthly_transaction_limit?: number;

  // Balance Requirements
  minimum_balance?: number;
  allow_overdraft?: boolean;
  overdraft_limit?: number;

  // Validation Configuration
  validation_scope?: 'category' | 'account' | 'user';
  validation_rules?: any;

  // Loan-specific
  term_months?: number;
  repayment_frequency?: string;
  processing_fee_percentage?: number;

  // Approval Requirements
  requires_approval_above?: number;

  // Metadata
  created_at?: string;
  updated_at?: string;
}

const PRODUCT_TYPE_CONFIG = {
  SAVINGS: {
    icon: CreditCard,
    color: '#10b981',
    label: 'Savings Product',
    description: 'Savings accounts with interest posting and balance requirements',
    fields: [
      'interest_rate',
      'interest_posting_cron',
      'minimum_balance',
      'daily_transaction_limit',
      'monthly_transaction_limit',
    ],
  },
  LOAN: {
    icon: Briefcase,
    color: '#f59e0b',
    label: 'Loan Product',
    description: 'Loan products with repayment schedules and interest calculations',
    fields: [
      'interest_rate',
      'term_months',
      'repayment_frequency',
      'processing_fee_percentage',
      'min_transaction_amount',
      'max_transaction_amount',
    ],
  },
  EXPENSE: {
    icon: Receipt,
    color: '#ef4444',
    label: 'Expense Product',
    description: 'Expense categories with spending limits and approval workflows',
    fields: [
      'daily_transaction_limit',
      'monthly_transaction_limit',
      'validation_scope',
      'requires_approval_above',
    ],
  },
  INVESTMENT: {
    icon: TrendingUp,
    color: '#8b5cf6',
    label: 'Investment Product',
    description: 'Investment products with returns tracking',
    fields: ['interest_rate', 'minimum_balance'],
  },
  INSURANCE: {
    icon: Shield,
    color: '#06b6d4',
    label: 'Insurance Product',
    description: 'Insurance products with premium schedules',
    fields: ['fee_structure', 'auto_debit_fees'],
  },
};

const CRON_PRESETS = {
  monthly: {
    label: 'Monthly (1st)',
    value: '0 0 1 * *',
    description: 'Every month on the 1st at midnight',
  },
  quarterly: { label: 'Quarterly', value: '0 0 1 */3 *', description: 'Every 3 months on the 1st' },
  yearly: { label: 'Yearly', value: '0 0 1 1 *', description: 'Every year on January 1st' },
  daily: { label: 'Daily', value: '0 0 * * *', description: 'Every day at midnight' },
  weekly: { label: 'Weekly (Mon)', value: '0 0 * * 1', description: 'Every Monday at midnight' },
};

const ProductManagementPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Product>({
    name: '',
    code: '',
    product_type: 'SAVINGS',
    description: '',
    is_active: true,
    branch: 1, // TODO: Get from context
    interest_rate: 0,
    interest_calculation_method: 'simple',
    interest_posting_method: 'auto_journal',
    validation_scope: 'category',
    allow_overdraft: false,
    auto_debit_fees: false,
    requires_approval_above: 0,
  });

  const [cronPreset, setCronPreset] = useState<string>('monthly');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch('/api/products/products/', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data.results || data);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build payload
      const payload: any = {
        ...formData,
        interest_posting_cron:
          cronPreset === 'custom'
            ? formData.interest_posting_cron
            : CRON_PRESETS[cronPreset]?.value,
      };

      const url = editingProduct ? `/api/products/products/${editingProduct.id}/` : '/api/products/products/';
      const method = editingProduct ? 'PUT' : 'POST';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || 'Failed to save product');
      }

      setSuccess(
        editingProduct ? 'Product updated successfully!' : 'Product created successfully!'
      );
      setShowModal(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch(`/api/products/products/${id}/`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to delete product');

      setSuccess('Product deleted successfully!');
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to delete product');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData(product);

    // Detect cron preset
    const preset = Object.keys(CRON_PRESETS).find(
      key => CRON_PRESETS[key].value === product.interest_posting_cron
    );
    setCronPreset(preset || 'custom');

    setShowModal(true);
    setStep(1);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      product_type: 'SAVINGS',
      description: '',
      is_active: true,
      branch: 1,
      interest_rate: 0,
      interest_calculation_method: 'simple',
      interest_posting_method: 'auto_journal',
      validation_scope: 'category',
      allow_overdraft: false,
      auto_debit_fees: false,
      requires_approval_above: 0,
    });
    setCronPreset('monthly');
    setStep(1);
  };

  const renderStepIndicator = () => {
    const steps = ['Basic Info', 'Configuration', 'Limits & Validation', 'Review'];

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        {steps.map((label, idx) => {
          const num = idx + 1;
          const isActive = step === num;
          const isComplete = step > num;
          const config = PRODUCT_TYPE_CONFIG[formData.product_type];

          return (
            <React.Fragment key={num}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: isComplete ? config.color : isActive ? config.color : '#e5e7eb',
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    transition: 'all 0.3s',
                    marginBottom: '8px',
                  }}
                >
                  {isComplete ? '✓' : num}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: isActive ? '#111827' : '#6b7280',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {label}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div
                  style={{
                    flex: '0 0 40px',
                    height: '2px',
                    background: step > num ? config.color : '#e5e7eb',
                    transition: 'all 0.3s',
                    marginBottom: '28px',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderStep1 = () => {
    const config = PRODUCT_TYPE_CONFIG[formData.product_type];

    return (
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
          Basic Information
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Choose product type and provide basic details
        </p>

        {/* Product Type Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{ display: 'block', fontWeight: 600, marginBottom: '12px', color: '#374151' }}
          >
            Product Type *
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
            }}
          >
            {Object.entries(PRODUCT_TYPE_CONFIG).map(([type, cfg]) => {
              const Icon = cfg.icon;
              const isSelected = formData.product_type === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, product_type: type as any })}
                  style={{
                    padding: '16px',
                    border: `2px solid ${isSelected ? cfg.color : '#e5e7eb'}`,
                    borderRadius: '8px',
                    background: isSelected ? `${cfg.color}10` : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <Icon size={32} color={cfg.color} style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                    {cfg.label}
                  </div>
                </button>
              );
            })}
          </div>
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: `${config.color}10`,
              borderRadius: '8px',
              color: '#374151',
              fontSize: '13px',
              display: 'flex',
              gap: '8px',
            }}
          >
            <Info size={16} color={config.color} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{config.description}</span>
          </div>
        </div>

        {/* Product Name */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
          >
            Product Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Premium Savings Account"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Product Code */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
          >
            Product Code *
          </label>
          <input
            type="text"
            value={formData.code}
            onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="e.g., SAV-PREMIUM"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
          >
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this product..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Active Status */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: '#374151' }}>
              Active (available for account creation)
            </span>
          </label>
        </div>

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}
        >
          <button
            type="button"
            onClick={() => {
              setShowModal(false);
              resetForm();
            }}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!formData.name || !formData.code}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: !formData.name || !formData.code ? '#9ca3af' : config.color,
              color: 'white',
              cursor: !formData.name || !formData.code ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => {
    const config = PRODUCT_TYPE_CONFIG[formData.product_type];
    const showInterest = ['SAVINGS', 'LOAN', 'INVESTMENT'].includes(formData.product_type);
    const showScheduling = formData.product_type === 'SAVINGS';
    const showLoanFields = formData.product_type === 'LOAN';
    const showFees = ['SAVINGS', 'LOAN', 'INSURANCE'].includes(formData.product_type);

    return (
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
          Product Configuration
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Configure interest rates, fees, and product-specific settings
        </p>

        {/* Interest Rate */}
        {showInterest && (
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
            >
              <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Interest Rate (% per annum)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.interest_rate || ''}
              onChange={e =>
                setFormData({ ...formData, interest_rate: parseFloat(e.target.value) || 0 })
              }
              placeholder="e.g., 5.5"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
        )}

        {/* Interest Calculation Method */}
        {showInterest && (
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
            >
              Interest Calculation Method
            </label>
            <select
              value={formData.interest_calculation_method}
              onChange={e =>
                setFormData({ ...formData, interest_calculation_method: e.target.value as any })
              }
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <option value="simple">Simple Interest</option>
              <option value="compound">Compound Interest</option>
              <option value="reducing_balance">Reducing Balance (Loans)</option>
            </select>
          </div>
        )}

        {/* Interest Posting Schedule (SAVINGS only) */}
        {showScheduling && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                <Clock size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Interest Posting Schedule
              </label>
              <select
                value={cronPreset}
                onChange={e => setCronPreset(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                {Object.entries(CRON_PRESETS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>
                    {label} - {description}
                  </option>
                ))}
                <option value="custom">Custom Cron Expression</option>
              </select>
            </div>

            {cronPreset === 'custom' && (
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Custom Cron Expression
                </label>
                <input
                  type="text"
                  value={formData.interest_posting_cron || ''}
                  onChange={e =>
                    setFormData({ ...formData, interest_posting_cron: e.target.value })
                  }
                  placeholder="e.g., 0 0 1 * * (monthly)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Format: minute hour day month weekday
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Interest Posting Method
              </label>
              <select
                value={formData.interest_posting_method}
                onChange={e =>
                  setFormData({ ...formData, interest_posting_method: e.target.value as any })
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="auto_journal">Auto-Journal (Immediate posting)</option>
                <option value="pending_approval">Pending Approval (Requires review)</option>
                <option value="accrual">Accrual (Track separately)</option>
              </select>
            </div>
          </>
        )}

        {/* Loan-specific fields */}
        {showLoanFields && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Loan Term (months)
              </label>
              <input
                type="number"
                value={formData.term_months || ''}
                onChange={e =>
                  setFormData({ ...formData, term_months: parseInt(e.target.value) || 0 })
                }
                placeholder="e.g., 12"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Repayment Frequency
              </label>
              <select
                value={formData.repayment_frequency}
                onChange={e => setFormData({ ...formData, repayment_frequency: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Processing Fee (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.processing_fee_percentage || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    processing_fee_percentage: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="e.g., 2.5"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>
          </>
        )}

        {/* Auto-debit Fees */}
        {showFees && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.auto_debit_fees}
                onChange={e => setFormData({ ...formData, auto_debit_fees: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#374151' }}>
                <DollarSign size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Auto-debit fees (generates scheduled workflow)
              </span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: config.color,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const config = PRODUCT_TYPE_CONFIG[formData.product_type];
    const showTransactionLimits = ['SAVINGS', 'LOAN', 'EXPENSE'].includes(formData.product_type);
    const showBalance = ['SAVINGS'].includes(formData.product_type);
    const showExpenseConfig = formData.product_type === 'EXPENSE';

    return (
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
          Limits & Validation
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Configure transaction limits and validation rules
        </p>

        {/* Transaction Amount Limits */}
        {showTransactionLimits && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                <Shield size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Minimum Transaction Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.min_transaction_amount || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    min_transaction_amount: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="e.g., 100"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Maximum Transaction Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.max_transaction_amount || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    max_transaction_amount: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="Leave empty for no limit"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Daily Transaction Limit
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.daily_transaction_limit || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    daily_transaction_limit: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g., 100000"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Monthly Transaction Limit
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.monthly_transaction_limit || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    monthly_transaction_limit: parseFloat(e.target.value) || undefined,
                  })
                }
                placeholder="e.g., 1000000"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>
          </>
        )}

        {/* Balance Requirements (SAVINGS) */}
        {showBalance && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Minimum Balance Requirement
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.minimum_balance || ''}
                onChange={e =>
                  setFormData({ ...formData, minimum_balance: parseFloat(e.target.value) || 0 })
                }
                placeholder="e.g., 1000"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  marginBottom: '12px',
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.allow_overdraft}
                  onChange={e => setFormData({ ...formData, allow_overdraft: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 600 }}>
                  Allow Overdraft
                </span>
              </label>

              {formData.allow_overdraft && (
                <input
                  type="number"
                  step="0.01"
                  value={formData.overdraft_limit || ''}
                  onChange={e =>
                    setFormData({ ...formData, overdraft_limit: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Overdraft limit amount"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              )}
            </div>
          </>
        )}

        {/* Expense-specific Configuration */}
        {showExpenseConfig && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Validation Scope
              </label>
              <select
                value={formData.validation_scope}
                onChange={e =>
                  setFormData({ ...formData, validation_scope: e.target.value as any })
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="category">Per Category (all expenses in this category)</option>
                <option value="account">Per Account (specific expense account)</option>
                <option value="user">Per User (user's total across all categories)</option>
              </select>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Determines how limits are applied
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#374151' }}
              >
                Require Approval Above Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.requires_approval_above || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    requires_approval_above: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="e.g., 50000 (set to 0 for always require approval)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
          <button
            type="button"
            onClick={() => setStep(2)}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setStep(4)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: config.color,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    const config = PRODUCT_TYPE_CONFIG[formData.product_type];

    return (
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
          Review & Submit
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Review your product configuration before creating
        </p>

        <div
          style={{
            background: '#f9fafb',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px' }}>
            <div style={{ fontWeight: 600, color: '#6b7280' }}>Product Type:</div>
            <div style={{ color: '#111827' }}>{config.label}</div>

            <div style={{ fontWeight: 600, color: '#6b7280' }}>Product Name:</div>
            <div style={{ color: '#111827' }}>{formData.name}</div>

            <div style={{ fontWeight: 600, color: '#6b7280' }}>Product Code:</div>
            <div style={{ color: '#111827', fontFamily: 'monospace' }}>{formData.code}</div>

            {formData.interest_rate !== undefined && formData.interest_rate > 0 && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Interest Rate:</div>
                <div style={{ color: '#111827' }}>{formData.interest_rate}% per annum</div>
              </>
            )}

            {formData.interest_posting_cron && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Posting Schedule:</div>
                <div style={{ color: '#111827', fontFamily: 'monospace' }}>
                  {CRON_PRESETS[cronPreset]?.label || formData.interest_posting_cron}
                </div>
              </>
            )}

            {formData.daily_transaction_limit && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Daily Limit:</div>
                <div style={{ color: '#111827' }}>
                  ₦{formData.daily_transaction_limit.toLocaleString()}
                </div>
              </>
            )}

            {formData.monthly_transaction_limit && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Monthly Limit:</div>
                <div style={{ color: '#111827' }}>
                  ₦{formData.monthly_transaction_limit.toLocaleString()}
                </div>
              </>
            )}

            {formData.minimum_balance && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Min Balance:</div>
                <div style={{ color: '#111827' }}>₦{formData.minimum_balance.toLocaleString()}</div>
              </>
            )}

            {formData.allow_overdraft && (
              <>
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Overdraft:</div>
                <div style={{ color: '#111827' }}>
                  Allowed (₦{formData.overdraft_limit?.toLocaleString() || 0})
                </div>
              </>
            )}

            <div style={{ fontWeight: 600, color: '#6b7280' }}>Status:</div>
            <div style={{ color: '#111827' }}>{formData.is_active ? 'Active' : 'Inactive'}</div>
          </div>
        </div>

        {/* Auto-generation Info */}
        {(formData.interest_posting_cron || formData.auto_debit_fees) && (
          <div
            style={{
              background: `${config.color}10`,
              border: `2px solid ${config.color}40`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
              <Sparkles size={24} color={config.color} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'bold', color: config.color, marginBottom: '8px' }}>
                  Automated Workflows
                </div>
                <div style={{ color: '#374151', fontSize: '14px', marginBottom: '8px' }}>
                  The following workflows will be automatically created:
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151', fontSize: '14px' }}>
                  {formData.interest_posting_cron && (
                    <li>
                      Interest posting workflow (
                      {CRON_PRESETS[cronPreset]?.label || 'custom schedule'})
                    </li>
                  )}
                  {formData.auto_debit_fees && <li>Automatic fee debit workflow</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              color: '#c00',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
          <button
            type="button"
            onClick={() => setStep(3)}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '10px 32px',
              border: 'none',
              borderRadius: '6px',
              background: loading ? '#9ca3af' : config.color,
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                {editingProduct ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <Save size={20} />
                {editingProduct ? 'Update Product' : 'Create Product'}
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  if (loading && products.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
        <div style={{ marginTop: '16px', color: '#6b7280' }}>Loading products...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                Product Management
              </h1>
              <p style={{ color: '#6b7280', marginTop: '8px' }}>
                Configure financial products with limits, interest rates, and automated workflows
              </p>
            </div>
            <button
              onClick={() => {
                setShowModal(true);
                resetForm();
                setEditingProduct(null);
              }}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
              }}
            >
              <Plus size={20} />
              Create Product
            </button>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div
              style={{
                background: '#d1fae5',
                border: '1px solid #6ee7b7',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle size={20} />
              {success}
              <button
                onClick={() => setSuccess(null)}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#065f46',
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {error && !showModal && (
            <div
              style={{
                background: '#fee',
                border: '1px solid #fcc',
                borderRadius: '8px',
                padding: '12px',
                color: '#c00',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={20} />
              {error}
              <button
                onClick={() => setError(null)}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#c00',
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Products Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '24px',
          }}
        >
          {products.map(product => {
            const config = PRODUCT_TYPE_CONFIG[product.product_type];
            const Icon = config.icon;

            return (
              <div
                key={product.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: `2px solid ${product.is_active ? config.color + '40' : '#e5e7eb'}`,
                  position: 'relative',
                }}
              >
                {/* Status Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    background: product.is_active ? `${config.color}20` : '#f3f4f6',
                    color: product.is_active ? config.color : '#6b7280',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {product.is_active ? 'Active' : 'Inactive'}
                </div>

                {/* Product Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: `${config.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={28} color={config.color} />
                  </div>
                  <div>
                    <h3
                      style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}
                    >
                      {product.name}
                    </h3>
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        fontFamily: 'monospace',
                        marginTop: '2px',
                      }}
                    >
                      {product.code}
                    </div>
                  </div>
                </div>

                {/* Product Details */}
                <div style={{ fontSize: '14px', color: '#374151', marginBottom: '16px' }}>
                  {product.description || config.description}
                </div>

                {/* Product Stats */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  {product.interest_rate && (
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}
                    >
                      <span style={{ color: '#6b7280' }}>Interest Rate:</span>
                      <span style={{ fontWeight: 600, color: config.color }}>
                        {product.interest_rate}%
                      </span>
                    </div>
                  )}
                  {product.daily_transaction_limit && (
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}
                    >
                      <span style={{ color: '#6b7280' }}>Daily Limit:</span>
                      <span style={{ fontWeight: 600 }}>
                        ₦{product.daily_transaction_limit.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {product.monthly_transaction_limit && (
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}
                    >
                      <span style={{ color: '#6b7280' }}>Monthly Limit:</span>
                      <span style={{ fontWeight: 600 }}>
                        ₦{product.monthly_transaction_limit.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {product.minimum_balance && (
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}
                    >
                      <span style={{ color: '#6b7280' }}>Min Balance:</span>
                      <span style={{ fontWeight: 600 }}>
                        ₦{product.minimum_balance.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Workflow Indicators */}
                {(product.interest_posting_cron || product.auto_debit_fees) && (
                  <div
                    style={{
                      background: `${config.color}10`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: config.color,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Sparkles size={14} />
                    <span>Automated workflows enabled</span>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {product.product_type === 'SAVINGS' && product.id && (
                    <Link
                      to={`/savings/products/${product.id}/config`}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #6366f1',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#6366f1',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      <Settings2 size={16} />
                      Configure
                    </Link>
                  )}
                  <button
                    onClick={() => handleEdit(product)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: `1px solid ${config.color}`,
                      borderRadius: '6px',
                      background: 'white',
                      color: config.color,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => product.id && handleDelete(product.id)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ef4444',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {products.length === 0 && !loading && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 24px',
              background: 'white',
              borderRadius: '12px',
              border: '2px dashed #d1d5db',
            }}
          >
            <Settings size={64} color="#9ca3af" style={{ marginBottom: '16px' }} />
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827',
                marginBottom: '8px',
              }}
            >
              No products yet
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>
              Create your first financial product to get started
            </p>
            <button
              onClick={() => {
                setShowModal(true);
                resetForm();
              }}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Plus size={20} />
              Create Your First Product
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => {
            setShowModal(false);
            resetForm();
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '32px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                marginBottom: '24px',
                color: '#111827',
              }}
            >
              {editingProduct ? 'Edit Product' : 'Create New Product'}
            </h2>

            {renderStepIndicator()}

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ProductManagementPage;
