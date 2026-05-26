import React, { useState, useEffect } from 'react';
import { Plus, Trash2, DollarSign, Settings, Save, ArrowLeft } from 'lucide-react';
import {
  incomeFeeStructureService,
  FeeStructureSetupData,
  FeeComponent,
  Account,
} from '../services/incomeFeeStructureService';

const IncomeFeeStructureSetupPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);

  const [formData, setFormData] = useState<FeeStructureSetupData>({
    name: '',
    code: '',
    base_amount: 0,
    description: '',
    income_account: {
      create_new: true,
      name: '',
      code: '',
      parent_code: '',
      parent_name: '',
    },
    payment_terms: {
      allows_partial: true,
      minimum_percent: 50,
      requires_invoice: true,
      grace_period_days: 30,
      full_access_at_percent: 50,
    },
    fee_components: [{ name: '', amount: 0, is_mandatory: true }],
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      // Fetch all accounts for existing account selection
      const allAccountsResponse = await incomeFeeStructureService.getAccounts();
      setAccounts(allAccountsResponse.results);

      // Fetch parent accounts for parent selection
      const parentAccountsResponse = await incomeFeeStructureService.getAccounts({
        account_level: 'PARENT',
      });
      setParentAccounts(parentAccountsResponse.results);
    } catch (err: any) {
      console.error('Error fetching accounts:', err);
      setError('Failed to load accounts');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Calculate total base amount from components
      const totalAmount = formData.fee_components.reduce(
        (sum, component) => sum + component.amount,
        0
      );

      // Clean up income_account data based on create_new flag
      let cleanedIncomeAccount;
      if (formData.income_account.create_new) {
        // When creating new account, send create_new: true, name, and code
        cleanedIncomeAccount = {
          create_new: true,
          name: formData.income_account.name,
          code: formData.income_account.code,
        };
      } else {
        // When using existing account, send all account information
        const selectedAccount = accounts.find(acc => acc.id === formData.income_account.account_id);

        cleanedIncomeAccount = {
          create_new: false,
          account_id: formData.income_account.account_id,
          name: formData.income_account.name,
          code: formData.income_account.code,
          category_id: selectedAccount?.category || 0,
        };

        // Only include parent information if the account actually has a parent (i.e., it's a CHILD account)
        if (selectedAccount?.parent && selectedAccount?.account_level === 'CHILD') {
          const parentAccount = accounts.find(acc => acc.id === selectedAccount.parent);
          if (parentAccount) {
            cleanedIncomeAccount.parent_code = parentAccount.code;
            cleanedIncomeAccount.parent_name = parentAccount.name;
          }
        }
      }

      const submitData = {
        ...formData,
        base_amount: totalAmount,
        income_account: cleanedIncomeAccount,
      };

      const response = await incomeFeeStructureService.setupFeeStructure(submitData);

      setSuccess(`Fee structure "${response.fee_structure.name}" created successfully!`);

      // Reset form
      setFormData({
        name: '',
        code: '',
        base_amount: 0,
        description: '',
        income_account: {
          create_new: true,
          name: '',
          code: '',
          parent_code: '',
          parent_name: '',
        },
        payment_terms: {
          allows_partial: true,
          minimum_percent: 50,
          requires_invoice: true,
          grace_period_days: 30,
          full_access_at_percent: 50,
        },
        fee_components: [{ name: '', amount: 0, is_mandatory: true }],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create fee structure');
      console.error('Error creating fee structure:', err);
    } finally {
      setLoading(false);
    }
  };

  const addFeeComponent = () => {
    setFormData({
      ...formData,
      fee_components: [...formData.fee_components, { name: '', amount: 0, is_mandatory: true }],
    });
  };

  const removeFeeComponent = (index: number) => {
    if (formData.fee_components.length > 1) {
      const newComponents = formData.fee_components.filter((_, i) => i !== index);
      setFormData({ ...formData, fee_components: newComponents });
    }
  };

  const updateFeeComponent = (index: number, field: keyof FeeComponent, value: any) => {
    const newComponents = [...formData.fee_components];
    newComponents[index] = { ...newComponents[index], [field]: value };
    setFormData({ ...formData, fee_components: newComponents });
  };

  const handleAccountSelection = (accountId: number) => {
    const selectedAccount = accounts.find(acc => acc.id === accountId);
    if (selectedAccount) {
      setFormData({
        ...formData,
        income_account: {
          ...formData.income_account,
          account_id: accountId,
          name: selectedAccount.name,
          code: selectedAccount.code,
        },
      });
    }
  };

  const handleParentAccountSelection = (parentCode: string) => {
    const selectedParent = parentAccounts.find(acc => acc.code === parentCode);
    if (selectedParent) {
      setFormData({
        ...formData,
        income_account: {
          ...formData.income_account,
          parent_code: parentCode,
          parent_name: selectedParent.name,
        },
      });
    }
  };

  const totalAmount = formData.fee_components.reduce((sum, component) => sum + component.amount, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ArrowLeft style={{ width: '20px', height: '20px' }} />
            </button>
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <DollarSign style={{ width: '32px', height: '32px', color: '#10b981' }} />
                Setup Fee Structure
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                Create a comprehensive fee structure with automatic GL account setup
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              color: '#16a34a',
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Basic Information */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: '#111827',
                }}
              >
                Basic Information
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Fee Structure Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Grade 1 Tuition Fees"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Fee Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., G1TUT"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this fee structure..."
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
            </div>

            {/* Income Account Configuration */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: '#111827',
                }}
              >
                Income Account Configuration
              </h2>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="account_option"
                    checked={formData.income_account.create_new}
                    onChange={() =>
                      setFormData({
                        ...formData,
                        income_account: {
                          ...formData.income_account,
                          create_new: true,
                          account_id: undefined,
                        },
                      })
                    }
                  />
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Create New Account</span>
                </label>
              </div>

              {formData.income_account.create_new && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '16px',
                    marginBottom: '20px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: '6px',
                      }}
                    >
                      Account Name *
                    </label>
                    <input
                      type="text"
                      required={formData.income_account.create_new}
                      value={formData.income_account.name || ''}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          income_account: { ...formData.income_account, name: e.target.value },
                        })
                      }
                      placeholder="e.g., Grade 1 Tuition Income"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: '6px',
                      }}
                    >
                      Account Code *
                    </label>
                    <input
                      type="text"
                      required={formData.income_account.create_new}
                      value={formData.income_account.code || ''}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          income_account: { ...formData.income_account, code: e.target.value },
                        })
                      }
                      placeholder="e.g., 401-001"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="account_option"
                    checked={!formData.income_account.create_new}
                    onChange={() =>
                      setFormData({
                        ...formData,
                        income_account: { ...formData.income_account, create_new: false },
                      })
                    }
                  />
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Use Existing Account</span>
                </label>
              </div>

              {!formData.income_account.create_new && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Select Existing Account *
                  </label>
                  <select
                    required={!formData.income_account.create_new}
                    value={formData.income_account.account_id || ''}
                    onChange={e => handleAccountSelection(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'white',
                    }}
                  >
                    <option value="">Select an existing revenue account</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {/* Payment Terms */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: '#111827',
                }}
              >
                Payment Terms
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '20px',
                }}
              >
                <div>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.payment_terms.allows_partial}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          payment_terms: {
                            ...formData.payment_terms,
                            allows_partial: e.target.checked,
                          },
                        })
                      }
                    />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      Allow Partial Payments
                    </span>
                  </label>
                </div>

                <div>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.payment_terms.requires_invoice}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          payment_terms: {
                            ...formData.payment_terms,
                            requires_invoice: e.target.checked,
                          },
                        })
                      }
                    />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Requires Invoice</span>
                  </label>
                </div>

                {formData.payment_terms.allows_partial && (
                  <>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '6px',
                        }}
                      >
                        Minimum Payment Percentage
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={formData.payment_terms.minimum_percent}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              payment_terms: {
                                ...formData.payment_terms,
                                minimum_percent: parseInt(e.target.value),
                              },
                            })
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '40px' }}>
                          {formData.payment_terms.minimum_percent}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#374151',
                          marginBottom: '6px',
                        }}
                      >
                        Full Access at Percentage
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={formData.payment_terms.full_access_at_percent}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              payment_terms: {
                                ...formData.payment_terms,
                                full_access_at_percent: parseInt(e.target.value),
                              },
                            })
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '40px' }}>
                          {formData.payment_terms.full_access_at_percent}%
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Grace Period (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.payment_terms.grace_period_days}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        payment_terms: {
                          ...formData.payment_terms,
                          grace_period_days: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Fee Components */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>
                  Fee Components
                </h2>
                <button
                  type="button"
                  onClick={addFeeComponent}
                  style={{
                    padding: '8px 16px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Plus style={{ width: '16px', height: '16px' }} />
                  Add Component
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formData.fee_components.map((component, index) => (
                  <div
                    key={index}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                      background: '#f9fafb',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr auto auto',
                        gap: '12px',
                        alignItems: 'end',
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#374151',
                            marginBottom: '6px',
                          }}
                        >
                          Component Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={component.name}
                          onChange={e => updateFeeComponent(index, 'name', e.target.value)}
                          placeholder="e.g., Tuition, Books, Uniform"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            background: 'white',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#374151',
                            marginBottom: '6px',
                          }}
                        >
                          Amount *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={component.amount}
                          onChange={e =>
                            updateFeeComponent(index, 'amount', parseFloat(e.target.value) || 0)
                          }
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            background: 'white',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '10px' }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={component.is_mandatory}
                            onChange={e =>
                              updateFeeComponent(index, 'is_mandatory', e.target.checked)
                            }
                          />
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>Mandatory</span>
                        </label>
                      </div>

                      <div style={{ paddingBottom: '10px' }}>
                        {formData.fee_components.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFeeComponent(index)}
                            style={{
                              padding: '8px',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#dc2626',
                            }}
                            title="Remove Component"
                          >
                            <Trash2 style={{ width: '16px', height: '16px' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Amount Display */}
              <div
                style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#16a34a' }}>
                  Total Fee Structure Amount:
                </span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#16a34a' }}>
                  ₦
                  {totalAmount.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => window.history.back()}
                style={{
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
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
                type="submit"
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  background: loading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Save style={{ width: '16px', height: '16px' }} />
                {loading ? 'Creating...' : 'Create Fee Structure'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeFeeStructureSetupPage;
