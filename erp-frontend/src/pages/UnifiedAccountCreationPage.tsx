import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Plus, Sparkles, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api } from '../services/api';

// Account type configurations.
// Savings and Loan accounts are created through their own dedicated,
// product-linked forms (SavingsAccountFormPage / LoanAccountFormPage) — this
// generic Chart-of-Accounts wizard only handles plain GL account types.
const ACCOUNT_TYPE_CONFIG = {
  INCOME: {
    icon: '📈',
    color: '#3b82f6',
    label: 'Income Account',
    category: 'INCOME',
    glSection: 4, // Income section
    autoGenerate: true,
  },
  EXPENSE: {
    icon: '💸',
    color: '#ef4444',
    label: 'Expense Account',
    category: 'EXPENSE',
    glSection: 5, // Expenses section
    autoGenerate: false,
  },
  ASSET: {
    icon: '🏢',
    color: '#8b5cf6',
    label: 'Asset Account',
    category: 'ASSET',
    glSection: 1, // Assets section
    autoGenerate: false,
  },
  LIABILITY: {
    icon: '📋',
    color: '#ec4899',
    label: 'Liability Account',
    category: 'LIABILITY',
    glSection: 2, // Liabilities section
    autoGenerate: false,
  },
  EQUITY: {
    icon: '💎',
    color: '#06b6d4',
    label: 'Equity Account',
    category: 'EQUITY',
    glSection: 3, // Equity section
    autoGenerate: false,
  },
} as const;

type AccountType = keyof typeof ACCOUNT_TYPE_CONFIG;

interface AccountCategory {
  id: number;
  name: string;
  code_prefix: string;
  section: number;
  is_system_category?: boolean;
}

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  category: number | null;
}

interface GeneratedComponents {
  form_schema?: { id: number; name: string };
  workflow?: { id: number; name: string };
  module_page?: { id: number; url_path: string; title: string };
  report?: { id: number; name: string; code: string };
  report_page?: { id: number; url_path: string; title: string };
}

