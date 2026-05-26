import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

// Use central API client which handles auth headers and token refresh

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  parent?: number;
  category?: number;
}

interface AccountCategory {
  id: number;
  name: string;
  code_prefix: string;
  section: number;
  is_system_category?: boolean;
}

interface CascadingAccountSelectorProps {
  value: number | null;
  onChange: (accountId: number | null) => void;
  filterTypes?: string[];
  filterParentId?: number; // NEW: Filter to show only children of specific parent
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
}

/**
 * Cascading Account Selector (4-Level Hierarchy)
 *
 * Structure:
 * 1. GL Section (Assets, Liabilities, Equity, Income, Expenses)
 * 2. Category (Inventory, Savings, Loans, etc.) - OPTIONAL
 * 3. Parent Account
 * 4. Child Account
 */
export const CascadingAccountSelector: React.FC<CascadingAccountSelectorProps> = ({
  value,
  onChange,
  filterTypes,
  filterParentId, // NEW: If provided, only show children of this parent
  placeholder = 'Select account',
  required = false,
  style,
}) => {
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Account[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 3-level state (Section → Parent → Child)
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedParent, setSelectedParent] = useState<number | null>(null);
  const [selectedChild, setSelectedChild] = useState<number | null>(null);

  // GL Sections (standard - hardcoded)
  const GL_SECTIONS = [
    { id: 1, name: 'Assets', code: '1xx', range: '100-199' },
    { id: 2, name: 'Liabilities', code: '2xx', range: '200-299' },
    { id: 3, name: 'Equity', code: '3xx', range: '300-399' },
    { id: 4, name: 'Income', code: '4xx', range: '400-499' },
    { id: 5, name: 'Expenses', code: '5xx', range: '500-599' },
  ];

  // Fetch data on mount
  useEffect(() => {
    fetchAccounts().finally(() => setLoading(false));
  }, []);

  // If filterParentId is provided, auto-select that parent and show only its children
  useEffect(() => {
    if (filterParentId && allAccounts.length > 0) {
      const parentAccount = allAccounts.find(
        a => a.id === filterParentId && a.account_level === 'PARENT'
      );
      if (parentAccount) {
        // Auto-select section based on parent's code
        const codePrefix = parentAccount.code.charAt(0);
        const section = GL_SECTIONS.find(s => s.code.charAt(0) === codePrefix);
        if (section) {
          setSelectedSection(section.id);
        }
        // Auto-select the parent
        setSelectedParent(filterParentId);
      }
    }
  }, [filterParentId, allAccounts]);

  // Initialize selection if value is provided
  useEffect(() => {
    if (value && allAccounts.length > 0) {
      const account = allAccounts.find(a => a.id === value);
      if (account) {
        // Find section based on account code prefix
        const codePrefix = account.code.charAt(0);
        const section = GL_SECTIONS.find(s => s.code.charAt(0) === codePrefix);

        if (section) {
          setSelectedSection(section.id);
        }

        if (account.account_level === 'CHILD' && account.parent) {
          setSelectedParent(account.parent);
          setSelectedChild(account.id);
        } else if (account.account_level === 'PARENT') {
          setSelectedParent(account.id);
        }
      }
    }
  }, [value, allAccounts]);

  const fetchAccounts = async () => {
    try {
      const data = await api.get('/accounts/');
      let accounts = data.results || data;

      // Apply type filter if provided
      if (filterTypes && filterTypes.length > 0) {
        accounts = accounts.filter((acc: Account) => filterTypes.includes(acc.account_type));
      }

      console.log('[CascadingAccountSelector] Loaded accounts:', accounts.length);
      setAllAccounts(accounts);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await fetchAccounts();
      if (selectedSection) {
        await fetchParentAccounts();
      }
      console.log('[CascadingAccountSelector] Data refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch parent accounts from all accounts
  const fetchParentAccounts = async () => {
    if (!selectedSection) {
      setParentAccounts([]);
      return;
    }

    setLoadingParents(true);
    try {
      // Filter parent accounts from selected section
      const sectionCode = GL_SECTIONS.find(s => s.id === selectedSection)?.code.charAt(0);
      let parents = allAccounts.filter(
        (acc: Account) => acc.account_level === 'PARENT' && acc.code.startsWith(sectionCode || '')
      );

      // Apply type filter if provided
      if (filterTypes && filterTypes.length > 0) {
        parents = parents.filter(acc => filterTypes.includes(acc.account_type));
      }

      console.log('[CascadingAccountSelector] Filtered parent accounts:', parents.length);
      setParentAccounts(parents);
    } catch (err) {
      console.error('Failed to filter parent accounts:', err);
      setParentAccounts([]);
    } finally {
      setLoadingParents(false);
    }
  };

  // Trigger parent accounts fetch when section changes
  useEffect(() => {
    if (selectedSection && allAccounts.length > 0) {
      fetchParentAccounts();
    } else {
      setParentAccounts([]);
    }
  }, [selectedSection, allAccounts]);

  // Get child accounts for selected parent
  const getChildAccounts = () => {
    if (!selectedParent) return [];
    const children = allAccounts.filter(
      acc => acc.account_level === 'CHILD' && acc.parent === selectedParent
    );
    console.log(
      '[CascadingAccountSelector] Child accounts for parent',
      selectedParent,
      ':',
      children
    );
    return children;
  };

  // Handle section selection
  const handleSectionChange = (sectionId: string) => {
    const id = sectionId ? parseInt(sectionId) : null;
    setSelectedSection(id);
    setSelectedParent(null);
    setSelectedChild(null);
    onChange(null);
  };

  // Handle parent selection
  const handleParentChange = (parentId: string) => {
    const id = parentId ? parseInt(parentId) : null;
    setSelectedParent(id);
    setSelectedChild(null);

    // If parent has no children, select the parent itself
    const parent = allAccounts.find(a => a.id === id);
    if (parent) {
      const hasChildren = allAccounts.some(a => a.account_level === 'CHILD' && a.parent === id);
      if (!hasChildren) {
        onChange(id);
      } else {
        onChange(null);
      }
    } else {
      onChange(null);
    }
  };

  // Handle child selection
  const handleChildChange = (childId: string) => {
    const id = childId ? parseInt(childId) : null;
    setSelectedChild(id);
    onChange(id);
  };

  const defaultStyle: React.CSSProperties = {
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    ...style,
  };

  if (loading) {
    return (
      <div style={{ ...defaultStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="animate-spin">⏳</div> Loading accounts...
      </div>
    );
  }

  const childAccounts = getChildAccounts();
  const showParentStep = selectedSection !== null;

  // If filtering by parent, skip section/parent selection
  const isFilteredByParent = filterParentId !== undefined && filterParentId !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: refreshing ? '#f3f4f6' : 'white',
            color: '#374151',
            fontSize: '13px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '16px' }}>{refreshing ? '⏳' : '🔄'}</span>
          {refreshing ? 'Refreshing...' : 'Refresh Accounts'}
        </button>
      </div>

      {/* Only show section/parent selection if NOT filtering by parent */}
      {!isFilteredByParent && (
        <>
          {/* Step 1: Select GL Section */}
          <div>
            <label
              style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}
            >
              1. General Ledger Section {required && <span style={{ color: 'red' }}>*</span>}
            </label>
            <select
              value={selectedSection || ''}
              onChange={e => handleSectionChange(e.target.value)}
              style={defaultStyle}
              required={required}
            >
              <option value="">-- Select GL Section --</option>
              {GL_SECTIONS.map(section => (
                <option key={section.id} value={section.id}>
                  {section.code} - {section.name} ({section.range})
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Select Parent Account */}
          {selectedSection && (
            <div>
              <label
                style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}
              >
                2. Parent Account
              </label>
              <select
                value={selectedParent || ''}
                onChange={e => handleParentChange(e.target.value)}
                style={defaultStyle}
                disabled={loadingParents}
              >
                <option value="">
                  {loadingParents ? '⏳ Loading parent accounts...' : '-- Select Parent Account --'}
                </option>
                {parentAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              {!loadingParents && parentAccounts.length === 0 && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '8px',
                    fontSize: '12px',
                    color: '#dc2626',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                  }}
                >
                  ⚠️ No parent accounts found. Please create a parent account first.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Step 3: Select Child Account */}
      {selectedParent && (
        <div>
          <label
            style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}
          >
            {isFilteredByParent ? 'Select Child Account' : '3. Child Account'}{' '}
            {required && <span style={{ color: 'red' }}>*</span>}
          </label>
          <select
            value={selectedChild || ''}
            onChange={e => handleChildChange(e.target.value)}
            style={defaultStyle}
            required={required}
          >
            <option value="">-- Select Child Account --</option>
            {childAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>
          {childAccounts.length === 0 && (
            <div
              style={{
                marginTop: '6px',
                fontSize: '12px',
                color: '#6b7280',
              }}
            >
              No child accounts found. The parent account will be used.
            </div>
          )}
        </div>
      )}

      {/* Show selected account info */}
      {(selectedChild || (selectedParent && childAccounts.length === 0)) && (
        <div
          style={{
            padding: '12px',
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          ✓ Selected: {allAccounts.find(a => a.id === (selectedChild || selectedParent))?.name}
        </div>
      )}
    </div>
  );
};

export default CascadingAccountSelector;
