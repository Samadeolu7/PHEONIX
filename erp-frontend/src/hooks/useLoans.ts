import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  loanService,
  LoanAccountList,
  LoanAccount,
  LoanProduct,
  LoanRepaymentSchedule,
  LoanDisbursement,
  LoanVerificationRequest,
  LoanDisbursementCorrection,
  LoanRepaymentRequest,
  LoanRestructureRequest,
  LoanGuarantor,
  LoanCollateral,
  LoanTransactionPage,
  LoanPaymentHistory,
  RepayLoanPayload,
  RepayLoanResult,
  CreateLoanAccountData,
  LoanAccountFilters,
  GroupCollectionRow,
  BulkRepayPayment,
  BulkRepayResult,
  RemittanceReport,
  LoanProductFee,
  LoanProductSavingsRequirement,
  FeePreviewItem,
  ProposeRestructurePayload,
  RequestCorrectionPayload,
  LoanRepaymentReversal,
  RequestRepaymentReversalPayload,
  LoanRepaymentAllocation,
  OfflinePaymentPayload,
  OfflinePaymentRecord,
  VerificationVerdict,
  LoanStatement,
  PARSummary,
  CBNReturns,
  ContractualInterestSummary,
} from '../services/loanService';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const loanKeys = {
  all: ['loans'] as const,

  // Products
  products: () => [...loanKeys.all, 'products'] as const,
  productLists: () => [...loanKeys.products(), 'list'] as const,
  productList: (params?: { is_active?: boolean; search?: string }) =>
    [...loanKeys.productLists(), params] as const,
  productDetail: (id: number) => [...loanKeys.products(), 'detail', id] as const,

  // Product Fees
  productFees: () => [...loanKeys.all, 'productFees'] as const,
  productFeeList: (productId: number) => [...loanKeys.productFees(), productId] as const,

  // Product Savings Requirements
  productSavingsReqs: () => [...loanKeys.all, 'productSavingsReqs'] as const,
  productSavingsReqList: (productId: number) => [...loanKeys.productSavingsReqs(), productId] as const,

  // Accounts
  accounts: () => [...loanKeys.all, 'accounts'] as const,
  accountLists: () => [...loanKeys.accounts(), 'list'] as const,
  accountList: (params?: LoanAccountFilters) => [...loanKeys.accountLists(), params] as const,
  accountDetail: (id: number) => [...loanKeys.accounts(), 'detail', id] as const,
  accountSchedule: (id: number) => [...loanKeys.accounts(), 'schedule', id] as const,
  accountTransactions: (id: number, page: number, pageSize: number) =>
    [...loanKeys.accounts(), 'transactions', id, page, pageSize] as const,
  accountPaymentHistory: (id: number) => [...loanKeys.accounts(), 'paymentHistory', id] as const,
  accountStatement: (id: number) => [...loanKeys.accounts(), 'statement', id] as const,

  // Collections
  collections: () => [...loanKeys.all, 'collections'] as const,
  groupCollection: (groupId: number, date?: string) =>
    [...loanKeys.collections(), 'group', groupId, date] as const,
  remittanceReport: (date?: string, search?: string) =>
    [...loanKeys.collections(), 'remittance', date, search] as const,

  // Disbursements
  disbursements: () => [...loanKeys.all, 'disbursements'] as const,
  disbursementList: (params?: { loan?: number; status?: string }) =>
    [...loanKeys.disbursements(), 'list', params] as const,
  disbursementDetail: (id: number) => [...loanKeys.disbursements(), 'detail', id] as const,

  // Disbursement Corrections
  corrections: () => [...loanKeys.all, 'corrections'] as const,
  correctionList: (params?: { status?: string }) =>
    [...loanKeys.corrections(), 'list', params] as const,

  // Repayment Reversals
  repaymentReversals: () => [...loanKeys.all, 'repaymentReversals'] as const,
  repaymentReversalList: (params?: { status?: string; loan?: number }) =>
    [...loanKeys.repaymentReversals(), 'list', params] as const,

  // Repayment Allocations (read-only)
  repaymentAllocations: () => [...loanKeys.all, 'repaymentAllocations'] as const,
  repaymentAllocationList: (params?: { loan?: number; schedule?: number }) =>
    [...loanKeys.repaymentAllocations(), 'list', params] as const,

  // Verification Requests
  verifications: () => [...loanKeys.all, 'verifications'] as const,
  verificationList: (params?: { loan?: number; verdict?: string }) =>
    [...loanKeys.verifications(), 'list', params] as const,

  // Repayment Requests
  repaymentRequests: () => [...loanKeys.all, 'repaymentRequests'] as const,
  repaymentRequestList: (params?: { status?: string }) =>
    [...loanKeys.repaymentRequests(), 'list', params] as const,

  // Restructure Requests
  restructureRequests: () => [...loanKeys.all, 'restructureRequests'] as const,
  restructureRequestList: (params?: { status?: string }) =>
    [...loanKeys.restructureRequests(), 'list', params] as const,

  // Guarantors
  guarantors: () => [...loanKeys.all, 'guarantors'] as const,
  guarantorList: (loanId: number) => [...loanKeys.guarantors(), loanId] as const,

  // Collateral
  collateral: () => [...loanKeys.all, 'collateral'] as const,
  collateralList: (loanId: number) => [...loanKeys.collateral(), loanId] as const,

  // CBN Compliance
  compliance: () => [...loanKeys.all, 'compliance'] as const,
  parSummary: () => [...loanKeys.compliance(), 'par'] as const,
  cbnReturns: (asOf?: string) => [...loanKeys.compliance(), 'cbn', asOf] as const,
  contractualInterest: () => [...loanKeys.compliance(), 'contractualInterest'] as const,

  // Offline Payments
  offlinePayments: () => [...loanKeys.all, 'offlinePayments'] as const,
  offlinePaymentList: (params?: { status?: string }) =>
    [...loanKeys.offlinePayments(), 'list', params] as const,

  // Fees Preview
  feesPreview: (productId: number, amount: number) =>
    [...loanKeys.all, 'feesPreview', productId, amount] as const,
};

