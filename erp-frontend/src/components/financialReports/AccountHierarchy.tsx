// AccountHierarchy Component
// Displays hierarchical account structure with expand/collapse functionality

import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Minus, Plus } from 'lucide-react';
import { AccountBalance } from '../../types/financialReports';

interface AccountHierarchyProps {
  accounts: AccountBalance[];
  expandedAccounts: Set<string>;
  onToggleAccount: (code: string) => void;
  showColumns: ('code' | 'name' | 'debit' | 'credit' | 'balance')[];
  className?: string;
}

const AccountHierarchy: React.FC<AccountHierarchyProps> = ({
  accounts,
  expandedAccounts,
  onToggleAccount,
  showColumns,
  className = '',
}) => {
  // Format currency values
  const formatCurrency = useCallback((value: string): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  // Get appropriate styling for account type
  const getAccountTypeStyle = (accountType: string, level: string) => {
    const baseStyle = level === 'PARENT' ? 'font-semibold' : 'font-normal';

    switch (accountType) {
      case 'ASSET':
        return `${baseStyle} text-blue-800`;
      case 'LIABILITY':
        return `${baseStyle} text-red-800`;
      case 'EQUITY':
        return `${baseStyle} text-green-800`;
      case 'INCOME':
        return `${baseStyle} text-emerald-800`;
      case 'EXPENSE':
        return `${baseStyle} text-orange-800`;
      default:
        return `${baseStyle} text-gray-800`;
    }
  };

  // Render individual account row
  const renderAccount = (account: AccountBalance, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedAccounts.has(account.code);
    const hasChildren = account.children && account.children.length > 0;
    const indentClass = depth > 0 ? `pl-${Math.min(depth * 6, 24)}` : '';

    return (
      <React.Fragment key={account.code}>
        <tr className="hover:bg-gray-50 transition-colors">
          {/* Account Code */}
          {showColumns.includes('code') && (
            <td className={`px-4 py-3 text-sm ${indentClass}`}>
              <div className="flex items-center">
                {hasChildren && (
                  <button
                    onClick={() => onToggleAccount(account.code)}
                    className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                    aria-label={isExpanded ? 'Collapse account' : 'Expand account'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-600" />
                    )}
                  </button>
                )}
                {!hasChildren && depth > 0 && (
                  <div className="w-6 mr-2" /> // Spacer for alignment
                )}
                <span className={getAccountTypeStyle(account.account_type, account.level)}>
                  {account.code}
                </span>
              </div>
            </td>
          )}

          {/* Account Name */}
          {showColumns.includes('name') && (
            <td className="px-4 py-3 text-sm">
              <span className={getAccountTypeStyle(account.account_type, account.level)}>
                {account.name}
              </span>
              {account.level === 'PARENT' && (
                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  {account.account_type}
                </span>
              )}
            </td>
          )}

          {/* Debit Amount */}
          {showColumns.includes('debit') && (
            <td className="px-4 py-3 text-sm text-right font-mono">
              {parseFloat(account.debit) !== 0 ? (
                <span className="text-gray-900">{formatCurrency(account.debit)}</span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </td>
          )}

          {/* Credit Amount */}
          {showColumns.includes('credit') && (
            <td className="px-4 py-3 text-sm text-right font-mono">
              {parseFloat(account.credit) !== 0 ? (
                <span className="text-gray-900">{formatCurrency(account.credit)}</span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </td>
          )}

          {/* Balance */}
          {showColumns.includes('balance') && (
            <td className="px-4 py-3 text-sm text-right font-mono">
              <span
                className={`${
                  parseFloat(account.balance) < 0 ? 'text-red-600' : 'text-gray-900'
                } ${account.level === 'PARENT' ? 'font-semibold' : ''}`}
              >
                {formatCurrency(account.balance)}
              </span>
            </td>
          )}
        </tr>

        {/* Render children if expanded */}
        {isExpanded && hasChildren && (
          <>{account.children!.map(child => renderAccount(child, depth + 1))}</>
        )}
      </React.Fragment>
    );
  };

  // Column headers
  const getColumnHeader = (column: string): string => {
    switch (column) {
      case 'code':
        return 'Account Code';
      case 'name':
        return 'Account Name';
      case 'debit':
        return 'Debit';
      case 'credit':
        return 'Credit';
      case 'balance':
        return 'Balance';
      default:
        return column;
    }
  };

  // Expand/Collapse all functionality
  const hasExpandableAccounts = accounts.some(
    account => account.children && account.children.length > 0
  );

  const allExpanded =
    hasExpandableAccounts &&
    accounts.every(account => !account.children?.length || expandedAccounts.has(account.code));

  const handleExpandCollapseAll = () => {
    if (allExpanded) {
      // Collapse all
      accounts.forEach(account => {
        if (account.children?.length) {
          onToggleAccount(account.code);
        }
      });
    } else {
      // Expand all
      accounts.forEach(account => {
        if (account.children?.length && !expandedAccounts.has(account.code)) {
          onToggleAccount(account.code);
        }
      });
    }
  };

  if (!accounts || accounts.length === 0) {
    return <div className="text-center py-8 text-gray-500">No accounts to display</div>;
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Header with expand/collapse all */}
      {hasExpandableAccounts && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Account Hierarchy</span>
          <button
            onClick={handleExpandCollapseAll}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            {allExpanded ? (
              <>
                <Minus className="h-3 w-3" />
                Collapse All
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Expand All
              </>
            )}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {showColumns.map(column => (
                <th
                  key={column}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    ['debit', 'credit', 'balance'].includes(column) ? 'text-right' : ''
                  }`}
                >
                  {getColumnHeader(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map(account => renderAccount(account))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountHierarchy;
