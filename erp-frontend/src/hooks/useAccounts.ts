import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  AccountsService,
  Account,
  CreateAccountDTO,
  UpdateAccountDTO,
  PaginationParams,
} from '../api/accountsService';

const accountsService = new AccountsService();

export const accountKeys = {
  all: ['accounts'] as const,
  lists: () => [...accountKeys.all, 'list'] as const,
  list: (params: PaginationParams) => [...accountKeys.lists(), params] as const,
  details: () => [...accountKeys.all, 'detail'] as const,
  detail: (id: string) => [...accountKeys.details(), id] as const,
};

export const useAccounts = (
  params: PaginationParams,
  options?: Omit<UseQueryOptions<Account[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: accountKeys.list(params),
    queryFn: () => accountsService.getAccounts(params),
    ...options,
  });
};

export const useAccount = (
  id: string,
  options?: Omit<UseQueryOptions<Account, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: () => accountsService.getAccountById(Number(id)),
    ...options,
  });
};

export const useCreateAccount = (
  options?: Omit<UseMutationOptions<Account, Error, CreateAccountDTO>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAccountDTO) => accountsService.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
    ...options,
  });
};

export const useUpdateAccount = (
  options?: Omit<
    UseMutationOptions<Account, Error, { id: string; data: UpdateAccountDTO }>,
    'mutationFn'
  >
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountDTO }) =>
      accountsService.updateAccount(id, data),
    onSuccess: (_data: Account, { id }: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
    ...options,
  });
};

export const useDeleteAccount = (
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => accountsService.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
    ...options,
  });
};