// ── Products ───────────────────────────────────────────────────────────────

export const useLoanProducts = (
  params?: { is_active?: boolean; search?: string },
  options?: Omit<UseQueryOptions<LoanProduct[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.productList(params),
    queryFn: () => loanService.listProducts(params),
    ...options,
  });
};

export const useLoanProduct = (
  id: number,
  options?: Omit<UseQueryOptions<LoanProduct, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.productDetail(id),
    queryFn: () => loanService.getProduct(id),
    enabled: !!id,
    ...options,
  });
};

export const useCreateLoanProduct = (
  options?: Omit<UseMutationOptions<LoanProduct, Error, Partial<LoanProduct>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productLists() });
    },
    ...options,
  });
};

export const useUpdateLoanProduct = (
  options?: Omit<UseMutationOptions<LoanProduct, Error, { id: number; data: Partial<LoanProduct> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.updateProduct(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.productLists() });
    },
    ...options,
  });
};

// ── Product Fees ───────────────────────────────────────────────────────────

export const useLoanProductFees = (
  productId: number,
  options?: Omit<UseQueryOptions<LoanProductFee[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.productFeeList(productId),
    queryFn: () => loanService.listProductFees(productId),
    enabled: !!productId,
    ...options,
  });
};

export const useCreateLoanProductFee = (
  options?: Omit<UseMutationOptions<LoanProductFee, Error, Partial<LoanProductFee>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.createProductFee(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productFeeList(variables.loan_product!) });
    },
    ...options,
  });
};

export const useUpdateLoanProductFee = (
  options?: Omit<UseMutationOptions<LoanProductFee, Error, { id: number; data: Partial<LoanProductFee> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.updateProductFee(id, data),
    onSuccess: (_data, { data }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productFeeList(data.loan_product!) });
    },
    ...options,
  });
};

export const useDeleteLoanProductFee = (
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.deleteProductFee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productFees() });
    },
    ...options,
  });
};

// ── Product Savings Requirements ──────────────────────────────────────────

export const useLoanSavingsRequirements = (
  productId: number,
  options?: Omit<UseQueryOptions<LoanProductSavingsRequirement[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.productSavingsReqList(productId),
    queryFn: () => loanService.listSavingsRequirements(productId),
    enabled: !!productId,
    ...options,
  });
};

