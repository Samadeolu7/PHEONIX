import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Loader, Wand2 } from 'lucide-react';

// Types
interface Account {
  id?: number;
  code: string;
  name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'LOAN' | 'SAVINGS';
  account_level: 'PARENT' | 'CHILD';
  parent?: number;
  balance: string;
  category?: number;
  enable_smart_forms: boolean;
}

interface ContraAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

interface ValidationError {
  field: string;
  message: string;
}

const EnhancedAccountCreation: React.FC = () => {
  const navigate = useNavigate();
  // Form State
  const [account, setAccount] = useState<Account>({
    code: '',
    name: '',
    account_type: 'ASSET',
    account_level: 'CHILD',
    balance: '0.00',
    enable_smart_forms: true,
  });

  // Contra Account Selection (for non-bank accounts)
  const [contraAccount, setContraAccount] = useState<number | null>(null);
  const [availableContraAccounts, setAvailableContraAccounts] = useState<ContraAccount[]>([]);

  // UI State
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [success, setSuccess] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<{
    workflow?: boolean;
    form?: boolean;
    page?: boolean;
  }>({});

  // Fetch available contra accounts based on account type
  useEffect(() => {
    if (account.account_type && account.account_type !== 'ASSET') {
      fetchContraAccounts();
    }
  }, [account.account_type]);

  const fetchContraAccounts = async () => {
    try {
      // Fetch bank accounts (Asset type, code starts with 101)
      const response = await fetch('/api/accounts/?account_type=ASSET&code_prefix=101');
      const data = await response.json();
      setAvailableContraAccounts(data.results || data);
    } catch (error: unknown) {
      console.error('Failed to fetch contra accounts:', error);
    }
  };

  const handleChange = (field: keyof Account, value: any) => {
    setAccount(prev => ({ ...prev, [field]: value }));
    // Clear field-specific errors
    setErrors(prev => prev.filter(e => e.field !== field));
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (!account.name.trim()) {
      newErrors.push({ field: 'name', message: 'Account name is required' });
    }

    if (!account.code.trim()) {
      newErrors.push({ field: 'code', message: 'Account code is required' });
    }

    // Validate contra account for non-bank accounts
    if (account.account_type !== 'ASSET' && !contraAccount) {
      newErrors.push({
        field: 'contra_account',
        message: 'Please select a contra account (bank)',
      });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setSuccess(false);
    setGenerationStatus({});

    try {
      // Step 1: Create the account
      const accountResponse = await fetch('/api/accounts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account),
      });

      if (!accountResponse.ok) {
        throw new Error('Failed to create account');
      }

      const createdAccount = await accountResponse.json();

      // Step 2: If smart forms enabled and contra account selected, generate workflow/form/page
      if (account.enable_smart_forms && contraAccount) {
        await generateWorkflowComponents(createdAccount, contraAccount);
      }

      setSuccess(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate(`/accounts/${createdAccount.id}`);
      }, 2000);
    } catch (error: any) {
      setErrors([{ field: 'general', message: error.message || 'Failed to create account' }]);
    } finally {
      setLoading(false);
    }
  };

  const generateWorkflowComponents = async (account: any, contraAccountId: number) => {
    try {
      // Step 1: Generate workflow, form, and page
      setGenerationStatus({ workflow: false, form: false, page: false });

      const response = await fetch('/api/accounts/generate-components/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: account.id,
          contra_account_id: contraAccountId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate workflow components');
      }

      const result = await response.json();

      // Update generation status
      setGenerationStatus({
        workflow: !!result.workflow,
        form: !!result.form,
        page: !!result.page,
      });
    } catch (error: unknown) {
      console.error('Generation error:', error);
      setErrors(prev => [
        ...prev,
        {
          field: 'generation',
          message: 'Account created but auto-generation failed',
        },
      ]);
    }
  };

  const getErrorForField = (field: string) => {
    return errors.find(e => e.field === field)?.message;
  };

  const shouldShowContraAccountSelection = () => {
    // Show for all non-bank accounts
    return account.account_type !== 'ASSET' || !account.code.startsWith('101');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => window.history.back()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            color: '#4b5563',
            cursor: 'pointer',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
          Create New Account
        </h1>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
          Create a new account with automatic workflow and form generation
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div
          style={{
            padding: '1rem',
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'start',
            gap: '0.75rem',
          }}
        >
          <CheckCircle
            size={20}
            style={{ color: '#10b981', flexShrink: 0, marginTop: '0.125rem' }}
          />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#065f46' }}>
              Account Created Successfully!
            </h3>

            {account.enable_smart_forms && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#047857' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                  Auto-generation status:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {generationStatus.workflow ? (
                      <CheckCircle size={14} style={{ color: '#10b981' }} />
                    ) : (
                      <Loader size={14} style={{ color: '#6b7280' }} />
                    )}
                    <span>Workflow template</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {generationStatus.form ? (
                      <CheckCircle size={14} style={{ color: '#10b981' }} />
                    ) : (
                      <Loader size={14} style={{ color: '#6b7280' }} />
                    )}
                    <span>Form schema</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {generationStatus.page ? (
                      <CheckCircle size={14} style={{ color: '#10b981' }} />
                    ) : (
                      <Loader size={14} style={{ color: '#6b7280' }} />
                    )}
                    <span>Module page</span>
                  </div>
                </div>
              </div>
            )}

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>
              Redirecting to account details...
            </p>
          </div>
        </div>
      )}

      {/* General Errors */}
      {errors
        .filter(e => e.field === 'general' || e.field === 'generation')
        .map((error, idx) => (
          <div
            key={idx}
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'start',
              gap: '0.75rem',
            }}
          >
            <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error.message}</span>
          </div>
        ))}

      {/* Form Content */}
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '1.5rem',
        }}
      >
        {/* Basic Information */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
            Basic Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Account Name */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Account Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={account.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g., Salaries Expense"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${getErrorForField('name') ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
              {getErrorForField('name') && (
                <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {getErrorForField('name')}
                </div>
              )}
            </div>

            {/* Account Code */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Account Code <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={account.code}
                onChange={e => handleChange('code', e.target.value)}
                placeholder="e.g., 501"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${getErrorForField('code') ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
              {getErrorForField('code') && (
                <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {getErrorForField('code')}
                </div>
              )}
            </div>

            {/* Account Type */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Account Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={account.account_type}
                onChange={e => handleChange('account_type', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="EQUITY">Equity</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="LOAN">Loan</option>
                <option value="SAVINGS">Savings</option>
              </select>
            </div>

            {/* Account Level */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Account Level
              </label>
              <select
                value={account.account_level}
                onChange={e => handleChange('account_level', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="PARENT">Parent (General Ledger)</option>
                <option value="CHILD">Child (Sub-Account)</option>
              </select>
            </div>

            {/* Initial Balance */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Initial Balance
              </label>
              <input
                type="number"
                step="0.01"
                value={account.balance}
                onChange={e => handleChange('balance', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        </div>

        {/* Contra Account Selection */}
        {shouldShowContraAccountSelection() && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '0.375rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Wand2 size={18} style={{ color: '#6366f1' }} />
              Default Contra Account
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
              Select the default bank account for transactions. This will be used to auto-generate
              forms and workflows.
            </p>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                Bank Account <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={contraAccount || ''}
                onChange={e => setContraAccount(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${getErrorForField('contra_account') ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Select bank account...</option>
                {availableContraAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              {getErrorForField('contra_account') && (
                <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {getErrorForField('contra_account')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Smart Forms Toggle */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#eff6ff',
            borderRadius: '0.375rem',
            border: '1px solid #bfdbfe',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'start',
              gap: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={account.enable_smart_forms}
              onChange={e => handleChange('enable_smart_forms', e.target.checked)}
              style={{ marginTop: '0.125rem' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e40af' }}>
                Enable Smart Forms & Workflows
              </div>
              <div style={{ fontSize: '0.875rem', color: '#1e40af', marginTop: '0.25rem' }}>
                Automatically generate transaction forms, workflows, and module pages for this
                account
              </div>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => window.history.back()}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              color: '#374151',
              fontSize: '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: loading || success ? '#9ca3af' : '#2563eb',
              color: 'white',
              fontSize: '0.875rem',
              cursor: loading || success ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {loading ? (
              <>
                <Loader size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save size={16} />
                Create Account
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedAccountCreation;
