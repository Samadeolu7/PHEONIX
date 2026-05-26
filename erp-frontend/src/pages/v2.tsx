import React, { useState } from 'react';
import { Info, Plus, Sparkles } from 'lucide-react';

// Account type configurations
const ACCOUNT_TYPE_CONFIG = {
  SAVINGS: {
    icon: '💰',
    color: '#10b981',
    label: 'Savings Account',
    category: 'LIABILITY',
    fields: ['interest_rate', 'minimum_balance', 'overdraft_limit'],
    autoGenerate: true,
  },
  LOAN: {
    icon: '💳',
    color: '#f59e0b',
    label: 'Loan Account',
    category: 'LIABILITY',
    fields: ['interest_rate', 'term_months', 'repayment_frequency'],
    autoGenerate: true,
  },
  INCOME: {
    icon: '📈',
    color: '#3b82f6',
    label: 'Income Account',
    category: 'INCOME',
    fields: ['income_category', 'is_recurring'],
    autoGenerate: true,
  },
  EXPENSE: {
    icon: '💸',
    color: '#ef4444',
    label: 'Expense Account',
    category: 'EXPENSE',
    fields: ['expense_category', 'approval_required'],
    autoGenerate: false,
  },
  ASSET: {
    icon: '🏢',
    color: '#8b5cf6',
    label: 'Asset Account',
    category: 'ASSET',
    fields: ['asset_category', 'depreciation_method'],
    autoGenerate: false,
  },
};

const UnifiedAccountCreation = () => {
  const [step, setStep] = useState(1);
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
  const [showPreview, setShowPreview] = useState(false);

  const config = accountType ? ACCOUNT_TYPE_CONFIG[accountType] : null;

  const handleTypeSelect = (type: string) => {
    setAccountType(type);
    setStep(2);
  };

  const renderStepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
      {[1, 2, 3, 4].map(num => (
        <React.Fragment key={num}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: step >= num ? '#3b82f6' : '#e5e7eb',
              color: step >= num ? 'white' : '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              transition: 'all 0.3s',
            }}
          >
            {step > num ? '✓' : num}
          </div>
          {num < 4 && (
            <div
              style={{
                flex: 1,
                height: '2px',
                background: step > num ? '#3b82f6' : '#e5e7eb',
                transition: 'all 0.3s',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

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
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        {Object.entries(ACCOUNT_TYPE_CONFIG).map(([type, cfg]) => (
          <button
            key={type}
            onClick={() => handleTypeSelect(type)}
            style={{
              padding: '24px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
              position: 'relative',
              overflow: 'hidden',
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
            Account Level
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
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>📄 Child Account</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Operational account</div>
            </button>
          </div>
        </div>

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
            placeholder={`e.g., ${accountType === 'SAVINGS' ? 'Member Savings' : accountType === 'LOAN' ? 'Personal Loans' : 'General Income'}`}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
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
          onClick={() => setStep(3)}
          disabled={!formData.name}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            background: formData.name ? config?.color : '#9ca3af',
            color: 'white',
            cursor: formData.name ? 'pointer' : 'not-allowed',
            fontWeight: '500',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    if (!config) return null;

    return (
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          {config.label} Specific Settings
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Configure settings specific to {config.label.toLowerCase()}s
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Dynamic fields based on account type */}
          {accountType === 'SAVINGS' && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Interest Rate (% per annum) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.interest_rate || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, interest_rate: e.target.value })
                  }
                  placeholder="e.g., 5.00"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Minimum Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.minimum_balance || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, minimum_balance: e.target.value })
                  }
                  placeholder="e.g., 100.00"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
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
                  <span style={{ fontWeight: '500', color: '#374151' }}>Allow Overdraft</span>
                </label>
              </div>

              {specificData.allow_overdraft && (
                <div style={{ marginLeft: '26px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: '500',
                      marginBottom: '8px',
                      color: '#374151',
                    }}
                  >
                    Overdraft Limit
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={specificData.overdraft_limit || ''}
                    onChange={e =>
                      setSpecificData({ ...specificData, overdraft_limit: e.target.value })
                    }
                    placeholder="e.g., 1000.00"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              )}
            </>
          )}

          {accountType === 'LOAN' && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Interest Rate (% per annum) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={specificData.interest_rate || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, interest_rate: e.target.value })
                  }
                  placeholder="e.g., 12.00"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Default Term (months) *
                </label>
                <input
                  type="number"
                  value={specificData.term_months || ''}
                  onChange={e => setSpecificData({ ...specificData, term_months: e.target.value })}
                  placeholder="e.g., 12"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Repayment Frequency *
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
                    fontSize: '14px',
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

          {accountType === 'INCOME' && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151',
                  }}
                >
                  Income Category
                </label>
                <select
                  value={specificData.income_category || ''}
                  onChange={e =>
                    setSpecificData({ ...specificData, income_category: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select category...</option>
                  <option value="product_sales">Product Sales</option>
                  <option value="service_fees">Service Fees</option>
                  <option value="subscriptions">Subscriptions</option>
                  <option value="other">Other Income</option>
                </select>
              </div>

              <div>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={specificData.is_recurring || false}
                    onChange={e =>
                      setSpecificData({ ...specificData, is_recurring: e.target.checked })
                    }
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '500', color: '#374151' }}>Recurring Income</span>
                </label>
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
              fontWeight: '500',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    if (!config) return null;

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
              <div style={{ fontSize: '32px' }}>{config.icon}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>
                  {formData.name}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {config.label} • {accountLevel}
                </div>
              </div>
            </div>

            {formData.description && (
              <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
                {formData.description}
              </div>
            )}
          </div>

          {/* Specific Settings */}
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '16px',
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: '12px',
            }}
          >
            {Object.entries(specificData).map(([key, value]: [string, any]) => (
              <React.Fragment key={key}>
                <div style={{ fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}:
                </div>
                <div style={{ color: '#111827' }}>
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Auto-generation info */}
        {config.autoGenerate && accountLevel === 'CHILD' && (
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
            onClick={() => setStep(3)}
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
              // Simulate API call
              console.log('Creating account:', {
                formData,
                specificData,
                accountType,
                accountLevel,
              });
              alert('Account created successfully! (Demo)');
            }}
            style={{
              padding: '12px 32px',
              border: 'none',
              borderRadius: '8px',
              background: config.color,
              color: 'white',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={20} />
            Create Account
          </button>
        </div>
      </div>
    );
  };

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
            Universal account creation for any business need
          </p>
        </div>

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
    </div>
  );
};

export default UnifiedAccountCreation;