export const useCreateSavingsRequirement = (
  options?: Omit<UseMutationOptions<LoanProductSavingsRequirement, Error, Partial<LoanProductSavingsRequirement>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.createSavingsRequirement(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productSavingsReqList(variables.loan_product!) });
    },
    ...options,
  });
};

export const useUpdateSavingsRequirement = (
  options?: Omit<UseMutationOptions<LoanProductSavingsRequirement, Error, { id: number; data: Partial<LoanProductSavingsRequirement> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.updateSavingsRequirement(id, data),
    onSuccess: (_data, { data }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productSavingsReqList(data.loan_product!) });
    },
    ...options,
  });
};

export const useDeleteSavingsRequirement = (
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.deleteSavingsRequirement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.productSavingsReqs() });
    },
    ...options,
  });
};

// ── Fees Preview ───────────────────────────────────────────────────────────

export const useFeesPreview = (
  productId: number,
  amount: number,
  options?: Omit<UseQueryOptions<FeePreviewItem[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.feesPreview(productId, amount),
    queryFn: () => loanService.previewFees(productId, amount),
    enabled: !!productId && amount > 0,
    ...options,
  });
};

// ── Loan Accounts ──────────────────────────────────────────────────────────

export const useLoanAccounts = (
  params?: LoanAccountFilters,
  options?: Omit<UseQueryOptions<import('../services/loanService').PaginatedResponse<LoanAccountList>, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountList(params),
    queryFn: () => loanService.listLoans(params),
    ...options,
  });
};

export const useLoanAccount = (
  id: number,
  options?: Omit<UseQueryOptions<LoanAccount, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountDetail(id),
    queryFn: () => loanService.getLoan(id),
    enabled: !!id,
    ...options,
  });
};

export const useLoanSchedule = (
  id: number,
  options?: Omit<UseQueryOptions<LoanRepaymentSchedule[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountSchedule(id),
    queryFn: () => loanService.getLoanSchedule(id),
    enabled: !!id,
    ...options,
  });
};

export const useLoanTransactions = (
  id: number,
  page: number,
  pageSize: number,
  options?: Omit<UseQueryOptions<LoanTransactionPage, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountTransactions(id, page, pageSize),
    queryFn: () => loanService.getLoanTransactions(id, page, pageSize),
    enabled: !!id,
    ...options,
  });
};

export const useLoanPaymentHistory = (
  id: number,
  options?: Omit<UseQueryOptions<LoanPaymentHistory, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountPaymentHistory(id),
    queryFn: () => loanService.getLoanPaymentHistory(id),
    enabled: !!id,
    ...options,
  });
};

export const useCreateLoan = (
  options?: Omit<UseMutationOptions<LoanAccount, Error, CreateLoanAccountData>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.createLoan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useUpdateLoan = (
  options?: Omit<UseMutationOptions<LoanAccount, Error, { id: number; data: Partial<CreateLoanAccountData> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.updateLoan(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useApproveLoan = (
  options?: Omit<UseMutationOptions<LoanAccount, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.approveLoan(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useRejectLoan = (
  options?: Omit<UseMutationOptions<LoanAccount, Error, { id: number; reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => loanService.rejectLoan(id, reason),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useRepayLoan = (
  options?: Omit<UseMutationOptions<RepayLoanResult, Error, { id: number; data: RepayLoanPayload }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.repayLoan(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountSchedule(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountPaymentHistory(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useBulkRepay = (
  options?: Omit<UseMutationOptions<BulkRepayResult, Error, {
    payments: BulkRepayPayment[];
    payment_mode?: 'cash' | 'bank_transfer';
    bank_reference?: string;
    bank_account_id?: number;
  }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.bulkRepay(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountLists() });
    },
    ...options,
  });
};

export const useRequestDisbursement = (
  options?: Omit<UseMutationOptions<LoanDisbursement, Error, { loanId: number; notes?: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, notes }) => loanService.requestDisbursement(loanId, notes),
    onSuccess: (_data, { loanId }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(loanId) });
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursements() });
    },
    ...options,
  });
};

export const useRequestSavingsRepayment = (
  options?: Omit<UseMutationOptions<LoanRepaymentRequest, Error, {
    loanId: number;
    data: { installment_ids: number[]; savings_account_id: number; payment_date?: string; notes?: string };
  }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, data }) => loanService.requestSavingsRepayment(loanId, data),
    onSuccess: (_data, { loanId }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(loanId) });
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentRequests() });
    },
    ...options,
  });
};

