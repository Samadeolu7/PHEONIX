import React, { useState, useEffect, useMemo } from 'react';
import { Search, BookOpen, ArrowRight, BookMarked, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  parent?: number;
  parent_name?: string;
}

const TYPE_META: Record<string, { label: string; color: string; normalSide: 'Dr' | 'Cr' }> = {
  ASSET: {
    label: 'Asset',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    normalSide: 'Dr',
  },
  LIABILITY: {
    label: 'Liability',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
    normalSide: 'Cr',
  },
  EQUITY: {
    label: 'Equity',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    normalSide: 'Cr',
  },
  INCOME: {
    label: 'Revenue/Income',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    normalSide: 'Cr',
  },
  EXPENSE: { label: 'Expense', color: 'text-red-700 bg-red-50 border-red-200', normalSide: 'Dr' },
  SAVINGS: {
    label: 'Savings',
    color: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    normalSide: 'Cr',
  },
  LOAN: { label: 'Loan', color: 'text-rose-700 bg-rose-50 border-rose-200', normalSide: 'Dr' },
};

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'SAVINGS', 'LOAN'];

const LedgerSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [typeOpen, setTypeOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        // Cashier tills are per-staff sub-ledger accounts, normally hidden
        // from account pickers to avoid clutter — but Ledger Search is
        // exactly where someone needs to find and open a specific cashier's
        // cash ledger, so ask for that one sub-ledger kind back (loan/
        // savings/asset/supplier sub-ledgers stay hidden — there can be
        // thousands of those).
        const data = await api.get('/accounts/?include_subledgers=cashier');
        const list: Account[] = Array.isArray(data) ? data : data.results || [];
        list.sort((a, b) => a.code.localeCompare(b.code));
        setAccounts(list);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load accounts';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchAccounts();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(acc => {
      const matchesQuery =
        !q ||
        acc.name.toLowerCase().includes(q) ||
        acc.code.includes(q) ||
        (acc.parent_name && acc.parent_name.toLowerCase().includes(q));
      const matchesType = selectedType === 'ALL' || acc.account_type === selectedType;
      const matchesLevel = selectedLevel === 'ALL' || acc.account_level === selectedLevel;
      return matchesQuery && matchesType && matchesLevel;
    });
  }, [accounts, query, selectedType, selectedLevel]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    filtered.forEach(acc => {
      if (!groups[acc.account_type]) groups[acc.account_type] = [];
      groups[acc.account_type].push(acc);
    });
    return TYPE_ORDER.filter(t => groups[t]).map(t => ({ type: t, accounts: groups[t] }));
  }, [filtered]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading accounts…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 rounded-lg p-5 text-red-800">
          <p className="font-semibold">Error loading accounts</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const typeLabel =
    selectedType === 'ALL' ? 'All Types' : (TYPE_META[selectedType]?.label ?? selectedType);
  const levelLabel =
    selectedLevel === 'ALL'
      ? 'All Levels'
      : selectedLevel === 'PARENT'
        ? 'Control Accounts'
        : 'Detail Accounts';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 bg-indigo-100 rounded-lg mt-0.5">
              <BookMarked className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ledger Search</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Search accounts and open their general ledger — {accounts.length} accounts in chart
              </p>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => navigate('/accounts/hierarchy')}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Chart of Accounts
              </button>
            </div>
          </div>

          {/* Search + Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by account name, code or parent…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Type dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setTypeOpen(o => !o);
                  setLevelOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors min-w-40"
              >
                <span className="flex-1 text-left">{typeLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </button>
              {typeOpen && (
                <div className="absolute z-20 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {['ALL', ...TYPE_ORDER].map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setSelectedType(t);
                        setTypeOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedType === t ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {t === 'ALL' ? 'All Types' : TYPE_META[t]?.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Level dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setLevelOpen(o => !o);
                  setTypeOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors min-w-44"
              >
                <span className="flex-1 text-left">{levelLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </button>
              {levelOpen && (
                <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {['ALL', 'PARENT', 'CHILD'].map(l => (
                    <button
                      key={l}
                      onClick={() => {
                        setSelectedLevel(l);
                        setLevelOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedLevel === l ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {l === 'ALL'
                        ? 'All Levels'
                        : l === 'PARENT'
                          ? 'Control Accounts'
                          : 'Detail Accounts'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Result count */}
          <p className="text-xs text-gray-400 mt-3">
            {filtered.length === 0
              ? 'No accounts match your search'
              : `${filtered.length} account${filtered.length === 1 ? '' : 's'} found`}
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center text-gray-400">
            <Search className="h-12 w-12 mx-auto mb-4 text-gray-200" />
            <p className="font-medium text-gray-600 mb-1">No accounts found</p>
            <p className="text-sm">Try adjusting your search query or filters.</p>
          </div>
        ) : (
          groupedResults.map(({ type, accounts: typeAccounts }) => {
            const meta = TYPE_META[type];
            return (
              <div
                key={type}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Group header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {typeAccounts.length} account{typeAccounts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${meta.normalSide === 'Dr' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                  >
                    Normal: {meta.normalSide === 'Dr' ? 'Debit' : 'Credit'}
                  </span>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                  <div className="col-span-2">Acc. No.</div>
                  <div className="col-span-4">Account Name</div>
                  <div className="col-span-2">Level</div>
                  <div className="col-span-2">Parent Account</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {/* Account rows */}
                {typeAccounts.map(acc => (
                  <div
                    key={acc.id}
                    className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors group items-center"
                  >
                    <div className="col-span-2 font-mono text-sm font-semibold text-gray-600">
                      {acc.code}
                    </div>
                    <div className="col-span-4">
                      <span
                        className={`text-sm ${acc.account_level === 'PARENT' ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                      >
                        {acc.name}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${acc.account_level === 'PARENT' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {acc.account_level === 'PARENT' ? 'Control' : 'Detail'}
                      </span>
                    </div>
                    <div className="col-span-2 text-sm text-gray-400 truncate">
                      {acc.parent_name ?? '—'}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => navigate(`/accounts/${acc.id}/ledger`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Open Ledger
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LedgerSearchPage;
