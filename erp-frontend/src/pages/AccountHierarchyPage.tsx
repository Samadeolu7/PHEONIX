import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  balance: string;
  parent?: number;
  parent_name?: string;
  children?: Account[];
}

interface AccountTypeGroup {
  type: string;
  label: string;
  description: string;
  normalSide: 'Dr' | 'Cr';
  ifrsSectionCode: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  headerClass: string;
  accounts: Account[];
}

const ACCOUNT_GROUPS: Omit<AccountTypeGroup, 'accounts'>[] = [
  {
    type: 'ASSET',
    label: 'Assets',
    ifrsSectionCode: '10001999',
    description: 'Resources owned or controlled by the entity',
    normalSide: 'Dr',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    headerClass: 'bg-emerald-50 border-b-2 border-emerald-300',
  },
  {
    type: 'LIABILITY',
    label: 'Liabilities',
    ifrsSectionCode: '20002999',
    description: 'Present obligations of the entity to transfer economic resources',
    normalSide: 'Cr',
    colorClass: 'text-orange-700',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    headerClass: 'bg-orange-50 border-b-2 border-orange-300',
  },
  {
    type: 'EQUITY',
    label: 'Equity',
    ifrsSectionCode: '3000–3999',
    description: "Residual interest in the entity's assets after deducting all liabilities",
    normalSide: 'Cr',
    colorClass: 'text-purple-700',
    bgClass: 'bg-purple-50',
    borderClass: 'border-purple-200',
    headerClass: 'bg-purple-50 border-b-2 border-purple-300',
  },
  {
    type: 'INCOME',
    label: 'Revenue / Income',
    ifrsSectionCode: '40004999',
    description: 'Increases in assets or decreases in liabilities from ordinary activities',
    normalSide: 'Cr',
    colorClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    headerClass: 'bg-blue-50 border-b-2 border-blue-300',
  },
  {
    type: 'EXPENSE',
    label: 'Expenses',
    ifrsSectionCode: '50005999',
    description: 'Decreases in assets or increases in liabilities from ordinary activities',
    normalSide: 'Dr',
    colorClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    headerClass: 'bg-red-50 border-b-2 border-red-300',
  },
  {
    type: 'SAVINGS',
    label: 'Savings Accounts',
    ifrsSectionCode: '60006499',
    description: 'Customer savings and deposit accounts',
    normalSide: 'Cr',
    colorClass: 'text-cyan-700',
    bgClass: 'bg-cyan-50',
    borderClass: 'border-cyan-200',
    headerClass: 'bg-cyan-50 border-b-2 border-cyan-300',
  },
  {
    type: 'LOAN',
    label: 'Loan Accounts',
    ifrsSectionCode: '65006999',
    description: 'Loan disbursement and repayment accounts',
    normalSide: 'Dr',
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200',
    headerClass: 'bg-rose-50 border-b-2 border-rose-300',
  },
];

const LEVEL_INDENT = ['pl-4', 'pl-11', 'pl-[72px]', 'pl-[100px]', 'pl-[128px]'] as const;

const AccountHierarchyPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get('/accounts/');
      const accountsList = Array.isArray(data) ? data : data.results || [];
      const accountsWithChildren = buildHierarchy(accountsList);
      setAccounts(accountsWithChildren);
      const parentIds = accountsList
        .filter((acc: Account) => acc.account_level === 'PARENT')
        .map((acc: Account) => acc.id);
      setExpandedNodes(new Set(parentIds));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (accountsList: Account[]): Account[] => {
    const accountMap = new Map<number, Account>();
    accountsList.forEach((account: Account) => {
      accountMap.set(account.id, { ...account, children: [] });
    });
    const rootAccounts: Account[] = [];
    accountMap.forEach(account => {
      if (account.parent && accountMap.has(account.parent)) {
        const parent = accountMap.get(account.parent);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(account);
        }
      } else {
        rootAccounts.push(account);
      }
    });
    const sortByCode = (a: Account, b: Account) => a.code.localeCompare(b.code);
    rootAccounts.sort(sortByCode);
    rootAccounts.forEach(account => {
      if (account.children) account.children.sort(sortByCode);
    });
    return rootAccounts;
  };

  const groupAccountsByType = (): AccountTypeGroup[] => {
    const filtered = searchQuery.trim()
      ? accounts.filter(
          acc =>
            acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            acc.code.includes(searchQuery)
        )
      : accounts;

    return ACCOUNT_GROUPS.map(group => ({
      ...group,
      accounts: filtered.filter(acc => acc.account_type === group.type),
    })).filter(g => g.accounts.length > 0);
  };

  const toggleNode = (accountId: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<number>();
    const collectIds = (accts: Account[]) => {
      accts.forEach(acc => {
        if (acc.children && acc.children.length > 0) {
          allIds.add(acc.id);
          collectIds(acc.children);
        }
      });
    };
    collectIds(accounts);
    setExpandedNodes(allIds);
    setExpandedTypes(
      new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'SAVINGS', 'LOAN'])
    );
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
    setExpandedTypes(new Set());
  };

  const renderAccount = (
    account: Account,
    level: number = 0,
    colorClass: string = 'text-gray-700'
  ) => {
    const isExpanded = expandedNodes.has(account.id);
    const hasChildren = account.children && account.children.length > 0;
    const isParent = account.account_level === 'PARENT';
    const group = ACCOUNT_GROUPS.find(g => g.type === account.account_type);
    const normalSide = group?.normalSide ?? 'Dr';

    return (
      <div key={account.id}>
        <div
          tabIndex={hasChildren ? 0 : undefined}
          className={[
            'flex items-center border-b border-gray-100 transition-colors group',
            LEVEL_INDENT[Math.min(level, 4)],
            'pr-4 py-2.5',
            hasChildren ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default',
            isParent ? 'bg-gray-50/60' : 'bg-white',
          ].join(' ')}
          onClick={() => hasChildren && toggleNode(account.id)}
          onKeyDown={e => {
            if (hasChildren && (e.key === 'Enter' || e.key === ' ')) toggleNode(account.id);
          }}
        >
          <div className="w-6 flex-shrink-0 mr-2 text-gray-400">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 ml-1" />
            )}
          </div>

          <div className={`w-28 flex-shrink-0 font-mono text-sm font-semibold ${colorClass} mr-4`}>
            {account.code}
          </div>

          <div
            className={`flex-1 text-sm ${isParent ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
          >
            {account.name}
          </div>

          <div className="hidden md:block w-24 text-center flex-shrink-0 mr-4">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isParent ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}
            >
              {isParent ? 'Control' : 'Detail'}
            </span>
          </div>

          <div className="w-20 flex-shrink-0 text-right mr-4">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide ${normalSide === 'Dr' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
            >
              {normalSide}
            </span>
          </div>

          <div className="w-24 text-right flex-shrink-0">
            <button
              className="opacity-0 group-hover:opacity-100 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-opacity"
              onClick={e => {
                e.stopPropagation();
                navigate(`/accounts/${account.id}/ledger`);
              }}
            >
              View Ledger
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && account.children && (
          <div>{account.children.map(child => renderAccount(child, level + 1, colorClass))}</div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading chart of accounts</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-xl mx-auto bg-red-50 border border-red-200 rounded-lg p-5 text-red-800">
          <p className="font-semibold mb-1">Error loading accounts</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const accountGroups = groupAccountsByType();
  const totalAccounts = accounts.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg mt-0.5">
                <BookOpen className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
                <p className="text-sm text-gray-500 mt-1">
                  General Ledger account directory {totalAccounts} accounts
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  IFRS/FIRS compliant account structure Accounts 10006999
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={expandAll}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Collapse All
              </button>
              <button
                onClick={() => navigate('/accounts/ledger-search')}
                className="px-3 py-2 text-sm border border-indigo-300 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                Search Ledgers
              </button>
              <button
                onClick={() => navigate('/accounts/new')}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Account
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-4 items-start">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or code"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                  Control
                </span>
                Parent / Control account
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                  Detail
                </span>
                Child / Posting account
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                  Dr
                </span>
                Debit normal balance
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-bold">
                  Cr
                </span>
                Credit normal balance
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="max-w-7xl mx-auto px-6 mt-4">
        <div className="bg-gray-800 text-gray-300 text-xs font-semibold uppercase tracking-wider rounded-t-lg flex items-center px-4 py-3">
          <div className="w-6 mr-2 flex-shrink-0" />
          <div className="w-28 flex-shrink-0 mr-4">Acc. No.</div>
          <div className="flex-1">Account Name</div>
          <div className="hidden md:block w-24 text-center flex-shrink-0 mr-4">Level</div>
          <div className="w-20 text-right flex-shrink-0 mr-4">Norm. Side</div>
          <div className="w-24 text-right flex-shrink-0" />
        </div>
      </div>

      {/* Account Groups */}
      <div className="max-w-7xl mx-auto px-6 pb-10">
        {accountGroups.length === 0 ? (
          <div className="bg-white rounded-b-lg border border-gray-200 p-16 text-center text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium text-gray-700 mb-1">No accounts found</p>
            <p className="text-sm">
              {searchQuery
                ? 'Try a different search term.'
                : 'Create your first account to get started.'}
            </p>
          </div>
        ) : (
          accountGroups.map((group, idx) => {
            const isTypeExpanded = expandedTypes.has(group.type);
            const isLast = idx === accountGroups.length - 1;

            return (
              <div
                key={group.type}
                className={`border-x border-b border-gray-200 bg-white overflow-hidden ${isLast ? 'rounded-b-lg' : ''}`}
              >
                <div
                  tabIndex={0}
                  className={`flex items-center justify-between px-5 py-4 cursor-pointer select-none transition-colors hover:brightness-95 ${group.headerClass}`}
                  onClick={() => toggleType(group.type)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') toggleType(group.type);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {isTypeExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-base ${group.colorClass}`}>
                          {group.label}
                        </span>
                        <span className="text-xs font-mono text-gray-400 border border-gray-300 rounded px-1.5 py-0.5">
                          {group.ifrsSectionCode}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Normal Balance</p>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-bold ${group.normalSide === 'Dr' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}
                      >
                        {group.normalSide === 'Dr' ? 'Debit' : 'Credit'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Accounts</p>
                      <p className={`text-lg font-bold ${group.colorClass}`}>
                        {group.accounts.length}
                      </p>
                    </div>
                  </div>
                </div>

                {isTypeExpanded && (
                  <div>
                    {group.accounts.length === 0 ? (
                      <div className="px-6 py-8 text-center text-gray-400 text-sm">
                        No accounts in this section
                      </div>
                    ) : (
                      group.accounts.map(account => renderAccount(account, 0, group.colorClass))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AccountHierarchyPage;