// ── Defaulters ─────────────────────────────────────────────────────────────

export const useLoanDefaulters = (
  asOf?: string,
  search?: string,
  options?: Omit<UseQueryOptions<import('../services/loanService').PaginatedResponse<LoanAccountList>, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: [...loanKeys.accounts(), 'defaulters', asOf, search] as const,
    queryFn: () => loanService.getDefaulters(asOf, search),
    ...options,
  });
};

// ── Collections ────────────────────────────────────────────────────────────

export const useGroupCollection = (
  groupId: number,
  date?: string,
  options?: Omit<UseQueryOptions<GroupCollectionRow[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.groupCollection(groupId, date),
    queryFn: () => loanService.getGroupCollection(groupId, date),
    enabled: !!groupId,
    ...options,
  });
};

export const useRemittanceReport = (
  date?: string,
  search?: string,
  options?: Omit<UseQueryOptions<RemittanceReport, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.remittanceReport(date, search),
    queryFn: () => loanService.getRemittanceReport(date, search),
    ...options,
  });
};

// ── Disbursements ──────────────────────────────────────────────────────────

export const useLoanDisbursements = (
  params?: { loan?: number; status?: string },
  options?: Omit<UseQueryOptions<LoanDisbursement[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.disbursementList(params),
    queryFn: () => loanService.listDisbursements(params),
    ...options,
  });
};

export const useApproveDisbursement = (
  options?: Omit<UseMutationOptions<LoanDisbursement, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.approveDisbursement(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursementDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursements() });
    },
    ...options,
  });
};

export const useExecuteDisbursement = (
  options?: Omit<UseMutationOptions<LoanDisbursement, Error, {
    id: number;
    data: { disbursement_account: number; notes?: string };
  }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.executeDisbursement(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursementDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursements() });
    },
    ...options,
  });
};

export const useDisburseLoan = (
  options?: Omit<UseMutationOptions<LoanDisbursement, Error, {
    id: number;
    data: { disbursement_account: number; notes?: string };
  }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.disburseLoan(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursementDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursements() });
    },
    ...options,
  });
};

export const useRejectDisbursement = (
  options?: Omit<UseMutationOptions<LoanDisbursement, Error, { id: number; reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => loanService.rejectDisbursement(id, reason),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursementDetail(id) });
      queryClient.invalidateQueries({ queryKey: loanKeys.disbursements() });
    },
    ...options,
  });
};

// ── Disbursement Corrections ──────────────────────────────────────────────

export const useLoanDisbursementCorrections = (
  params?: { status?: string },
  options?: Omit<UseQueryOptions<LoanDisbursementCorrection[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.correctionList(params),
    queryFn: () => loanService.listDisbursementCorrections(params),
    ...options,
  });
};

export const useRequestDisbursementCorrection = (
  options?: Omit<UseMutationOptions<LoanDisbursementCorrection, Error, RequestCorrectionPayload>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.requestDisbursementCorrection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.corrections() });
    },
    ...options,
  });
};

export const useFirstApproveCorrection = (
  options?: Omit<UseMutationOptions<LoanDisbursementCorrection, Error, { id: number; notes: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }) => loanService.firstApproveCorrection(id, notes),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.correctionList() });
    },
    ...options,
  });
};

export const useSecondApproveCorrection = (
  options?: Omit<UseMutationOptions<LoanDisbursementCorrection, Error, { id: number; notes: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }) => loanService.secondApproveCorrection(id, notes),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.correctionList() });
    },
    ...options,
  });
};

export const useRejectCorrection = (
  options?: Omit<UseMutationOptions<LoanDisbursementCorrection, Error, { id: number; rejection_reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }) => loanService.rejectCorrection(id, rejection_reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.correctionList() });
    },
    ...options,
  });
};

// ── Repayment Reversals ────────────────────────────────────────────────────

export const useLoanRepaymentReversals = (
  params?: { status?: string; loan?: number },
  options?: Omit<UseQueryOptions<LoanRepaymentReversal[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.repaymentReversalList(params),
    queryFn: () => loanService.listRepaymentReversals(params),
    ...options,
  });
};

