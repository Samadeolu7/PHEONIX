import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  materialRequestService,
  officeUseRequestService,
  accountLedgerService,
  inventoryLedgerService,
  clientStatementService,
} from '../services/ledgerService';
import {
  MaterialRequestFilters,
  CreateMaterialRequest,
  MaterialRequestActionData,
  OfficeUseRequestFilters,
  CreateOfficeUseRequest,
  OfficeUseRequestActionData,
} from '../types/ledger';

// ============================================
// QUERY KEYS
// ============================================

export const ledgerKeys = {
  all: ['ledger'] as const,

  // Material Requests
  materialRequests: () => [...ledgerKeys.all, 'material-requests'] as const,
  materialRequestsList: (filters?: MaterialRequestFilters) =>
    [...ledgerKeys.materialRequests(), filters] as const,
  materialRequestDetail: (id: number) => [...ledgerKeys.materialRequests(), id] as const,
  materialRequestSummary: () => [...ledgerKeys.materialRequests(), 'summary'] as const,
  pendingApprovals: () => [...ledgerKeys.materialRequests(), 'pending-approvals'] as const,
  materialRequestStockCheck: (id: number) =>
    [...ledgerKeys.materialRequests(), id, 'stock-check'] as const,

  // Account Ledgers
  accountLedgers: () => [...ledgerKeys.all, 'account-ledgers'] as const,
  accountLedger: (accountId: number, filters?: any) =>
    [...ledgerKeys.accountLedgers(), accountId, filters] as const,
  multiAccountLedger: (accountIds: number[], filters?: any) =>
    [...ledgerKeys.accountLedgers(), 'multi', accountIds, filters] as const,

  // Inventory Ledgers
  inventoryLedgers: () => [...ledgerKeys.all, 'inventory-ledgers'] as const,
  inventoryLedger: (itemId: number, filters?: any) =>
    [...ledgerKeys.inventoryLedgers(), itemId, filters] as const,
  invoiceMovements: (invoiceId: number) =>
    [...ledgerKeys.inventoryLedgers(), 'invoice', invoiceId] as const,

  // Client Statements
  clientStatements: () => [...ledgerKeys.all, 'client-statements'] as const,
  statementOfAccount: (clientId: number, filters?: any) =>
    [...ledgerKeys.clientStatements(), clientId, 'statement', filters] as const,
  paymentHistory: (clientId: number, filters?: any) =>
    [...ledgerKeys.clientStatements(), clientId, 'payments', filters] as const,
  outstandingInvoices: (clientId: number) =>
    [...ledgerKeys.clientStatements(), clientId, 'outstanding'] as const,
  clientAccountLedger: (clientId: number, filters?: any) =>
    [...ledgerKeys.clientStatements(), clientId, 'ledger', filters] as const,

  // Office Use Requests
  officeUseRequests: () => [...ledgerKeys.all, 'office-use-requests'] as const,
  officeUseRequestsList: (filters?: OfficeUseRequestFilters) =>
    [...ledgerKeys.officeUseRequests(), filters] as const,
  officeUseRequestDetail: (id: number) => [...ledgerKeys.officeUseRequests(), id] as const,
  officeUseRequestSummary: () => [...ledgerKeys.officeUseRequests(), 'summary'] as const,
  officeUseRequestStockCheck: (id: number) =>
    [...ledgerKeys.officeUseRequests(), id, 'stock-check'] as const,
};

// ============================================
// MATERIAL REQUEST HOOKS
// ============================================

export const useMaterialRequests = (filters?: MaterialRequestFilters) => {
  return useQuery({
    queryKey: ledgerKeys.materialRequestsList(filters),
    queryFn: () => materialRequestService.getMaterialRequests(filters),
    staleTime: 60 * 1000,
  });
};

export const useMaterialRequest = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.materialRequestDetail(id),
    queryFn: () => materialRequestService.getMaterialRequest(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useCreateMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMaterialRequest) => materialRequestService.createMaterialRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useUpdateMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateMaterialRequest> }) =>
      materialRequestService.updateMaterialRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
    },
  });
};

export const useDeleteMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => materialRequestService.deleteMaterialRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useSubmitMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => materialRequestService.submitMaterialRequest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useApproveMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MaterialRequestActionData }) =>
      materialRequestService.approveMaterialRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useRejectMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MaterialRequestActionData }) =>
      materialRequestService.rejectMaterialRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useFulfillMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => materialRequestService.fulfillMaterialRequest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
      // Also invalidate inventory queries as stock will be reduced
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useCancelMaterialRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => materialRequestService.cancelMaterialRequest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.materialRequestSummary() });
    },
  });
};

