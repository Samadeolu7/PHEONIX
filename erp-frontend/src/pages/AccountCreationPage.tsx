import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface AccountCategory {
  id: number;
  name: string;
  code_prefix: string;
  section: number;
}

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
}

interface GeneratedComponents {
  form_schema?: { id: number; name: string };
  workflow?: { id: number; name: string };
  module_page?: { id: number; url_path: string; title: string };
  report?: { id: number; name: string; code: string };
  report_page?: { id: number; url_path: string; title: string };
}

const AccountCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'basic' | 'parent' | 'review'>('basic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [accountLevel, setAccountLevel] = useState<'PARENT' | 'CHILD'>('CHILD');
  const [accountType, setAccountType] = useState('ASSET');
  const [category, setCategory] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentAccount, setParentAccount] = useState<number | null>(null);
  const [code, setCode] = useState('');

  // Data
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [createdAccount, setCreatedAccount] = useState<any>(null);
  const [generatedComponents, setGeneratedComponents] = useState<GeneratedComponents>({});

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySection, setNewCategorySection] = useState(1);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (accountLevel === 'CHILD' && accountType) {
      fetchParentAccounts();
    }
  }, [accountLevel, accountType]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/accounts/categories/');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data.results || data);
    } catch (err: unknown) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchParentAccounts = async () => {
    try {
      const response = await fetch(
        `/api/accounts/?account_level=PARENT&account_type=${accountType}`
      );
      if (!response.ok) throw new Error('Failed to fetch parent accounts');
      const data = await response.json();
      setParentAccounts(data.results || data);
    } catch (err: unknown) {
      console.error('Error fetching parent accounts:', err);
    }
  };

  const handleNext = () => {
    if (step === 'basic') {
      if (!name || !accountType || !category) {
        setError('Please fill in all required fields');
        return;
      }
      if (accountLevel === 'CHILD') {
        setStep('parent');
      } else {
        setStep('review');
      }
    } else if (step === 'parent') {
      if (!parentAccount) {
        setError('Please select a parent account');
        return;
      }
      setStep('review');
    }
    setError(null);
  };

  const handleBack = () => {
    if (step === 'review') {
      setStep(accountLevel === 'CHILD' ? 'parent' : 'basic');
    } else if (step === 'parent') {
      setStep('basic');
    }
    setError(null);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      const payload: any = {
        name,
        description,
        account_type: accountType,
        account_level: accountLevel,
        category,
      };

      if (code) {
        payload.code = code;
      }

      if (accountLevel === 'CHILD' && parentAccount) {
        payload.parent = parentAccount;
      }

      // Create account
      const response = await fetch('/api/accounts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create account');
      }

      const account = await response.json();
      setCreatedAccount(account);

      // For child accounts, fetch generated components
      if (accountLevel === 'CHILD') {
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
      const response = await fetch(`/api/accounts/${accountId}/generated-components/`);
      if (!response.ok) return;

      const data = await response.json();
      setGeneratedComponents(data);
    } catch (err: unknown) {
      console.error('Error fetching generated components:', err);
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

      const response = await fetch('/api/accounts/categories/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName,
          section: newCategorySection,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create category');
      }

      const newCategory = await response.json();

      // Add to categories list
      setCategories([...categories, newCategory]);

      // Select the new category
      setCategory(newCategory.id);

      // Close modal and reset
      setShowCategoryModal(false);
      setNewCategoryName('');
      setNewCategorySection(1);
      setCategoryError(null);
    } catch (err: any) {
      setCategoryError(err.message || 'Failed to create category');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleCreateAnother = () => {
    setStep('basic');
    setAccountLevel('CHILD');
    setAccountType('ASSET');
    setCategory(null);
    setName('');
    setDescription('');
    setParentAccount(null);
    setCode('');
    setCreatedAccount(null);
    setGeneratedComponents({});
    setSuccess(false);
    setError(null);
  };

  if (success && createdAccount) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
            <h1
              style={{
                margin: '0 0 16px 0',
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#111827',
              }}
            >
              Account Created Successfully!
            </h1>

            <div
              style={{
                background: '#f9fafb',
                borderRadius: '8px',
                padding: '20px',
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

              {accountLevel === 'CHILD' && Object.keys(generatedComponents).length > 0 && (
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
                      }}
                    >
                      🎉 Auto-Generated Components
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

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleCreateAnother}
                style={{
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Create Another Account
              </button>
              <button
                onClick={() => navigate('/accounts')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
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
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', color: '#111827' }}
          >
            Create New Account
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            {accountLevel === 'CHILD'
              ? 'Create a sub-account with automatic form, workflow, and report generation'
              : 'Create a parent account for organizing sub-accounts'}
          </p>
        </div>

        {/* Progress Steps */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: step === 'basic' ? '#3b82f6' : '#10b981',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  fontWeight: 'bold',
                }}
              >
                {step === 'basic' ? '1' : '✓'}
              </div>
              <div style={{ fontSize: '14px', color: step === 'basic' ? '#111827' : '#6b7280' }}>
                Basic Info
              </div>
            </div>

            <div
              style={{
                flex: '0 0 60px',
                height: '2px',
                background: accountLevel === 'CHILD' && step !== 'basic' ? '#10b981' : '#e5e7eb',
                margin: '0 8px 20px',
              }}
            />

            {accountLevel === 'CHILD' && (
              <>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background:
                        step === 'parent' ? '#3b82f6' : step === 'review' ? '#10b981' : '#e5e7eb',
                      color: step === 'parent' || step === 'review' ? 'white' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                      fontWeight: 'bold',
                    }}
                  >
                    {step === 'review' ? '✓' : '2'}
                  </div>
                  <div
                    style={{ fontSize: '14px', color: step === 'parent' ? '#111827' : '#6b7280' }}
                  >
                    Parent Account
                  </div>
                </div>

                <div
                  style={{
                    flex: '0 0 60px',
                    height: '2px',
                    background: step === 'review' ? '#10b981' : '#e5e7eb',
                    margin: '0 8px 20px',
                  }}
                />
              </>
            )}

            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: step === 'review' ? '#3b82f6' : '#e5e7eb',
                  color: step === 'review' ? 'white' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  fontWeight: 'bold',
                }}
              >
                {accountLevel === 'CHILD' ? '3' : '2'}
              </div>
              <div style={{ fontSize: '14px', color: step === 'review' ? '#111827' : '#6b7280' }}>
                Review
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
              color: '#991b1b',
              fontSize: '14px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Form Content */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {/* Step 1: Basic Info */}
          {step === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                  Account Level *
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setAccountLevel('PARENT')}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${accountLevel === 'PARENT' ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      background: accountLevel === 'PARENT' ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: accountLevel === 'PARENT' ? '#3b82f6' : '#111827',
                        marginBottom: '4px',
                      }}
                    >
                      📁 Parent Account
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      General ledger account for grouping sub-accounts
                    </div>
                  </button>
                  <button
                    onClick={() => setAccountLevel('CHILD')}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${accountLevel === 'CHILD' ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      background: accountLevel === 'CHILD' ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: accountLevel === 'CHILD' ? '#3b82f6' : '#111827',
                        marginBottom: '4px',
                      }}
                    >
                      📄 Child Account
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Sub-account with forms, workflows & reports
                    </div>
                  </button>
                </div>
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
                  Account Type *
                </label>
                <select
                  value={accountType}
                  onChange={e => setAccountType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="ASSET">Asset</option>
                  <option value="LIABILITY">Liability</option>
                  <option value="EQUITY">Equity</option>
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="LOAN">Loan</option>
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
                  Category *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={category || ''}
                    onChange={e => setCategory(Number(e.target.value))}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select a category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.code_prefix}xx)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowCategoryModal(true)}
                    type="button"
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      background: 'white',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + New
                  </button>
                </div>
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
                  Account Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., John Doe Savings"
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
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: '#374151',
                    fontSize: '14px',
                  }}
                >
                  Account Code (Optional)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Format: XXX for parent or XXX-XXX for child (e.g., 150-001)
                </div>
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
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
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
          )}

          {/* Step 2: Parent Selection (for child accounts) */}
          {step === 'parent' && accountLevel === 'CHILD' && (
            <div>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Select Parent Account
              </h3>
              <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
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
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                    No parent accounts found for type: {accountType}
                  </p>
                  <button
                    onClick={handleBack}
                    style={{
                      marginTop: '16px',
                      padding: '8px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Go Back
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {parentAccounts.map(account => (
                    <button
                      key={account.id}
                      onClick={() => setParentAccount(account.id)}
                      style={{
                        padding: '16px',
                        border: `2px solid ${parentAccount === account.id ? '#3b82f6' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        background: parentAccount === account.id ? '#eff6ff' : 'white',
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
                          <div
                            style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}
                          >
                            Code: {account.code}
                          </div>
                        </div>
                        {parentAccount === account.id && (
                          <div style={{ color: '#3b82f6', fontSize: '20px' }}>✓</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && (
            <div>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Review Account Details
              </h3>
              <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
                Please review the information before creating the account.
              </p>

              <div
                style={{
                  background: '#f9fafb',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr',
                  gap: '12px',
                }}
              >
                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Level:</div>
                <div style={{ color: '#111827' }}>{accountLevel}</div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Account Type:</div>
                <div style={{ color: '#111827' }}>{accountType}</div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Category:</div>
                <div style={{ color: '#111827' }}>
                  {categories.find(c => c.id === category)?.name || 'N/A'}
                </div>

                <div style={{ fontWeight: 600, color: '#6b7280' }}>Name:</div>
                <div style={{ color: '#111827' }}>{name}</div>

                {code && (
                  <>
                    <div style={{ fontWeight: 600, color: '#6b7280' }}>Code:</div>
                    <div style={{ color: '#111827', fontFamily: 'monospace' }}>{code}</div>
                  </>
                )}

                {accountLevel === 'CHILD' && parentAccount && (
                  <>
                    <div style={{ fontWeight: 600, color: '#6b7280' }}>Parent Account:</div>
                    <div style={{ color: '#111827' }}>
                      {parentAccounts.find(p => p.id === parentAccount)?.name || 'N/A'}
                    </div>
                  </>
                )}

                {description && (
                  <>
                    <div style={{ fontWeight: 600, color: '#6b7280' }}>Description:</div>
                    <div style={{ color: '#111827' }}>{description}</div>
                  </>
                )}
              </div>

              {accountLevel === 'CHILD' && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '8px' }}>
                    🎉 What will be generated:
                  </div>
                  <ul
                    style={{ margin: 0, paddingLeft: '20px', color: '#1e40af', fontSize: '14px' }}
                  >
                    <li>Transaction form for this account</li>
                    <li>Automated workflow for processing transactions</li>
                    <li>Module page for accessing the form</li>
                    <li>Comprehensive report template</li>
                    <li>Report page for viewing analytics</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <button
              onClick={handleBack}
              disabled={step === 'basic'}
              style={{
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                color: '#111827',
                cursor: step === 'basic' ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                opacity: step === 'basic' ? 0.5 : 1,
              }}
            >
              Back
            </button>

            {step === 'review' ? (
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  padding: '12px 32px',
                  border: 'none',
                  borderRadius: '8px',
                  background: loading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {loading ? (
                  <>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid white',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Creating...
                  </>
                ) : (
                  '✓ Create Account'
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                style={{
                  padding: '12px 32px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Creation Modal */}
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
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Choose the financial statement section for this category
                </div>
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
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  A descriptive name for this account category
                </div>
              </div>

              <div
                style={{
                  background: '#f9fafb',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  ℹ️ About Categories
                </div>
                Categories organize accounts within each section. The system will automatically
                assign account codes based on the section (e.g., 100-199 for Assets).
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
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid white',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
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
    </div>
  );
};

export default AccountCreationPage;