export const useLoanRepaymentAllocations = (
  params?: { loan?: number; schedule?: number },
  options?: Omit<UseQueryOptions<LoanRepaymentAllocation[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.repaymentAllocationList(params),
    queryFn: () => loanService.listRepaymentAllocations(params),
    ...options,
  });
};

export const useRequestRepaymentReversal = (
  options?: Omit<UseMutationOptions<LoanRepaymentReversal, Error, RequestRepaymentReversalPayload>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.requestRepaymentReversal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentReversals() });
    },
    ...options,
  });
};

export const useFirstApproveRepaymentReversal = (
  options?: Omit<UseMutationOptions<LoanRepaymentReversal, Error, { id: number; notes: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }) => loanService.firstApproveRepaymentReversal(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentReversalList() });
    },
    ...options,
  });
};

export const useSecondApproveRepaymentReversal = (
  options?: Omit<UseMutationOptions<LoanRepaymentReversal, Error, { id: number; notes: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }) => loanService.secondApproveRepaymentReversal(id, notes),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentReversalList() });
      // Second approval actually executes the reversal — GL, schedule, and
      // balances all change on data.loan, so anything already rendering that
      // loan needs to refetch rather than show stale pre-reversal state.
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(data.loan) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountSchedule(data.loan) });
      queryClient.invalidateQueries({ queryKey: loanKeys.accountPaymentHistory(data.loan) });
      queryClient.invalidateQueries({ queryKey: [...loanKeys.accounts(), 'transactions', data.loan] });
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentAllocations() });
    },
    ...options,
  });
};

export const useRejectRepaymentReversal = (
  options?: Omit<UseMutationOptions<LoanRepaymentReversal, Error, { id: number; rejection_reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }) => loanService.rejectRepaymentReversal(id, rejection_reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentReversalList() });
    },
    ...options,
  });
};

// ── Verification Requests ─────────────────────────────────────────────────

export const useLoanVerifications = (
  params?: { loan?: number; verdict?: string },
  options?: Omit<UseQueryOptions<LoanVerificationRequest[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.verificationList(params),
    queryFn: () => loanService.listVerificationRequests(params),
    ...options,
  });
};

export const useRunVerificationCheck = (
  options?: Omit<UseMutationOptions<LoanVerificationRequest, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.runVerificationCheck(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.verifications() });
    },
    ...options,
  });
};

export const useUpdateVerdict = (
  options?: Omit<UseMutationOptions<LoanVerificationRequest, Error, { id: number; verdict: VerificationVerdict }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verdict }) => loanService.updateVerdict(id, verdict),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.verifications() });
    },
    ...options,
  });
};

// ── Repayment Requests (Director Approval) ────────────────────────────────

export const useLoanRepaymentApprovals = (
  params?: { status?: string },
  options?: Omit<UseQueryOptions<LoanRepaymentRequest[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.repaymentRequestList(params),
    queryFn: () => loanService.listRepaymentRequests(params),
    ...options,
  });
};

export const useApproveRepaymentRequest = (
  options?: Omit<UseMutationOptions<LoanRepaymentRequest, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.approveRepaymentRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentRequests() });
    },
    ...options,
  });
};

export const useRejectRepaymentRequest = (
  options?: Omit<UseMutationOptions<LoanRepaymentRequest, Error, { id: number; rejection_reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }) => loanService.rejectRepaymentRequest(id, rejection_reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.repaymentRequests() });
    },
    ...options,
  });
};

// ── Restructure Requests (Director Approval) ──────────────────────────────

export const useLoanRestructureApprovals = (
  params?: { status?: string },
  options?: Omit<UseQueryOptions<LoanRestructureRequest[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.restructureRequestList(params),
    queryFn: () => loanService.listRestructureRequests(params),
    ...options,
  });
};

export const useProposeRestructure = (
  options?: Omit<UseMutationOptions<LoanRestructureRequest, Error, { loanId: number; data: ProposeRestructurePayload }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, data }) => loanService.proposeRestructure(loanId, data),
    onSuccess: (_data, { loanId }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.accountDetail(loanId) });
      queryClient.invalidateQueries({ queryKey: loanKeys.restructureRequests() });
    },
    ...options,
  });
};

export const useApproveRestructureRequest = (
  options?: Omit<UseMutationOptions<LoanRestructureRequest, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => loanService.approveRestructureRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.restructureRequests() });
    },
    ...options,
  });
};