export const useMaterialRequestSummary = () => {
  return useQuery({
    queryKey: ledgerKeys.materialRequestSummary(),
    queryFn: () => materialRequestService.getMaterialRequestSummary(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const usePendingMaterialRequests = () => {
  return useQuery({
    queryKey: ledgerKeys.pendingApprovals(),
    queryFn: () => materialRequestService.getPendingApprovals(),
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useCheckMaterialRequestStock = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.materialRequestStockCheck(id),
    queryFn: () => materialRequestService.checkMaterialRequestStock(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000, // 30 seconds - refresh often since stock changes
    retry: false,
  });
};

// ============================================
// OFFICE USE REQUEST HOOKS
// ============================================

export const useOfficeUseRequests = (filters?: OfficeUseRequestFilters) => {
  return useQuery({
    queryKey: ledgerKeys.officeUseRequestsList(filters),
    queryFn: () => officeUseRequestService.getOfficeUseRequests(filters),
    staleTime: 60 * 1000,
  });
};

export const useOfficeUseRequest = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.officeUseRequestDetail(id),
    queryFn: () => officeUseRequestService.getOfficeUseRequest(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useCreateOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOfficeUseRequest) =>
      officeUseRequestService.createOfficeUseRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
    },
  });
};

export const useUpdateOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateOfficeUseRequest> }) =>
      officeUseRequestService.updateOfficeUseRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
    },
  });
};

export const useSubmitOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => officeUseRequestService.submitOfficeUseRequest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
    },
  });
};

export const useApproveOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OfficeUseRequestActionData }) =>
      officeUseRequestService.approveOfficeUseRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
    },
  });
};

export const useRejectOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OfficeUseRequestActionData }) =>
      officeUseRequestService.rejectOfficeUseRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
    },
  });
};

export const useFulfillOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => officeUseRequestService.fulfillOfficeUseRequest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useCancelOfficeUseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: OfficeUseRequestActionData }) =>
      officeUseRequestService.cancelOfficeUseRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestDetail(id) });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequests() });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.officeUseRequestSummary() });
    },
  });
};

export const useOfficeUseRequestSummary = () => {
  return useQuery({
    queryKey: ledgerKeys.officeUseRequestSummary(),
    queryFn: () => officeUseRequestService.getSummary(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useCheckOfficeUseRequestStock = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.officeUseRequestStockCheck(id),
    queryFn: () => officeUseRequestService.checkStock(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
    retry: false,
  });
};

// ============================================
// ACCOUNT LEDGER HOOKS
// ============================================

export const useAccountLedger = (
  accountId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
    include_unapproved?: boolean;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.accountLedger(accountId, filters),
    queryFn: () => accountLedgerService.getAccountLedger(accountId, filters),
    enabled: enabled && !!accountId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useMultiAccountLedger = (
  accountIds: number[],
  filters?: {
    date_from?: string;
    date_to?: string;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.multiAccountLedger(accountIds, filters),
    queryFn: () => accountLedgerService.getMultiAccountLedger(accountIds, filters),
    enabled: enabled && accountIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });
};

// ============================================
// INVENTORY LEDGER HOOKS
// ============================================

export const useInventoryLedger = (
  itemId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
    location_id?: number;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.inventoryLedger(itemId, filters),
    queryFn: () => inventoryLedgerService.getInventoryLedger(itemId, filters),
    enabled: enabled && !!itemId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useInvoiceMovements = (invoiceId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.invoiceMovements(invoiceId),
    queryFn: () => inventoryLedgerService.getMovementsByInvoice(invoiceId),
    enabled: enabled && !!invoiceId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useItemLifecycleLedger = (
  itemId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
    location_id?: number;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: [...ledgerKeys.inventoryLedger(itemId, filters), 'lifecycle'],
    queryFn: () => inventoryLedgerService.getItemLifecycle(itemId, filters),
    enabled: enabled && !!itemId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useItemCostAnalysis = (itemId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: [...ledgerKeys.inventoryLedger(itemId), 'cost_analysis'],
    queryFn: () => inventoryLedgerService.getCostAnalysis(itemId),
    enabled: enabled && !!itemId,
    staleTime: 5 * 60 * 1000,
  });
};

// ============================================
// CLIENT STATEMENT HOOKS
// ============================================

export const useClientStatement = (
  clientId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
    include_paid?: boolean;
    invoice_type?: 'service' | 'inventory' | 'all';
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.statementOfAccount(clientId, filters),
    queryFn: () => clientStatementService.getStatementOfAccount(clientId, filters),
    enabled: enabled && !!clientId,
    staleTime: 2 * 60 * 1000,
  });
};

export const usePaymentHistory = (
  clientId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.paymentHistory(clientId, filters),
    queryFn: () => clientStatementService.getPaymentHistory(clientId, filters),
    enabled: enabled && !!clientId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useOutstandingInvoices = (clientId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ledgerKeys.outstandingInvoices(clientId),
    queryFn: () => clientStatementService.getOutstandingInvoices(clientId),
    enabled: enabled && !!clientId,
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useClientLedger = (
  clientId: number,
  filters?: {
    date_from?: string;
    date_to?: string;
  },
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ledgerKeys.clientAccountLedger(clientId, filters),
    queryFn: () => clientStatementService.getAccountLedger(clientId, filters),
    enabled: enabled && !!clientId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};
