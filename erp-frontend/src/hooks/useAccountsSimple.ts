import { useQuery } from '@tanstack/react-query';
import { accountService } from '../services/accountService';
import { Account } from '../types/accounts';

export const useAccountsByType = (account_type: 'ASSET' | 'INCOME' | 'EXPENSE') => {
  return useQuery({
    queryKey: ['accounts', account_type],
    queryFn: () => accountService.getAccounts({ account_type, is_active: true }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useInventoryAccounts = () => {
  return useQuery({
    queryKey: ['accounts', 'ASSET', 'current'],
    queryFn: () => accountService.getAccounts({ account_type: 'ASSET', is_active: true }),
    staleTime: 5 * 60 * 1000,
    select: (accounts: Account[]) =>
      accounts.filter(
        account =>
          account.name.toLowerCase().includes('inventory') ||
          account.name.toLowerCase().includes('stock') ||
          account.code.toLowerCase().includes('inv')
      ),
  });
};

export const useIncomeAccounts = () => {
  return useQuery({
    queryKey: ['accounts', 'INCOME'],
    queryFn: () => accountService.getAccounts({ account_type: 'INCOME', is_active: true }),
    staleTime: 5 * 60 * 1000,
  });
};

export const useAssetChildAccounts = () => {
  return useQuery({
    queryKey: ['accounts', 'ASSET', 'child'],
    queryFn: () => accountService.getAccounts({ account_type: 'ASSET', is_active: true }),
    staleTime: 5 * 60 * 1000,
    select: (accounts: Account[]) =>
      accounts.filter(a => a.account_level?.toLowerCase() === 'child'),
  });
};

export const useExpenseAccounts = () => {
  return useQuery({
    queryKey: ['accounts', 'EXPENSE'],
    queryFn: () => accountService.getAccounts({ account_type: 'EXPENSE', is_active: true }),
    staleTime: 5 * 60 * 1000,
    // select: (accounts: Account[]) => accounts.filter(account =>
    //   account.name.toLowerCase().includes('cost') ||
    //   account.name.toLowerCase().includes('cogs') ||
    //   account.code.toLowerCase().includes('cogs')
    // ),
  });
};