export const useRejectRestructureRequest = (
  options?: Omit<UseMutationOptions<LoanRestructureRequest, Error, { id: number; rejection_reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }) => loanService.rejectRestructureRequest(id, rejection_reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.restructureRequests() });
    },
    ...options,
  });
};

// ── Guarantors ─────────────────────────────────────────────────────────────

export const useLoanGuarantors = (
  loanId: number,
  options?: Omit<UseQueryOptions<LoanGuarantor[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.guarantorList(loanId),
    queryFn: () => loanService.listGuarantors(loanId),
    enabled: !!loanId,
    ...options,
  });
};

export const useAddGuarantor = (
  options?: Omit<UseMutationOptions<LoanGuarantor, Error, Parameters<typeof loanService.addGuarantor>[0]>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.addGuarantor(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.guarantorList(variables.loan) });
    },
    ...options,
  });
};

export const useDeleteGuarantor = (
  options?: Omit<UseMutationOptions<void, Error, { id: number; loanId: number }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => loanService.deleteGuarantor(id),
    onSuccess: (_data, { loanId }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.guarantorList(loanId) });
    },
    ...options,
  });
};

// ── Collateral ─────────────────────────────────────────────────────────────

export const useLoanCollateral = (
  loanId: number,
  options?: Omit<UseQueryOptions<LoanCollateral[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.collateralList(loanId),
    queryFn: () => loanService.listCollateral(loanId),
    enabled: !!loanId,
    ...options,
  });
};

export const useAddCollateral = (
  options?: Omit<UseMutationOptions<LoanCollateral, Error, Parameters<typeof loanService.addCollateral>[0]>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.addCollateral(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.collateralList(variables.loan) });
    },
    ...options,
  });
};

export const useDeleteCollateral = (
  options?: Omit<UseMutationOptions<void, Error, { id: number; loanId: number }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => loanService.deleteCollateral(id),
    onSuccess: (_data, { loanId }) => {
      queryClient.invalidateQueries({ queryKey: loanKeys.collateralList(loanId) });
    },
    ...options,
  });
};

// ── CBN Compliance ────────────────────────────────────────────────────────

export const useLoanStatement = (
  id: number,
  options?: Omit<UseQueryOptions<LoanStatement, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.accountStatement(id),
    queryFn: () => loanService.getLoanStatement(id),
    enabled: !!id,
    ...options,
  });
};

export const usePARSummary = (
  options?: Omit<UseQueryOptions<PARSummary, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.parSummary(),
    queryFn: () => loanService.getPARSummary(),
    ...options,
  });
};

export const useCBNReturns = (
  asOf?: string,
  options?: Omit<UseQueryOptions<CBNReturns, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.cbnReturns(asOf),
    queryFn: () => loanService.getCBNReturns(asOf),
    ...options,
  });
};

export const useContractualInterestSummary = (
  options?: Omit<UseQueryOptions<ContractualInterestSummary, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.contractualInterest(),
    queryFn: () => loanService.getContractualInterestSummary(),
    ...options,
  });
};

// ── Offline Payments ──────────────────────────────────────────────────────

export const useOfflinePayments = (
  params?: { status?: string },
  options?: Omit<UseQueryOptions<OfflinePaymentRecord[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: loanKeys.offlinePaymentList(params),
    queryFn: () => loanService.listOfflinePayments(params),
    ...options,
  });
};

export const useCreateOfflinePayment = (
  options?: Omit<UseMutationOptions<OfflinePaymentRecord, Error, OfflinePaymentPayload>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => loanService.createOfflinePayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.offlinePayments() });
    },
    ...options,
  });
};

export const useApproveOfflinePayment = (
  options?: Omit<UseMutationOptions<OfflinePaymentRecord, Error, {
    id: number;
    data?: { cashier_account_id?: number; bank_account_id?: number };
  }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loanService.approveOfflinePayment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.offlinePayments() });
    },
    ...options,
  });
};

export const useRejectOfflinePayment = (
  options?: Omit<UseMutationOptions<OfflinePaymentRecord, Error, { id: number; rejection_reason: string }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }) => loanService.rejectOfflinePayment(id, rejection_reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loanKeys.offlinePayments() });
    },
    ...options,
  });
};
