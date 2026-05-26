import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, AlertCircle, CheckCircle, Loader } from 'lucide-react';

const ACCOUNT_TYPE_CONFIG = {
  SAVINGS: {
    icon: '💰',
    color: '#10b981',
    label: 'Savings Account',
    fields: ['interest_rate', 'minimum_balance', 'overdraft_limit'],
    autoGenerate: true,
  },
  LOAN: {
    icon: '💳',
    color: '#f59e0b',
    label: 'Loan Account',
    fields: ['interest_rate', 'term_months', 'repayment_frequency'],
    autoGenerate: true,
  },
  INCOME: {
    icon: '📈',
    color: '#3b82f6',
    label: 'Income Account',
    fields: ['income_category'],
    autoGenerate: true,
  },
  EXPENSE: {
    icon: '💸',
    color: '#ef4444',
    label: 'Expense Account',
    fields: ['expense_category'],
    autoGenerate: false,
  },
  ASSET: {
    icon: '🏢',
    color: '#8b5cf6',
    label: 'Asset Account',
    fields: [],
    autoGenerate: false,
  },
  LIABILITY: {
    icon: '📋',
    color: '#ec4899',
    label: 'Liability Account',
    fields: [],
    autoGenerate: false,
  },
};

const CompleteAccountCreation = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [accountType, setAccountType] = useState('');
  const [accountLevel, setAccountLevel] = useState('CHILD');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    parent: null,
    category: null,
  });
  const [specificData, setSpecificData] = useState({});

  // Data from backend
  const [categories, setCategories] = useState([]);
  const [parentAccounts, setParentAccounts] = useState([]);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [generatedComponents, setGeneratedComponents] = useState(null);

  const config = accountType ? ACCOUNT_TYPE_CONFIG[accountType] : null;

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch parent accounts when type changes
  useEffect(() => {
    if (accountType && accountLevel === 'CHILD') {
      fetchParentAccounts(accountType);
    }
  }, [accountType, accountLevel]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/accounts/categories/');
      const data = await response.json();
      setCategories(data.results || data);
    } catch (err: unknown) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchParentAccounts = async (type: string) => {
    try {
      const response = await fetch(`/api/accounts/parent-accounts/?account_type=${type}`);
      const data = await response.json();
      setParentAccounts(data);
    } catch (err: unknown) {
      console.error('Error fetching parent accounts:', err);
      setParentAccounts([]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    const payload = {
      account_level: accountLevel,
      account_type: accountType,
      base_data: {
        name: formData.name,
        description: formData.description,
        code: formData.code || undefined,
        category_id: formData.category,
        parent_id: accountLevel === 'CHILD' ? formData.parent : undefined,
      },
      specific_data: specificData,
    };

    try {
      const response = await fetch('/api/accounts/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create account');
      }

      const result = await response.json();
      setCreatedAccount(result.account);
      setGeneratedComponents(result.generated_components);
      setSuccess(true);
    } catch (err: any) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderSuccess = () => (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <CheckCircle size={64} color="#10b981" style={{ marginBottom: '20px' }} />
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
        Account Created Successfully!
      </h2>

      <div
        style={{
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px' }}>
          <div style={{ fontWeight: '600', color: '#6b7280' }}>Account Code:</div>
          <div style={{ fontFamily: 'monospace', color: '#111827' }}>{createdAccount.code}</div>

          <div style={{ fontWeight: '600', color: '#6b7280' }}>Account Name:</div>
          <div style={{ color: '#111827' }}>{createdAccount.name}</div>

          <div style={{ fontWeight: '600', color: '#6b7280' }}>Type:</div>
          <div style={{ color: '#111827' }}>{createdAccount.account_type}</div>
        </div>

        {generatedComponents && Object.keys(generatedComponents).length > 0 && (
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              marginTop: '20px',
              paddingTop: '20px',
            }}
          >
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={20} color={config.color} />
              Auto-Generated Components
            </div>

            {generatedComponents.form_schema && (
              <div style={{ padding: '8px 0', color: '#374151' }}>
                ✓ Transaction Form: {generatedComponents.form_schema.name}
              </div>
            )}

            {generatedComponents.workflow && (
              <div style={{ padding: '8px 0', color: '#374151' }}>
                ✓ Workflow: {generatedComponents.workflow.name}
              </div>
            )}

            {generatedComponents.module_page && (
              <div style={{ padding: '8px 0' }}>
                ✓ Module Page:{' '}
                <a href={generatedComponents.module_page.url_path} style={{ color: '#3b82f6' }}>
                  {generatedComponents.module_page.title}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={() => {
            setSuccess(false);
            setStep(1);
            setAccountType('');
            setFormData({ name: '', code: '', description: '', parent: null, category: null });
            setSpecificData({});
            setCreatedAccount(null);
            setGeneratedComponents(null);
          }}
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
            background: config.color,
            color: 'white',
            cursor: 'pointer',
          }}
        >
          View All Accounts
        </button>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
        Select Account Type
      </h2>

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
              setAccountType(type);
              setStep(2);
            }}
            style={{
              padding: '20px',
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
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.transform = 'translateY(0)';
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
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}
              >
                AUTO
              </div>
            )}
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{cfg.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: '600' }}>{cfg.label}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Basic Information
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        {config.icon} {config.label}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Account Level */}
        <div>
          <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
            Account Level *
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setAccountLevel('PARENT')}
              style={{
                flex: 1,
                padding: '16px',
                border: `2px solid ${accountLevel === 'PARENT' ? config.color : '#e5e7eb'}`,
                borderRadius: '8px',
                background: accountLevel === 'PARENT' ? `${config.color}10` : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: '600' }}>📁 Parent</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>GL grouping</div>
            </button>
            <button
              onClick={() => setAccountLevel('CHILD')}
              style={{
                flex: 1,
                padding: '16px',
                border: `2px solid ${accountLevel === 'CHILD' ? config.color : '#e5e7eb'}`,
                borderRadius: '8px',
                background: accountLevel === 'CHILD' ? `${config.color}10` : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: '600' }}>📄 Child</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Operational</div>
            </button>
          </div>
        </div>

        {/* Category */}
        <div>
          <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
            Category *
          </label>
          <select
            value={formData.category ? Number(formData.category) : ''}
            onChange={e => setFormData({ ...formData, category: Number(e.target.value) })}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
            }}
          >
            <option value="">Select category...</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Parent Account (for CHILD) */}
        {accountLevel === 'CHILD' && (
          <div>
            <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
              Parent Account *
            </label>
            <select
              value={formData.parent ? Number(formData.parent) : ''}
              onChange={e => setFormData({ ...formData, parent: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
              }}
            >
              <option value="">Select parent...</option>
              {parentAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Name */}
        <div>
          <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
            Account Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
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
          onClick={() => setStep(3)}
          disabled={
            !formData.name || !formData.category || (accountLevel === 'CHILD' && !formData.parent)
          }
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            background:
              formData.name && formData.category && (accountLevel === 'PARENT' || formData.parent)
                ? config.color
                : '#9ca3af',
            color: 'white',
            cursor: formData.name && formData.category ? 'pointer' : 'not-allowed',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    if (accountLevel === 'PARENT' || !config.fields.length) {
      // Skip to review
      return renderStep4();
    }

    return (
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
          {config.label} Settings
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {accountType === 'SAVINGS' && (
            <>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Interest Rate (% per annum)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.interest_rate || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, interest_rate: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Minimum Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.minimum_balance || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, minimum_balance: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={specificData.allow_overdraft || false}
                    onChange={e =>
                      setSpecificData({ ...specificData, allow_overdraft: e.target.checked })
                    }
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>Allow Overdraft</span>
                </label>
              </div>

              {specificData.allow_overdraft && (
                <div style={{ marginLeft: '26px' }}>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                    Overdraft Limit
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={specificData.overdraft_limit || ''}
                    onChange={e =>
                      setSpecificData({ ...specificData, overdraft_limit: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              )}
            </>
          )}

          {accountType === 'LOAN' && (
            <>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Interest Rate (% per annum)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.interest_rate || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, interest_rate: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Default Term (months)
                </label>
                <input
                  type="number"
                  value={specificData.term_months || ''}
                  onChange={e => setSpecificData({ ...specificData, term_months: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Repayment Frequency
                </label>
                <select
                  value={specificData.repayment_frequency || 'monthly'}
                  onChange={e =>
                    setSpecificData({ ...specificData, repayment_frequency: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </>
          )}
        </div>

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
            onClick={() => setStep(4)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: config.color,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
        Review & Create
      </h2>

      <div
        style={{
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px' }}>
          <div style={{ fontWeight: '600', color: '#6b7280' }}>Type:</div>
          <div>{config.label}</div>

          <div style={{ fontWeight: '600', color: '#6b7280' }}>Level:</div>
          <div>{accountLevel}</div>

          <div style={{ fontWeight: '600', color: '#6b7280' }}>Name:</div>
          <div>{formData.name}</div>

          {Object.entries(specificData).map(([key, value]: [string, any]) => (
            <React.Fragment key={key}>
              <div style={{ fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}:
              </div>
              <div>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '24px',
            color: '#991b1b',
            display: 'flex',
            gap: '8px',
            alignItems: 'start',
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(accountLevel === 'PARENT' || !config.fields.length ? 2 : 3)}
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
            background: loading ? '#9ca3af' : config.color,
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {loading ? (
            <>
              <Loader size={20} className="spin" />
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

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '40px 24px' }}>
        <div
          style={{
            maxWidth: '800px',
            margin: '0 auto',
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
          }}
        >
          {renderSuccess()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '40px 24px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default CompleteAccountCreation;
