import React, { useEffect, useMemo, useState } from 'react';
import { AccountsService } from '../../services/accounts';
import { Account } from '../../types/account';
import { Input } from './Input';
import { cn } from '../../lib/utils';

interface AccountSelectProps {
  value?: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
}

export const AccountSelect: React.FC<AccountSelectProps> = ({
  value,
  onChange,
  placeholder = 'Select account',
  className,
}) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const loadAccounts = async () => {
    if (hasLoaded || loading) return;

    console.log('[AccountSelect] Loading accounts...');
    setLoading(true);
    setError(null);
    try {
      const service = AccountsService.getInstance();
      const data = await service.getAccounts();
      console.log('[AccountSelect] Received accounts:', data);

      // Filter to child asset accounts only (bank/cash child accounts)
      // account_level='CHILD', account_type='ASSET', and must have a parent
      const childAssetAccounts = data.filter(
        a =>
          a.account_level === 'CHILD' &&
          a.account_type === 'ASSET' &&
          a.parent !== null &&
          a.parent !== undefined
      );
      console.log('[AccountSelect] Filtered child asset accounts:', childAssetAccounts);
      setAccounts(childAssetAccounts);
      setHasLoaded(true);
      setShowDropdown(true);
    } catch (err: any) {
      console.error('[AccountSelect] Failed to fetch accounts', err);
      console.error('[AccountSelect] Error response:', err?.response);
      console.error('[AccountSelect] Error response data:', err?.response?.data);

      const status = err?.response?.status;
      const backendMessage =
        err?.response?.data?.detail || err?.response?.data?.message || err?.response?.data?.error;

      if (status === 401) {
        setError(backendMessage || 'Permission denied. You may not have access to view accounts.');
      } else if (status === 403) {
        setError(backendMessage || 'Access forbidden. Please contact your administrator.');
      } else {
        setError(backendMessage || 'Failed to load accounts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!query) return accounts;
    const q = query.toLowerCase();
    return accounts.filter(a => `${a.code} ${a.name} ${a.id}`.toLowerCase().includes(q));
  }, [accounts, query]);

  const selected = accounts.find(a => a.id === value) || null;

  const handleFocus = () => {
    setShowDropdown(true);
    loadAccounts();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    // Clear selection when user starts typing
    if (value && newQuery !== '') {
      onChange(null);
    }
    setShowDropdown(true);
  };

  const handleSelect = (accountId: number) => {
    onChange(accountId);
    setQuery('');
    setShowDropdown(false);
  };

  const displayValue =
    selected && !showDropdown ? `[${selected.code || selected.id}] ${selected.name}` : query;

  return (
    <div className={cn('w-full relative', className)}>
      <Input
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        aria-label="Account search"
        className="mb-2"
      />

      {error && (
        <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800 mb-2">
          {error}
        </div>
      )}

      {showDropdown && hasLoaded && (
        <div className="absolute z-50 w-full max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg">
          {loading && <div className="p-3 text-sm text-gray-500">Loading accounts...</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No matching child asset accounts found</div>
          )}
          {!loading &&
            filtered.map(acc => (
              <button
                type="button"
                key={acc.id}
                onClick={() => handleSelect(acc.id)}
                className={cn(
                  'w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0',
                  acc.id === value ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : ''
                )}
              >
                <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                  {acc.code ? `[${acc.code}] ` : ''}
                  {acc.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Balance:{' '}
                  {typeof acc.balance === 'number' ? acc.balance.toFixed(2) : acc.balance || '0.00'}{' '}
                  • Parent ID: {acc.parent}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default AccountSelect;