const UnifiedAccountCreationPage: React.FC = () => {
  const navigate = useNavigate();
  // Step management (v2's approach - 4 steps with clear progress)
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [accountType, setAccountType] = useState<AccountType | ''>('');
  const [accountLevel, setAccountLevel] = useState<'PARENT' | 'CHILD'>('CHILD');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent: null as number | null,
    category: null as number | null,
  });

  // Backend data (from original & v3)
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [createdAccount, setCreatedAccount] = useState<any>(null);
  const [generatedComponents, setGeneratedComponents] = useState<GeneratedComponents>({});

  // Category modal (from original)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySection, setNewCategorySection] = useState(1);

  const config = accountType ? ACCOUNT_TYPE_CONFIG[accountType] : null;

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch parent accounts when needed
  useEffect(() => {
    if (accountType && accountLevel === 'CHILD') {
      fetchParentAccounts();
    }
  }, [accountType, accountLevel]);

  const fetchCategories = async () => {
    try {
      const data = await api.get('/accounts/account-classifications/');
      setCategories(data.results || data);
    } catch (err: unknown) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchParentAccounts = async () => {
    try {
      // Fetch all accounts and filter for parents of the current account type
      const data = await api.get('/accounts/');
      const allAccounts = data.results || data;

      // Filter for parent accounts of the current type
      const parents = allAccounts.filter(
        (acc: any) => acc.account_level === 'PARENT' && acc.account_type === accountType
      );

      setParentAccounts(parents);
    } catch (err: unknown) {
      console.error('Error fetching parent accounts:', err);
      setParentAccounts([]);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryError('Category name is required');
      return;
    }

    try {
      setCategoryLoading(true);
      setCategoryError(null);

      const newCategory = await api.post('/accounts/account-classifications/', {
        name: newCategoryName.trim(),
        section: newCategorySection,
      });

      setCategories([...categories, newCategory]);
      setFormData({ ...formData, category: newCategory.id });

      setShowCategoryModal(false);
      setNewCategoryName('');
      setNewCategorySection(1);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create category';
      setCategoryError(errorMsg);
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Child accounts inherit their category from the selected parent — the
      // backend also enforces this, but deriving it here keeps the review
      // screen accurate.
      const selectedParent =
        accountLevel === 'CHILD' ? parentAccounts.find(p => p.id === formData.parent) : null;

      const payload: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        account_type: accountType,
        account_level: accountLevel,
        category: accountLevel === 'CHILD' ? (selectedParent?.category ?? null) : formData.category,
      };

      if (accountLevel === 'CHILD' && formData.parent) {
        payload.parent = formData.parent;
      }

      const account = await api.post('/accounts/', payload);
      setCreatedAccount(account);

      // For PARENT accounts, fetch generated components (forms/workflows created at parent level)
      if (accountLevel === 'PARENT') {
        await fetchGeneratedComponents(account.id);
      }

      setSuccess(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneratedComponents = async (accountId: number) => {
    try {
      // Wait a moment for signals to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const data = await api.get(`/accounts/${accountId}/generated-components/`);
      setGeneratedComponents(data);
    } catch (err: unknown) {
      console.error('Error fetching generated components:', err);
    }
  };

  const handleCreateAnother = () => {
    setStep(1);
    setAccountType('');
    setAccountLevel('CHILD');
    setFormData({ name: '', description: '', parent: null, category: null });
    setCreatedAccount(null);
    setGeneratedComponents({});
    setSuccess(false);
    setError(null);
  };

  // V2's step indicator with progress
  const renderStepIndicator = () => {
    const totalSteps = accountLevel === 'CHILD' ? 4 : 3;
    const steps =
      accountLevel === 'CHILD'
        ? ['Type', 'Basic Info', 'Parent', 'Review']
        : ['Type', 'Basic Info', 'Review'];

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        {steps.map((label, idx) => {
          const num = idx + 1;
          const isActive = step === num;
          const isComplete = step > num;

          return (
            <React.Fragment key={num}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: isComplete
                      ? '#10b981'
                      : isActive
                        ? config?.color || '#3b82f6'
                        : '#e5e7eb',
                    color: isComplete || isActive ? 'white' : '#9ca3af',
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
                    background: step > num ? config?.color || '#3b82f6' : '#e5e7eb',
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

  // Step 1: Type Selection (v2 style with v3's config)
  const renderStep1 = () => (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Select Account Type
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Choose the type of account you want to create
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        {Object.entries(ACCOUNT_TYPE_CONFIG).map(([type, cfg]) => (
          <button
            key={type}
            onClick={() => {
              setAccountType(type as any);
              setStep(2);
            }}
            style={{
              padding: '24px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              position: 'relative',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = cfg.color;
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 8px 16px ${cfg.color}20`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {cfg.autoGenerate && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: `${cfg.color}15`,
                  color: cfg.color,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Sparkles size={12} /> AUTO
              </div>
            )}

            <div style={{ fontSize: '32px', marginBottom: '12px' }}>{cfg.icon}</div>
            <div
              style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}
            >
              {cfg.label}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{cfg.category}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // Step 2: Basic Info (combines best of all versions)
  const renderStep2 = () => (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Basic Account Information
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Creating:{' '}
        <span style={{ color: config?.color, fontWeight: 'bold' }}>
          {config?.icon} {config?.label}
        </span>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Account Level */}
        <div>
          <label
            style={{ display: 'block', fontWeight: '500', marginBottom: '8px', color: '#374151' }}
          >
            Account Level *
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setAccountLevel('PARENT')}
              style={{
                flex: 1,
                padding: '16px',
                border: `2px solid ${accountLevel === 'PARENT' ? config?.color : '#e5e7eb'}`,
                borderRadius: '8px',
                background: accountLevel === 'PARENT' ? `${config?.color}10` : 'white',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>📁 Parent Account</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>General ledger grouping</div>
            </button>
            <button
              onClick={() => setAccountLevel('CHILD')}
              style={{
                flex: 1,
                padding: '16px',
                border: `2px solid ${accountLevel === 'CHILD' ? config?.color : '#e5e7eb'}`,
                borderRadius: '8px',
                background: accountLevel === 'CHILD' ? `${config?.color}10` : 'white',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>📄 Child Account</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Operational account with auto-generation
              </div>
            </button>
          </div>
        </div>

        {/* Category Selector - PARENT accounts only; child accounts inherit
            their category from the parent selected in the next step. */}
        {config && accountLevel === 'PARENT' && (
          <div>
            <label
              style={{ display: 'block', fontWeight: '500', marginBottom: '8px', color: '#374151' }}
            >
              Category (Optional)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={formData.category || ''}
                onChange={e => setFormData({ ...formData, category: Number(e.target.value) })}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select a category (or skip for direct GL link)</option>
                {categories
                  .filter(cat => cat.section === config.glSection)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.code_prefix} - {cat.name}
                      {cat.is_system_category && ' 🔒'}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => {
                  setNewCategorySection(config.glSection);
                  setShowCategoryModal(true);
                }}
                type="button"
                style={{
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: config?.color || '#3b82f6',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                + New
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Choose a category for organization, or skip to link directly to General Ledger
            </div>
          </div>
        )}
        {config && accountLevel === 'CHILD' && (
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Category is inherited from the parent account you'll select next.
          </div>
        )}

        {/* Account Name */}
        <div>
          <label
            style={{ display: 'block', fontWeight: '500', marginBottom: '8px', color: '#374151' }}
          >
            Account Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            maxLength={100}
            placeholder={`e.g., ${accountType === 'EXPENSE' ? 'Office Supplies' : accountType === 'ASSET' ? 'Prepaid Rent' : 'General Income'}`}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', textAlign: 'right' }}>
            {formData.name.length}/100
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            style={{ display: 'block', fontWeight: '500', marginBottom: '8px', color: '#374151' }}
          >
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional description..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical',
            }}
          />
        </div>

      </div>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(1)}
          style={{
            padding: '12px 24px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          onClick={() => {
            if (!formData.name.trim()) {
              setError('Please fill in all required fields');
              return;
            }
            setError(null);
            if (accountLevel === 'CHILD') {
              setStep(3);
            } else {
              setStep(accountLevel === 'CHILD' ? 4 : 3);
            }
          }}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            background: formData.name.trim() ? config?.color : '#9ca3af',
            color: 'white',
            cursor: formData.name.trim() ? 'pointer' : 'not-allowed',
            fontWeight: '500',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );

  // Step 3: Parent Selection (for child accounts only)
  const renderStep3 = () => {
    if (accountLevel === 'PARENT') {
      return renderStep4(); // Skip to review for parent accounts
    }

    return (
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          Select Parent Account
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Child accounts must be linked to a parent account of the same type.
        </p>

        {parentAccounts.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📁</div>
            <p style={{ margin: '0 0 12px 0', color: '#6b7280', fontSize: '14px' }}>
              No parent accounts found for type: {accountType}
            </p>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '12px' }}>
              You need to create a parent account first before creating child accounts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {parentAccounts.map(account => (
              <button
                key={account.id}
                onClick={() => setFormData({ ...formData, parent: account.id })}
                style={{
                  padding: '16px',
                  border: `2px solid ${formData.parent === account.id ? config?.color : '#e5e7eb'}`,
                  borderRadius: '8px',
                  background: formData.parent === account.id ? `${config?.color}10` : 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                      {account.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                      Code: {account.code}
                    </div>
                  </div>
                  {formData.parent === account.id && (
                    <div style={{ color: config?.color, fontSize: '20px' }}>✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => setStep(2)}
            style={{
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={() => {
              if (!formData.parent) {
                setError('Please select a parent account');
                return;
              }
              setError(null);
              setStep(4);
            }}
            disabled={parentAccounts.length === 0 || !formData.parent}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background:
                parentAccounts.length === 0 || !formData.parent ? '#9ca3af' : config?.color,
              color: 'white',
              cursor: parentAccounts.length === 0 || !formData.parent ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  // Step 4: Review & Create (comprehensive from all versions)
  const renderStep4 = () => {
    return (
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          Review & Create
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Review your account configuration before creating
        </p>

        <div
          style={{
            background: '#f9fafb',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          {/* Account Summary */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}
            >
              <div style={{ fontSize: '32px' }}>{config?.icon}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>
                  {formData.name}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {config?.label} • {accountLevel}
                </div>
              </div>
            </div>

            {formData.description && (
              <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
                {formData.description}
              </div>
            )}
          </div>

          {/* Details */}
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '16px',
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: '12px',
            }}
          >
            <div style={{ fontWeight: '600', color: '#6b7280' }}>Account Type:</div>
            <div style={{ color: '#111827' }}>{accountType}</div>

            <div style={{ fontWeight: '600', color: '#6b7280' }}>Account Level:</div>
            <div style={{ color: '#111827' }}>{accountLevel}</div>

            <div style={{ fontWeight: '600', color: '#6b7280' }}>Category:</div>
            <div style={{ color: '#111827' }}>
              {categories.find(c => c.id === formData.category)?.name || 'N/A'}
            </div>

            {accountLevel === 'CHILD' && formData.parent && (
              <>
                <div style={{ fontWeight: '600', color: '#6b7280' }}>Parent Account:</div>
                <div style={{ color: '#111827' }}>
                  {parentAccounts.find(p => p.id === formData.parent)?.name || 'N/A'}
                </div>
              </>
            )}

            <div style={{ fontWeight: '600', color: '#6b7280' }}>Account Code:</div>
            <div style={{ color: '#111827', fontFamily: 'monospace' }}>Auto-generated on creation</div>
          </div>
        </div>

        {/* Auto-generation info (from all versions) */}
        {config?.autoGenerate && accountLevel === 'CHILD' && (
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
              <Sparkles
                size={24}
                color={config.color}
                style={{ flexShrink: 0, marginTop: '2px' }}
              />
              <div>
                <div
                  style={{
                    fontWeight: 'bold',
                    color: config.color,
                    marginBottom: '8px',
                    fontSize: '16px',
                  }}
                >
                  Auto-Generated Components
                </div>
                <div style={{ color: '#374151', fontSize: '14px', marginBottom: '12px' }}>
                  The following will be automatically created for this account:
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151', fontSize: '14px' }}>
                  <li>Transaction form with smart field validation</li>
                  <li>Automated workflow for processing transactions</li>
                  <li>Module page for easy access</li>
                  <li>Comprehensive report template</li>
                  <li>Report visualization page</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => setStep(accountLevel === 'CHILD' ? 3 : 2)}
            style={{
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '12px 32px',
              border: 'none',
              borderRadius: '8px',
              background: loading ? '#9ca3af' : config?.color,
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                Creating...
              </>
            ) : (
              <>
                <Plus size={20} />
                Create Account
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Success view (comprehensive from original)
  if (success && createdAccount) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '40px 24px',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '40px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              textAlign: 'center',
            }}
          >
            <CheckCircle size={64} color="#10b981" style={{ marginBottom: '20px' }} />
            <h1
              style={{
                margin: '0 0 16px 0',
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#111827',
              }}
            >
              Account Created Successfully!
            </h1>

            <div
              style={{
                background: '#f9fafb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Code:</div>
                <div style={{ color: '#111827', fontFamily: 'monospace' }}>
                  {createdAccount.code}
                </div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Name:</div>
                <div style={{ color: '#111827' }}>{createdAccount.name}</div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Type:</div>
                <div style={{ color: '#111827' }}>{createdAccount.account_type}</div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Level:</div>
                <div style={{ color: '#111827' }}>{createdAccount.account_level}</div>
              </div>

              {accountLevel === 'PARENT' && Object.keys(generatedComponents).length > 0 && (
                <>
                  <div
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      paddingTop: '16px',
                      marginTop: '16px',
                    }}
                  >
                    <h3
                      style={{
                        margin: '0 0 12px 0',
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#111827',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Sparkles size={20} color={config?.color} />
                      Auto-Generated Components
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {generatedComponents.form_schema && (
                        <div
                          style={{
                            padding: '12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#3b82f6',
                              fontSize: '14px',
                              marginBottom: '4px',
                            }}
                          >
                            📋 Form Schema
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {generatedComponents.form_schema.name}
                          </div>
                        </div>
                      )}

                      {generatedComponents.workflow && (
                        <div
                          style={{
                            padding: '12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#10b981',
                              fontSize: '14px',
                              marginBottom: '4px',
                            }}
                          >
                            ⚡ Workflow Template
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {generatedComponents.workflow.name}
                          </div>
                        </div>
                      )}

                      {generatedComponents.module_page && (
                        <div
                          style={{
                            padding: '12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#f59e0b',
                              fontSize: '14px',
                              marginBottom: '4px',
                            }}
                          >
                            📄 Transaction Form Page
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {generatedComponents.module_page.title}
                          </div>
                          <a
                            href={generatedComponents.module_page.url_path}
                            style={{
                              fontSize: '12px',
                              color: '#3b82f6',
                              textDecoration: 'none',
                              marginTop: '4px',
                              display: 'inline-block',
                            }}
                          >
                            Open Form →
                          </a>
                        </div>
                      )}

                      {generatedComponents.report && (
                        <div
                          style={{
                            padding: '12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#8b5cf6',
                              fontSize: '14px',
                              marginBottom: '4px',
                            }}
                          >
                            📊 Report Template
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {generatedComponents.report.name}
                          </div>
                        </div>
                      )}

                      {generatedComponents.report_page && (
                        <div
                          style={{
                            padding: '12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#ec4899',
                              fontSize: '14px',
                              marginBottom: '4px',
                            }}
                          >
                            📈 Report Page
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {generatedComponents.report_page.title}
                          </div>
                          <a
                            href={generatedComponents.report_page.url_path}
                            style={{
                              fontSize: '12px',
                              color: '#3b82f6',
                              textDecoration: 'none',
                              marginTop: '4px',
                              display: 'inline-block',
                            }}
                          >
                            View Report →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {accountLevel === 'CHILD' && generatedComponents.form_schema && (
              <div
                style={{
                  background: '#eff6ff',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                  border: '1px solid #bfdbfe',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: '#1e40af',
                    marginBottom: '12px',
                    fontSize: '14px',
                  }}
                >
                  🔍 Review & Customize Generated Components
                </div>
                <div style={{ fontSize: '13px', color: '#1e40af', marginBottom: '16px' }}>
                  The system has auto-generated a form, workflow, and report. Please review and
                  customize them to ensure they meet your requirements (e.g., verify transaction
                  entries have proper debit/credit legs).
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {generatedComponents.form_schema && (
                    <button
                      onClick={() =>
                        navigate(`/admin/forms?edit=${generatedComponents.form_schema!.id}`)
                      }
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      📋 Review Form
                    </button>
                  )}
                  {generatedComponents.workflow && (
                    <button
                      onClick={() =>
                        navigate(`/admin/workflows/${generatedComponents.workflow!.id}`)
                      }
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#10b981',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      ⚡ Review Workflow
                    </button>
                  )}
                  {generatedComponents.report && (
                    <button
                      onClick={() => navigate(`/reports/${generatedComponents.report!.id}/edit`)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #8b5cf6',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#8b5cf6',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      📊 Review Report
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleCreateAnother}
                style={{
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                Create Another
              </button>
              <button
                onClick={() => navigate('/accounts')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: config?.color || '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                View All Accounts
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '40px',
            color: 'white',
          }}
        >
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 'bold',
              margin: '0 0 12px 0',
            }}
          >
            Create Account
          </h1>
          <p
            style={{
              fontSize: '16px',
              opacity: 0.9,
              margin: 0,
            }}
          >
            {accountLevel === 'PARENT'
              ? 'Create parent account with automatic form, workflow, and report generation'
              : 'Create child account under selected parent'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              color: '#991b1b',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Main Card */}
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            minHeight: '500px',
          }}
        >
          {renderStepIndicator()}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Help Section */}
        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
          }}
        >
          <button
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '12px 24px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Info size={16} />
            Need help? View documentation
          </button>
        </div>
      </div>

      {/* Category Creation Modal (from original) */}
      {showCategoryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
                Create Account Category
              </h2>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryName('');
                  setNewCategorySection(1);
                  setCategoryError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            {categoryError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '16px',
                  color: '#991b1b',
                  fontSize: '14px',
                }}
              >
                {categoryError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: '#374151',
                    fontSize: '14px',
                  }}
                >
                  Section *
                </label>
                <select
                  value={newCategorySection}
                  onChange={e => setNewCategorySection(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value={1}>1 - Assets (100–199)</option>
                  <option value={2}>2 - Liabilities (200–299)</option>
                  <option value={3}>3 - Equity (300–399)</option>
                  <option value={4}>4 - Income/Income (400–499)</option>
                  <option value={5}>5 - Expenses (500–599)</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: '#374151',
                    fontSize: '14px',
                  }}
                >
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g., Current Assets, Fixed Assets"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                  onKeyPress={e => {
                    if (e.key === 'Enter') {
                      handleCreateCategory();
                    }
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '24px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryName('');
                  setNewCategorySection(1);
                  setCategoryError(null);
                }}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={categoryLoading || !newCategoryName.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: categoryLoading || !newCategoryName.trim() ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  cursor: categoryLoading || !newCategoryName.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {categoryLoading ? (
                  <>
                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Creating...
                  </>
                ) : (
                  'Create Category'
                )}
              </button>
            </div>
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

export default UnifiedAccountCreationPage;
