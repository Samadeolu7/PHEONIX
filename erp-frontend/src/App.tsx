import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';

import { AuthProvider } from './contexts/AuthContext';
import { DomainLabelProvider } from './contexts/DomainLabelContext';
import { ToastProvider } from './contexts/ToastContext';
import { SearchProvider } from './contexts/SearchContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ForbiddenPage, NotFoundPage } from './pages/error/ErrorPage';
import RoleBasedLayout from './components/layout/RoleBasedLayout';

import { DashboardThemeProvider } from './contexts/DashboardThemeContext';
import { queryClient } from './lib/queryClient';

// Enhanced error handling components
import ReceivablesErrorBoundary from './components/ui/ErrorBoundary';
import GlobalProgressOverlay from './components/ui/GlobalProgressOverlay';
import GlobalErrorBoundary from './components/error/GlobalErrorBoundary';
import { ErrorAndLoadingProvider } from './contexts/ErrorAndLoadingContext';
import { GlobalIndicators } from './components/ui/GlobalIndicators';

// Loading component
const PageLoader = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666',
    }}
  >
    Loading...
  </div>
);

// Only eager-load authentication pages for faster initial login
import LoginPageStyled from './components/auth/LoginPageStyled';
import RegisterPage from './components/auth/RegisterPage';

// Home page — lazy loaded (only needed after login, not on the login screen)
const HomePageWithNavigation = lazy(() => import('./pages/HomePageWithNavigation'));

// Module + demo pages — lazy loaded
const SearchDemoPage = lazy(() => import('./pages/SearchDemoPage'));
const NavigationTestPage = lazy(() => import('./pages/NavigationTestPage'));
const FinancialManagementPage = lazy(() =>
  import('./pages/modules/FinancialManagementPage').then(m => ({
    default: m.FinancialManagementPage,
  }))
);
const AdministrationPage = lazy(() =>
  import('./pages/modules/AdministrationPage').then(m => ({ default: m.AdministrationPage }))
);

const StudentServicesPage = lazy(() =>
  import('./pages/modules/StudentServicesPage').then(m => ({ default: m.StudentServicesPage }))
);
const AllAccessPage = lazy(() =>
  import('./pages/modules/AllAccessPage').then(m => ({ default: m.AllAccessPage }))
);
const InventoryModulePage = lazy(() =>
  import('./pages/modules/InventoryModulePage').then(m => ({ default: m.InventoryModulePage }))
);
const ProcurementModulePage = lazy(() =>
  import('./pages/modules/ProcurementModulePage').then(m => ({
    default: m.ProcurementModulePage,
  }))
);
const FixedAssetModulePage = lazy(() =>
  import('./pages/modules/FixedAssetModulePage').then(m => ({ default: m.FixedAssetModulePage }))
);
const PettyCashModulePage = lazy(() =>
  import('./pages/modules/PettyCashModulePage').then(m => ({ default: m.PettyCashModulePage }))
);
const BankModulePage = lazy(() =>
  import('./pages/modules/BankModulePage').then(m => ({ default: m.BankModulePage }))
);
const ReceivableModulePage = lazy(() =>
  import('./pages/modules/ReceivableModulePage').then(m => ({ default: m.ReceivableModulePage }))
);
const SavingsModulePage = lazy(() =>
  import('./pages/modules/SavingsModulePage').then(m => ({ default: m.SavingsModulePage }))
);
const LoansModulePage = lazy(() =>
  import('./pages/modules/LoansModulePage').then(m => ({ default: m.LoansModulePage }))
);
const AccountsPayableModulePage = lazy(() =>
  import('./pages/modules/AccountsPayablePage').then(m => ({ default: m.AccountsPayablePage }))
);

// Debug components
const ToastTest = lazy(() => import('./components/debug/ToastTest'));
const BulkInvoiceWizardDemo = lazy(() => import('./pages/BulkInvoiceWizardDemo'));
const BulkInvoiceResults = lazy(() => import('./pages/BulkInvoiceResults'));
const AccessControlDemo = lazy(() => import('./pages/AccessControlDemo'));
const NavigationTest = lazy(() => import('./components/navigation/NavigationTest'));
const DashboardTest = lazy(() => import('./components/dashboard/DashboardTest'));
const ModuleNavigationDemoPage = lazy(() => import('./pages/ModuleNavigationDemoPage'));

// const StatsManagementDemoPage = lazy(() => import('./pages/StatsManagementDemoPage'));
const DashboardIntegrationDemoPage = lazy(() => import('./pages/DashboardIntegrationDemoPage'));
const ErrorHandlingDemoPage = lazy(() => import('./pages/ErrorHandlingDemoPage'));

// Lazy load all other pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

const RoleBasedDashboardPage = lazy(() => import('./pages/RoleBasedDashboardPage'));
const WorkflowCentricDashboardPage = lazy(() => import('./pages/WorkflowCentricDashboardPage'));
const DashboardDemoPage = lazy(() => import('./pages/DashboardDemoPage'));
const DashboardSetupPageStyled = lazy(() => import('./pages/DashboardSetupPageStyled'));
const DashboardSelection = lazy(() => import('./pages/DashboardSelection'));
const DashboardSettingsPage = lazy(() => import('./pages/DashboardSettingsPage'));
const AutomationTemplatesPage = lazy(() => import('./pages/AutomationTemplatesPage'));
const RunAutomationPage = lazy(() => import('./pages/RunAutomationPage'));
const AutomationRunsPage = lazy(() => import('./pages/AutomationRunsPage'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const UnifiedPendingApprovalsPage = lazy(() => import('./pages/UnifiedPendingApprovalsPage'));
const VisualWorkflowBuilder = lazy(() => import('./components/workflow/VisualWorkflowBuilder'));
const DynamicModulePage = lazy(() => import('./pages/DynamicModulePage'));
const DashboardDebugTest = lazy(() => import('./pages/DashboardDebugTest'));
const DashboardCreatePage = lazy(() => import('./pages/DashboardCreatePage'));
const RefreshTokenTest = lazy(() => import('./components/debug/RefreshTokenTest'));
const RoleSidebarConfigPage = lazy(() => import('./pages/settings/RoleSidebarConfigPage'));
const ReportsListPage = lazy(() => import('./pages/ReportsListPage'));

// Form/Workflow pages
const AdminFormsPage = lazy(() => import('./pages/admin/AdminFormsPage'));
const AdminWorkflowsPage = lazy(() => import('./pages/admin/AdminWorkflowsPage'));
const AdminSubmissionsPage = lazy(() => import('./pages/admin/AdminSubmissionsPage'));
const UserFormsPage = lazy(() => import('./pages/user/UserFormsPage'));
const UserFormViewPage = lazy(() => import('./pages/user/UserFormViewPage'));
const UserSubmissionsPage = lazy(() => import('./pages/user/UserSubmissionsPage'));

// Account Management pages
const UnifiedAccountCreationPage = lazy(() => import('./pages/UnifiedAccountCreationPage'));
const AccountsListPage = lazy(() => import('./pages/AccountsListPage'));
const AccountSummaryPage = lazy(() => import('./pages/AccountSummaryPage'));
const AccountLedgerPage = lazy(() => import('./pages/AccountLedgerPage'));
const ProductManagementPage = lazy(() => import('./pages/ProductManagementPage'));
const AccountSettingsPage = lazy(() => import('./pages/account/AccountSettingsPage'));

// Admin pages
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const AccessControlPage = lazy(() => import('./pages/admin/AccessControlPage'));
const RolesPermissionsMatrixPage = lazy(() => import('./pages/admin/RolesPermissionsMatrixPage'));
const DashboardAssignmentPage = lazy(() => import('./pages/admin/DashboardAssignmentPage'));
const DashboardBuilderPage = lazy(() => import('./pages/admin/DashboardBuilderPage'));
const UserPermissionOverridePage = lazy(() => import('./pages/admin/UserPermissionOverridePage'));
const PermissionExceptionReportPage = lazy(() => import('./pages/admin/PermissionExceptionReportPage'));
const PermissionElevationLogPage = lazy(() => import('./pages/admin/PermissionElevationLogPage'));

// Settings pages
const UserSettingsPage = lazy(() => import('./pages/settings/UserSettingsPage'));
const UserProfilePage = lazy(() => import('./pages/profile/UserProfilePage'));
// const PagesActionsSettingsPage = lazy(() => import('./pages/settings/PagesActionsSettingsPage'));
// const UserPreferencesDemoPage = lazy(() => import('./pages/UserPreferencesDemoPage'));

// Final Polish Demo Page
const FinalPolishDemoPage = lazy(() => import('./pages/FinalPolishDemoPage'));

// Navigation and Quick Access pages
const NewPagesIndex = lazy(() => import('./pages/NewPagesIndex'));

// Client Management pages
const ClientFormPage = lazy(() => import('./pages/clients/ClientFormPage'));
const ClientDetailPage = lazy(() => import('./pages/clients/ClientDetailPage'));
const ClientLedgerPage = lazy(() => import('./pages/clients/ClientLedgerPage'));
const ClientBulkImportPage = lazy(() => import('./pages/clients/ClientBulkImportPage'));
const StudentFeeExcelImportPage = lazy(() => import('./pages/clients/StudentFeeExcelImportPage'));
const ClientClassificationsPage = lazy(() => import('./pages/ClientClassificationsPage'));
const ClientListPage = lazy(() => import('./pages/clients/ClientListPage'));
const ClientRegistrationConfigPage = lazy(
  () => import('./pages/clients/ClientRegistrationConfigPage')
);
const ProspectPublicRegistrationPage = lazy(
  () => import('./pages/clients/ProspectPublicRegistrationPage')
);

// Income Report pages
const IncomeReportsDashboardPage = lazy(() => import('./pages/incomes/reports/IncomeReportsDashboardPage'));
const IncomeByCategoryPage = lazy(() => import('./pages/incomes/reports/IncomeByCategoryPage'));
const IncomeByServiceItemPage = lazy(() => import('./pages/incomes/reports/IncomeByServiceItemPage'));
const IncomeByPeriodPage = lazy(() => import('./pages/incomes/reports/IncomeByPeriodPage'));
const IncomeByClientPage = lazy(() => import('./pages/incomes/reports/IncomeByClientPage'));

// Income Fee Structure pages
const AcademicSessionPage = lazy(() => import('./pages/incomes/AcademicSessionPage'));
const IncomeFeeStructureSetupPage = lazy(() => import('./pages/IncomeFeeStructureSetupPage'));
const IncomeFeeStructureListPage = lazy(() => import('./pages/IncomeFeeStructureListPage'));
const ServiceItemListPage = lazy(() => import('./pages/ServiceItemListPage'));
const FeeStructureForm = lazy(() => import('./pages/FeeStructureForm'));
const FeeStructureApprovalPage = lazy(() => import('./pages/FeeStructureApprovalPage'));
const BatchReviewPage = lazy(() => import('./pages/BatchReviewPage'));
const IncomeCategoryListPage = lazy(() => import('./pages/IncomeCategoryListPage'));
const EntitlementsList = lazy(() => import('./pages/EntitlementsList'));
const EntitlementDetail = lazy(() => import('./pages/EntitlementDetail'));
const EntitlementForm = lazy(() => import('./pages/EntitlementForm'));
const EntitlementDashboard = lazy(() => import('./pages/EntitlementDashboard'));

// Procurement pages
const SupplierListPage = lazy(() => import('./pages/procurement/SupplierListPage'));
const SupplierFormPage = lazy(() => import('./pages/procurement/SupplierFormPage'));
const SupplierDetailPage = lazy(() => import('./pages/procurement/SupplierDetailPage'));
const ProcurementIndexPage = lazy(() => import('./pages/procurement/ProcurementIndexPage'));
const RequisitionListPage = lazy(() => import('./pages/procurement/RequisitionListPage'));
const RequisitionFormPageSimplified = lazy(
  () => import('./pages/procurement/RequisitionFormPageSimplified')
);
const RequisitionDetailPage = lazy(() => import('./pages/procurement/RequisitionDetailPage'));
const GRNListPage = lazy(() => import('./pages/procurement/GRNListPage'));
const GRNFormPage = lazy(() => import('./pages/procurement/GRNFormPage'));
const GRNDetailPage = lazy(() => import('./pages/procurement/GRNDetailPage'));
const GRNQualityCheckPage = lazy(() => import('./pages/procurement/GRNQualityCheckPage'));
const ReturnListPage = lazy(() => import('./pages/procurement/ReturnListPage'));
const ReturnFormPage = lazy(() => import('./pages/procurement/ReturnFormPage'));
const ReturnDetailPage = lazy(() => import('./pages/procurement/ReturnDetailPage'));
const QuoteListPage = lazy(() => import('./pages/procurement/QuoteListPage'));
const QuoteDetailPage = lazy(() => import('./pages/procurement/QuoteDetailPage'));
const QuoteComparisonPage = lazy(() => import('./pages/procurement/QuoteComparisonPage'));
const ThreeWayMatchingDashboard = lazy(
  () => import('./pages/procurement/ThreeWayMatchingDashboard')
);
const ProcurementConfigPage = lazy(() => import('./pages/procurement/ProcurementConfigPage'));

// Additional Automation pages
const AutomationTemplateDetailPage = lazy(() => import('./pages/AutomationTemplateDetailPage'));
const AutomationRunDetailPage = lazy(() => import('./pages/AutomationRunDetailPage'));
const ApprovalHistoryPage = lazy(() => import('./pages/ApprovalHistoryPage'));

// Inventory and Procurement pages
const StockMovementTracker = lazy(() => import('./pages/StockMovementTracker'));
const PurchaseOrderManager = lazy(() => import('./pages/PurchaseOrderManager'));
const PurchaseOrderListPage = lazy(() => import('./pages/procurement/PurchaseOrderListPage'));
const PurchaseOrderFormPage = lazy(() => import('./pages/procurement/PurchaseOrderFormPage'));
const PurchaseOrderDetailPage = lazy(() => import('./pages/procurement/PurchaseOrderDetailPage'));

// Inventory Management pages
const InventoryIndexPage = lazy(() => import('./pages/inventory/InventoryIndexPage'));
const InventoryItemsPage = lazy(() => import('./pages/inventory/InventoryItemsPage'));
const InventoryItemFormPage = lazy(() => import('./pages/inventory/InventoryItemFormPage'));
const InventoryItemDetailPage = lazy(() => import('./pages/inventory/InventoryItemDetailPage'));
const StockMovementsPage = lazy(() => import('./pages/inventory/StockMovementsPage'));
const StockLocationsPage = lazy(() => import('./pages/inventory/StockLocationsPage'));
const StockAdjustmentsListPage = lazy(() => import('./pages/inventory/StockAdjustmentsListPage'));
const StockAdjustmentDetailPage = lazy(() => import('./pages/inventory/StockAdjustmentDetailPage'));
const StockAdjustmentPage = lazy(() => import('./pages/inventory/StockAdjustmentPage'));
const StockTransferPage = lazy(() => import('./pages/inventory/StockTransferPage'));
const StockTransferListPage = lazy(() => import('./pages/inventory/StockTransferListPage'));
const StockTransferDetailPage = lazy(() => import('./pages/inventory/StockTransferDetailPage'));
const StockValuationReportPage = lazy(() => import('./pages/inventory/StockValuationReportPage'));

// Material Request and Ledger pages
const MaterialRequestList = lazy(() => import('./pages/inventory/MaterialRequestList'));
const MaterialRequestCreate = lazy(() => import('./pages/inventory/MaterialRequestCreate'));
const MaterialRequestDetail = lazy(() => import('./pages/inventory/MaterialRequestDetail'));
const OfficeUseRequestList = lazy(() => import('./pages/inventory/OfficeUseRequestList'));
const OfficeUseRequestCreate = lazy(() => import('./pages/inventory/OfficeUseRequestCreate'));
const OfficeUseRequestDetail = lazy(() => import('./pages/inventory/OfficeUseRequestDetail'));
const InventoryLedger = lazy(() => import('./pages/inventory/InventoryLedger'));
const SalesOrderListPage = lazy(() => import('./pages/inventory/SalesOrderListPage'));
const SalesOrderFormPage = lazy(() => import('./pages/inventory/SalesOrderFormPage'));
const SalesOrderDetailPage = lazy(() => import('./pages/inventory/SalesOrderDetailPage'));
const AllocationListPage = lazy(() => import('./pages/inventory/AllocationListPage'));
const AllocationDetailPage = lazy(() => import('./pages/inventory/AllocationDetailPage'));
const RedemptionListPage = lazy(() => import('./pages/inventory/RedemptionListPage'));
const WriteOffListPage = lazy(() => import('./pages/inventory/WriteOffListPage'));
const WriteOffFormPage = lazy(() => import('./pages/inventory/WriteOffFormPage'));
const StockReorderPage = lazy(() => import('./pages/inventory/StockReorderPage'));
const PhysicalCountListPage = lazy(() => import('./pages/inventory/PhysicalCountList'));
const PhysicalCountFormPage = lazy(() => import('./pages/inventory/PhysicalCountForm'));
const InitialStockImportPage = lazy(() => import('./pages/inventory/InitialStockImportPage'));
const AccountLedger = lazy(() => import('./pages/accounts/AccountLedger'));
const ClientStatement = lazy(() => import('./pages/clients/ClientStatement'));

// Unified Receivables System pages
const ReceivablesDashboard = lazy(() => import('./pages/receivables/ReceivablesDashboard'));
const ReceivablesList = lazy(() => import('./pages/receivables/ReceivablesList'));
const RecordPayment = lazy(() => import('./pages/receivables/RecordPayment'));
const AgingReport = lazy(() => import('./pages/receivables/AgingReport'));
const ReceivableDetail = lazy(() => import('./pages/receivables/ReceivableDetail'));
const CollectionsDashboard = lazy(() => import('./pages/receivables/CollectionsDashboard'));
const CollectionWorkbench = lazy(() => import('./pages/receivables/CollectionWorkbench'));
const ReminderManagement = lazy(() => import('./pages/receivables/ReminderManagement'));
const AutomatedWorkflowsPage = lazy(() => import('./pages/receivables/AutomatedWorkflowsPage'));
const AdvancedReporting = lazy(() => import('./pages/receivables/AdvancedReporting'));
const PaymentTrends = lazy(() => import('./pages/receivables/PaymentTrends'));
const CustomerStatements = lazy(() => import('./pages/receivables/CustomerStatements'));
const StatementPreviewTest = lazy(() => import('./pages/receivables/StatementPreviewTest'));
const DataConsistencyPage = lazy(() => import('./pages/receivables/DataConsistencyPage'));
const BulkPaymentUpload = lazy(() => import('./pages/receivables/BulkPaymentUpload'));
const PaymentPlanListPage = lazy(() => import('./pages/receivables/PaymentPlanListPage'));
const InvoicesList = lazy(() => import('./pages/sales/InvoicesList'));
const CreateInvoice = lazy(() => import('./pages/sales/CreateInvoice'));
const CreateInventoryInvoice = lazy(() => import('./pages/sales/CreateInventoryInvoice'));
const InvoiceDetail = lazy(() => import('./pages/sales/InvoiceDetail'));
const InvoiceForm = lazy(() => import('./pages/sales/InvoiceForm'));
const UnifiedInvoiceForm = lazy(() => import('./pages/sales/CreateUnifiedInvoice'));
// import CreateUnifiedInvoice from './pages/sales/CreateUnifiedInvoice';
const CreditNotesList = lazy(() => import('./pages/sales/CreditNotesList'));
const CreateCreditNote = lazy(() => import('./pages/sales/CreateCreditNote'));
const CreditNoteDetail = lazy(() => import('./pages/sales/CreditNoteDetail'));
const EditCreditNote = lazy(() => import('./pages/sales/EditCreditNote'));
const StandaloneCreditNotesList = lazy(() => import('./pages/sales/StandaloneCreditNotesList'));

// Journal Voucher pages
const JournalVoucherListPage = lazy(() => import('./pages/accounting/JournalVoucherListPage'));
const JournalVoucherFormPage = lazy(() => import('./pages/accounting/JournalVoucherFormPage'));
const JournalVoucherDetailPage = lazy(() => import('./pages/accounting/JournalVoucherDetailPage'));
const PeriodManagementPage = lazy(() => import('./pages/accounting/PeriodManagementPage'));

// Discount/Scholarship System pages
const DiscountProgramsList = lazy(() => import('./pages/discounts/DiscountProgramsList'));
const DiscountProgramForm = lazy(() => import('./pages/discounts/DiscountProgramForm'));
const DiscountProgramDetail = lazy(() => import('./pages/discounts/DiscountProgramDetail'));
const DiscountApplicationsList = lazy(() => import('./pages/discounts/DiscountApplicationsList'));
const DiscountApplicationForm = lazy(() => import('./pages/discounts/DiscountApplicationForm'));
const DiscountApplicationDetail = lazy(() => import('./pages/discounts/DiscountApplicationDetail'));
const AppliedDiscountsList = lazy(() => import('./pages/discounts/AppliedDiscountsList'));
const ApplyDiscountPage = lazy(() => import('./pages/discounts/ApplyDiscountPage'));
const AutoApplyDiscountPage = lazy(() => import('./pages/discounts/AutoApplyDiscountPage'));
const DiscountAnalyticsDashboard = lazy(
  () => import('./pages/discounts/DiscountAnalyticsDashboard')
);

// Report pages
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'));
const AccountHierarchyPage = lazy(() => import('./pages/AccountHierarchyPage'));
const LedgerSearchPage = lazy(() => import('./pages/LedgerSearchPage'));
const ReportViewPage = lazy(() => import('./pages/ReportViewPage'));

// Fixed Asset Management pages
const AssetListPage = lazy(() => import('./pages/assets/AssetListPage'));
const AssetDetailPage = lazy(() => import('./pages/assets/AssetDetailPage'));
const AssetFormPage = lazy(() => import('./pages/assets/AssetFormPage'));
const AssetFuelMonitorPage = lazy(() => import('./pages/assets/AssetFuelMonitorPage'));
const AssetCategoryListPage = lazy(() => import('./pages/assets/AssetCategoryListPage'));
const AssetCategoryFormPage = lazy(() => import('./pages/assets/AssetCategoryFormPage'));
const DepreciationRunPage = lazy(() => import('./pages/assets/DepreciationRunPage'));
const AssetPurchaseListPage = lazy(() => import('./pages/assets/AssetPurchaseListPage'));
const AssetPurchaseFormPage = lazy(() => import('./pages/assets/AssetPurchaseFormPage'));
const AssetMaintenanceListPage = lazy(() => import('./pages/assets/AssetMaintenanceListPage'));
const AssetMaintenanceFormPage = lazy(() => import('./pages/assets/AssetMaintenanceFormPage'));
const AssetDepreciationListPage = lazy(() => import('./pages/assets/AssetDepreciationListPage'));
const AssetDisposalPage = lazy(() => import('./pages/assets/AssetDisposalPage'));

// Admin Management pages
const BranchListPage = lazy(() => import('./pages/admin/BranchListPage'));
const BranchFormPage = lazy(() => import('./pages/admin/BranchFormPage'));
const TenantListPage = lazy(() => import('./pages/admin/TenantListPage'));
const TenantFormPage = lazy(() => import('./pages/admin/TenantFormPage'));

const HRIndexPage = lazy(() => import('./pages/hr/HRIndexPage'));
const HRDashboardPage = lazy(() => import('./pages/hr/HRDashboardPage'));
const HRConfigPage = lazy(() => import('./pages/hr/HRConfigPage'));
const StaffListPage = lazy(() => import('./pages/hr/StaffListPage'));
const StaffFormPage = lazy(() => import('./pages/hr/StaffFormPage'));
const StaffDetailPage = lazy(() => import('./pages/hr/StaffDetailPage'));
const SalaryComponentsListPage = lazy(() => import('./pages/hr/SalaryComponentsListPage'));
const SalaryComponentFormPage = lazy(() => import('./pages/hr/SalaryComponentFormPage'));
const StaffPayComponentsPage = lazy(() => import('./pages/hr/StaffPayComponentsPage'));
const PayComponentRemovalListPage = lazy(() => import('./pages/hr/PayComponentRemovalListPage'));
const BonusDeductionListPage = lazy(() => import('./pages/hr/BonusDeductionListPage'));
const BonusDeductionFormPage = lazy(() => import('./pages/hr/BonusDeductionFormPage'));
const BonusDeductionDetailPage = lazy(() => import('./pages/hr/BonusDeductionDetailPage'));
const StaffIOUListPage = lazy(() => import('./pages/hr/StaffIOUListPage'));
const StaffIOUFormPage = lazy(() => import('./pages/hr/StaffIOUFormPage'));
const BulkStaffDebitPage = lazy(() => import('./pages/hr/BulkStaffDebitPage'));
const StaffIOUDetailPage = lazy(() => import('./pages/hr/StaffIOUDetailPage'));
const LeaveBalancesListPage = lazy(() => import('./pages/hr/LeaveBalancesListPage'));
const ClockInOutPage = lazy(() => import('./pages/hr/ClockInOutPage'));
const PayslipDetailPage = lazy(() => import('./pages/hr/PayslipDetailPage'));
const PayslipListPage = lazy(() => import('./pages/hr/PayslipListPage'));
const LeaveTypesListPage = lazy(() => import('./pages/hr/LeaveTypesListPage'));
const LeaveTypeFormPage = lazy(() => import('./pages/hr/LeaveTypeFormPage'));
const LeaveRequestsListPage = lazy(() => import('./pages/hr/LeaveRequestsListPage'));
const LeaveRequestFormPage = lazy(() => import('./pages/hr/LeaveRequestFormPage'));
const LeaveRequestDetailPage = lazy(() => import('./pages/hr/LeaveRequestDetailPage'));
const LeaveCalendarPage = lazy(() => import('./pages/hr/LeaveCalendarPage'));
const EmployeeSelfServicePage = lazy(() => import('./pages/hr/EmployeeSelfServicePage'));
const AttendanceListPage = lazy(() => import('./pages/hr/AttendanceListPage'));
const AttendanceFormPage = lazy(() => import('./pages/hr/AttendanceFormPage'));
const AttendanceDetailPage = lazy(() => import('./pages/hr/AttendanceDetailPage'));
const PayrollListPage = lazy(() => import('./pages/hr/PayrollListPage'));
const PayrollFormPage = lazy(() => import('./pages/hr/PayrollFormPage'));
const PayrollDetailPage = lazy(() => import('./pages/hr/PayrollDetailPage'));
const PayrollScheduleListPage = lazy(() => import('./pages/hr/PayrollScheduleListPage'));
const PayrollScheduleFormPage = lazy(() => import('./pages/hr/PayrollScheduleFormPage'));
const PensionRemittancePage = lazy(() => import('./pages/hr/PensionRemittancePage'));
const StaffExcelImportPage = lazy(() => import('./pages/hr/StaffExcelImportPage'));
const EmployeeDocumentsPage = lazy(() => import('./pages/hr/EmployeeDocumentsPage'));

// Resource Consumption pages
const ResourceConsumptionListPage = lazy(
  () => import('./pages/expenses/ResourceConsumptionListPage')
);
const ResourceConsumptionFormPage = lazy(
  () => import('./pages/expenses/ResourceConsumptionFormPage')
);
const ResourceConsumptionDetailPage = lazy(
  () => import('./pages/expenses/ResourceConsumptionDetailPage')
);
const IrregularitiesDashboardPage = lazy(
  () => import('./pages/expenses/IrregularitiesDashboardPage')
);
const FuelConsumptionReportPage = lazy(
  () => import('./pages/expenses/FuelConsumptionReportPage')
);
const ApprovalQueuePage = lazy(() => import('./pages/expenses/ApprovalQueuePage'));
const ApprovalDetailPage = lazy(() => import('./pages/expenses/ApprovalDetailPage'));
const PostingQueuePage = lazy(() => import('./pages/expenses/PostingQueuePage'));
const PostingDetailPage = lazy(() => import('./pages/expenses/PostingDetailPage'));

// Resource Management pages
const ResourceListPage = lazy(() => import('./pages/expenses/ResourceListPage'));
const ResourceFormPage = lazy(() => import('./pages/expenses/ResourceFormPage'));
const ResourceDetailPage = lazy(() => import('./pages/expenses/ResourceDetailPage'));

// Voucher Management pages
const VoucherListPage = lazy(() => import('./pages/expenses/VoucherListPage'));
const VoucherFormPage = lazy(() => import('./pages/expenses/VoucherFormPage'));
const VoucherDetailPage = lazy(() => import('./pages/expenses/VoucherDetailPage'));
const ExpiringVouchersDashboard = lazy(() => import('./pages/expenses/ExpiringVouchersDashboard'));

// Simplified Fuel Log
const FuelLogFormPage = lazy(() => import('./pages/expenses/FuelLogFormPage'));

// Expense Category Management pages
const ExpenseCategoryListPage = lazy(() => import('./pages/expenses/ExpenseCategoryListPage'));
const ExpenseCategoryFormPage = lazy(() => import('./pages/expenses/ExpenseCategoryFormPage'));

// Prepaid Expense Management pages
const PrepaidExpenseListPage = lazy(() => import('./pages/expenses/PrepaidExpenseListPage'));
const PrepaidExpenseFormPage = lazy(() => import('./pages/expenses/PrepaidExpenseFormPage'));
const PrepaidExpenseDetailPage = lazy(() => import('./pages/expenses/PrepaidExpenseDetailPage'));
const PrepaidExpenseAmortizePage = lazy(
  () => import('./pages/expenses/PrepaidExpenseAmortizePage')
);

// Financial Reports pages
const TrialBalancePage = lazy(() => import('./pages/financialReports/TrialBalancePage'));
const ProfitLossPage = lazy(() => import('./pages/financialReports/ProfitLossPage'));
const BalanceSheetPage = lazy(() => import('./pages/financialReports/BalanceSheetPage'));
const CashFlowStatementPage = lazy(() => import('./pages/financialReports/CashFlowStatementPage'));

// Treasury / Cash Management pages
const TreasuryModulePage = lazy(() => import('./pages/treasury/TreasuryModulePage'));
const TreasuryDashboard = lazy(() => import('./pages/treasury/TreasuryDashboard'));
const BankReconciliationPage = lazy(() => import('./pages/treasury/BankReconciliationPage'));
const CashReconciliationPage = lazy(() => import('./pages/treasury/CashReconciliationPage'));

// Petty Cash Management pages
const PettyCashDashboard = lazy(() =>
  import('./pages/treasury/PettyCashDashboard').then(m => ({ default: m.PettyCashDashboard }))
);
const PettyCashFundForm = lazy(() =>
  import('./pages/treasury/PettyCashFundForm').then(m => ({ default: m.PettyCashFundForm }))
);
const PettyCashFundDetail = lazy(() =>
  import('./pages/treasury/PettyCashFundDetail').then(m => ({ default: m.PettyCashFundDetail }))
);
const PettyCashVoucherList = lazy(() =>
  import('./pages/treasury/PettyCashVoucherList').then(m => ({ default: m.PettyCashVoucherList }))
);
const PettyCashVoucherForm = lazy(() =>
  import('./pages/treasury/PettyCashVoucherForm').then(m => ({ default: m.PettyCashVoucherForm }))
);
const PettyCashVoucherDetail = lazy(() =>
  import('./pages/treasury/PettyCashVoucherDetail').then(m => ({
    default: m.PettyCashVoucherDetail,
  }))
);
const PettyCashReplenishmentList = lazy(() =>
  import('./pages/treasury/PettyCashReplenishmentList').then(m => ({
    default: m.PettyCashReplenishmentList,
  }))
);
const PettyCashReplenishmentForm = lazy(() =>
  import('./pages/treasury/PettyCashReplenishmentForm').then(m => ({
    default: m.PettyCashReplenishmentForm,
  }))
);
const PettyCashReplenishmentDetail = lazy(() =>
  import('./pages/treasury/PettyCashReplenishmentDetail').then(m => ({
    default: m.PettyCashReplenishmentDetail,
  }))
);
const CashierAccountListPage = lazy(() => import('./pages/treasury/CashierAccountListPage'));
const CashierAccountFormPage = lazy(() => import('./pages/treasury/CashierAccountFormPage'));
const CashTransferListPage = lazy(() => import('./pages/treasury/CashTransferListPage'));
const CashTransferFormPage = lazy(() => import('./pages/treasury/CashTransferFormPage'));

// General Expense pages
const ExpenseListPage = lazy(() => import('./pages/expenses/ExpenseListPage'));
const ExpenseFormPage = lazy(() => import('./pages/expenses/ExpenseFormPage'));
const ExpenseDetailPage = lazy(() => import('./pages/expenses/ExpenseDetailPage'));

// Bank Statement Reconciliation (Feature #2)
const BankStatementUploadPage = lazy(() => import('./pages/banks/BankStatementUploadPage'));

// Bank Management pages
const BankListPage = lazy(() => import('./pages/banks/BankListPage'));
const BankFormPage = lazy(() => import('./pages/banks/BankFormPage'));
const BankSetupPage = lazy(() => import('./pages/banks/BankSetupPage'));
const BankAccountListPage = lazy(() => import('./pages/banks/BankAccountListPage'));
const BankAccountFormPage = lazy(() => import('./pages/banks/BankAccountFormPage'));
const BankAccountDetailPage = lazy(() => import('./pages/banks/BankAccountDetailPage'));
const BankTransferListPage = lazy(() => import('./pages/banks/BankTransferListPage'));
const BankTransferFormPage = lazy(() => import('./pages/banks/BankTransferFormPage'));
const TransferApprovalPage = lazy(() => import('./pages/banks/TransferApprovalPage'));
const BankPaymentListPage = lazy(() => import('./pages/banks/BankPaymentListPage'));
const BankPaymentFormPage = lazy(() => import('./pages/banks/BankPaymentFormPage'));

// Budget pages
const BudgetPeriodList = lazy(() => import('./pages/budgets/BudgetPeriodList'));
const BudgetPeriodFormPage = lazy(() => import('./pages/budgets/BudgetPeriodFormPage'));
const BudgetPeriodDetailPage = lazy(() => import('./pages/budgets/BudgetPeriodDetailPage'));
const BudgetVarianceReportPage = lazy(() => import('./pages/budgets/BudgetVarianceReportPage'));

// Loan Workflow pages (Feature #10, #11, #12)
const LoanVerificationPage = lazy(() => import('./pages/loans/LoanVerificationPage'));
const LoanDisbursementPage = lazy(() => import('./pages/loans/LoanDisbursementPage'));

// Business Day Management page (Feature #3)
const BusinessDayManagementPage = lazy(() => import('./pages/common/BusinessDayManagementPage'));

// Daily Collection Sheet page (Feature #8, #13, #14)
const DailyCollectionSheetPage = lazy(() => import('./pages/cash-management/DailyCollectionSheetPage'));

// Savings Collection page (Feature #1 — Savings Cycles)
const SavingsCollectionPage = lazy(() => import('./pages/savings/SavingsCollectionPage'));

// Savings Accounts list page
const SavingsAccountsPage = lazy(() => import('./pages/savings/SavingsAccountsPage'));

// Savings Account detail page
const SavingsAccountDetailPage = lazy(() => import('./pages/savings/SavingsAccountDetailPage'));

// Savings new account form & policy
const SavingsAccountFormPage = lazy(() => import('./pages/savings/SavingsAccountFormPage'));
const SavingsPolicyPage = lazy(() => import('./pages/savings/SavingsPolicyPage'));
const SavingsProductConfigPage = lazy(() => import('./pages/savings/SavingsProductConfigPage'));
const SavingsWithdrawalsPage = lazy(() => import('./pages/savings/SavingsWithdrawalsPage'));

// Loan Accounts list page
const LoanAccountsPage = lazy(() => import('./pages/loans/LoanAccountsPage'));

// Loan Account detail page
const LoanAccountDetailPage = lazy(() => import('./pages/loans/LoanAccountDetailPage'));

// Loan Collection page
const LoanCollectionPage = lazy(() => import('./pages/loans/LoanCollectionPage'));

// Loan repayment approvals (director inbox)
const LoanRepaymentApprovalsPage = lazy(() => import('./pages/loans/LoanRepaymentApprovalsPage'));

// Loan new application form & products
const LoanAccountFormPage = lazy(() => import('./pages/loans/LoanAccountFormPage'));
const LoanProductsPage = lazy(() => import('./pages/loans/LoanProductsPage'));
const LoanProductConfigPage = lazy(() => import('./pages/loans/LoanProductConfigPage'));

// Client management additions
const ClientGroupsPage = lazy(() => import('./pages/clients/ClientGroupsPage'));
const ProspectListPage = lazy(() => import('./pages/clients/ProspectListPage'));
const ReactivateClientPage = lazy(() => import('./pages/clients/ReactivateClientPage'));

// Savings — Combined Receipt & Thrift
const CombinedReceiptPage = lazy(() => import('./pages/savings/CombinedReceiptPage'));
const GroupCombinedReceiptPage = lazy(() => import('./pages/savings/GroupCombinedReceiptPage'));
const ThriftSetupPage = lazy(() => import('./pages/savings/thrift/ThriftSetupPage'));
const ThriftMonthlyPage = lazy(() => import('./pages/savings/thrift/ThriftMonthlyPage'));
const ThriftSmartPage = lazy(() => import('./pages/savings/thrift/ThriftSmartPage'));
const ThriftCollectionPage = lazy(() => import('./pages/savings/thrift/ThriftCollectionPage'));
const ThriftSpreadsheetPage = lazy(() => import('./pages/savings/thrift/ThriftSpreadsheetPage'));
const ThriftMultiDayPage = lazy(() => import('./pages/savings/thrift/ThriftMultiDayPage'));

// Loan & Savings reports
const DebtorsReportPage = lazy(() => import('./pages/reports/loans/DebtorsReportPage'));
const DefaultersReportPage = lazy(() => import('./pages/reports/loans/DefaultersReportPage'));
const PARReportPage = lazy(() => import('./pages/reports/loans/PARReportPage'));
const RemittanceReportPage = lazy(() => import('./pages/reports/loans/RemittanceReportPage'));
const DailySummaryReportPage = lazy(() => import('./pages/reports/DailySummaryReportPage'));
const GroupReportPage = lazy(() => import('./pages/reports/GroupReportPage'));
const ThriftReportPage = lazy(() => import('./pages/reports/ThriftReportPage'));
const DailyContributionReportPage = lazy(() => import('./pages/reports/DailyContributionReportPage'));
const DCSpreadsheetReportPage = lazy(() => import('./pages/reports/DCSpreadsheetReportPage'));
const ReportSummaryPage = lazy(() => import('./pages/reports/ReportSummaryPage'));

// Admin operations
const TransactionReversalPage = lazy(() => import('./pages/admin/TransactionReversalPage'));
const ReviewWeekPage = lazy(() => import('./pages/admin/ReviewWeekPage'));
const CloseYearPage = lazy(() => import('./pages/admin/CloseYearPage'));

// Profile
const ChangePasswordPage = lazy(() => import('./pages/profile/ChangePasswordPage'));

// Liabilities / Accounts Payable pages
const PayablesListPage = lazy(() => import('./pages/liabilities/PayablesListPage'));
const PayableDetailPage = lazy(() => import('./pages/liabilities/PayableDetailPage'));
const CreatePayablePage = lazy(() => import('./pages/liabilities/CreatePayablePage'));
const PayableMatchingDashboard = lazy(() => import('./pages/liabilities/PayableMatchingDashboard'));
const VendorApAgingPage = lazy(() => import('./pages/liabilities/VendorApAgingPage'));

function App() {
  const [tenantTheme] = React.useState({
    primaryColor: '#1a73e8',
    secondaryColor: '#4285f4',
    textPrimaryColor: '#2c3e50',
    textSecondaryColor: '#4a5568',
    borderColor: '#e2e8f0',
    widgetBgColor: '#ffffff',
    contentBgColor: '#f8fafc',
    chartColors: ['#1a73e8', '#34a853', '#fbbc04', '#ea4335'],
  });

  React.useEffect(() => {
    // Apply theme to CSS variables
    const root = document.documentElement;
    Object.entries(tenantTheme).forEach(([key, value]) => {
      if (typeof value === 'string') {
        root.style.setProperty(`--${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`, value);
      } else if (Array.isArray(value)) {
        value.forEach((color, index) => {
          root.style.setProperty(`--chart-color-${index}`, color);
        });
      }
    });

    // Initialize dashboard compatibility layer lazily so it doesn't block the initial bundle.
    // The module (~3 000 lines across 6 service files) loads after the first paint.
    import('./services/dashboardCompatibilityLayer').then(({ dashboardCompatibilityLayer }) => {
      dashboardCompatibilityLayer.initialize({
        enableRoleBasedEnhancement: true,
        preserveLegacyFormat: true,
        autoMigrateOnAccess: false,
        fallbackToTemplate: true,
      });
    });
  }, [tenantTheme]);

  return (
    <GlobalErrorBoundary>
      <ErrorAndLoadingProvider>
        <ReceivablesErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AuthProvider>
                <DomainLabelProvider>
                  <ToastProvider>
                    <SearchProvider>
                      <ThemeProvider>
                        <GlobalIndicators />
                        <div className="app">
                          <Suspense fallback={<PageLoader />}>
                            <RoleBasedLayout>
                              <Routes>
                                {/* Public routes - No authentication required */}
                                <Route path="/" element={<HomePageWithNavigation />} />
                                <Route path="/login" element={<LoginPageStyled />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/prospects/register" element={<ProspectPublicRegistrationPage />} />

                                {/* New Pages Index - Quick access to all new features */}
                                <Route
                                  path="/newpages"
                                  element={
                                    <ProtectedRoute
                                    // requiredPermission="page-list"
                                    >
                                      {/* //no permission required */}
                                      <NewPagesIndex />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Navigation Test Page */}
                                <Route
                                  path="/test/navigation"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <NavigationTestPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Dashboard Selection - Protected */}
                                <Route
                                  path="/dashboard/select"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <DashboardSelection />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Dashboard Settings - set/clear default dashboard */}
                                <Route
                                  path="/dashboard/settings"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <DashboardSettingsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Dashboard routes - Protected with theme provider */}
                                <Route
                                  path="/dashboard"
                                  element={
                                    <DashboardThemeProvider>
                                      <ProtectedRoute requiredPermission="dashboard-view">
                                        <DashboardPage />
                                      </ProtectedRoute>
                                    </DashboardThemeProvider>
                                  }
                                />
                                <Route
                                  path="/dashboard/role-based"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <RoleBasedDashboardPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/dashboard/workflow-centric"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <WorkflowCentricDashboardPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/dashboard/demo"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <DashboardDemoPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/dashboard/create"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-create">
                                      <DashboardCreatePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/dashboard/debug"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <DashboardDebugTest />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/dashboard/:dashboardId/edit"
                                  element={
                                    <DashboardThemeProvider>
                                      <ProtectedRoute requiredPermission="dashboard-edit">
                                        <DashboardSetupPageStyled />
                                      </ProtectedRoute>
                                    </DashboardThemeProvider>
                                  }
                                />
                                <Route
                                  path="/dashboard/:dashboardId"
                                  element={
                                    <DashboardThemeProvider>
                                      <ProtectedRoute requiredPermission="dashboard-view">
                                        <DashboardPage />
                                      </ProtectedRoute>
                                    </DashboardThemeProvider>
                                  }
                                />

                                {/* Settings routes */}
                                <Route
                                  path="/settings/role-navigation"
                                  element={
                                    <ProtectedRoute requiredPermission="dashboard-view">
                                      <RoleSidebarConfigPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Debug routes */}
                                <Route
                                  path="/debug/refresh-token"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <RefreshTokenTest />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/debug/toast"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <ToastTest />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/debug/navigation"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <NavigationTest />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/debug/dashboard"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <DashboardTest />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Demo routes */}
                                <Route
                                  path="/demo/search"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <SearchDemoPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/demo/bulk-invoice-wizard"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <BulkInvoiceWizardDemo />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/bulk"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <BulkInvoiceWizardDemo />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/demo/access-control"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <AccessControlDemo />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/demo/module-navigation"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <ModuleNavigationDemoPage />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/demo/dashboard-integration"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <DashboardIntegrationDemoPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/demo/error-handling"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <ErrorHandlingDemoPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/demo/final-polish"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <FinalPolishDemoPage />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/bulk-invoice-results"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <BulkInvoiceResults />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Account Management routes */}
                                <Route
                                  path="/accounts"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <AccountsListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts/:accountId/summary"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <AccountSummaryPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts/:accountId/ledger"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <AccountLedgerPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/account/settings"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <AccountSettingsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts/new"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-create">
                                      <UnifiedAccountCreationPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts/hierarchy"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <AccountHierarchyPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts/ledger-search"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <LedgerSearchPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Product Management routes */}
                                <Route
                                  path="/products"
                                  element={
                                    <ProtectedRoute requiredPermission="product-list">
                                      {' '}
                                      //no permission required
                                      <ProductManagementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Inventory Management routes */}
                                <Route
                                  path="/inventory"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <InventoryModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/items"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <InventoryItemsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/items/create"
                                  element={
                                    <ProtectedRoute requiredPermission="item-create">
                                      <InventoryItemFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/items/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="item-edit">
                                      <InventoryItemFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/items/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="item-view-detail">
                                      <InventoryItemDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/movements"
                                  element={
                                    <ProtectedRoute requiredPermission="movement-list">
                                      <StockMovementsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/locations"
                                  element={
                                    <ProtectedRoute requiredPermission="location-list">
                                      <StockLocationsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/inventory/adjustments"
                                  element={
                                    <ProtectedRoute requiredPermission="adjustment-list">
                                      <StockAdjustmentsListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/adjustments/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="adjustment-view-detail">
                                      <StockAdjustmentDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/adjustments/create"
                                  element={
                                    <ProtectedRoute requiredPermission="adjustment-create">
                                      <StockAdjustmentPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/transfers"
                                  element={
                                    <ProtectedRoute requiredPermission="transfer-list">
                                      <StockTransferListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/transfers/create"
                                  element={
                                    <ProtectedRoute requiredPermission="transfer-create">
                                      <StockTransferPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/transfers/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="transfer-list">
                                      <StockTransferDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/reports/valuation"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <StockValuationReportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/tracker"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <StockMovementTracker />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/items/:id/ledger"
                                  element={
                                    <ProtectedRoute requiredPermission="item-view-detail">
                                      <InventoryLedger />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/material-requests"
                                  element={
                                    <ProtectedRoute requiredPermission="material-request-list">
                                      <MaterialRequestList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/material-requests/create"
                                  element={
                                    <ProtectedRoute requiredPermission="material-request-create">
                                      <MaterialRequestCreate />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/material-requests/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="material-request-list">
                                      <MaterialRequestDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/office-use-requests"
                                  element={
                                    <ProtectedRoute requiredPermission="office-use-request-list">
                                      <OfficeUseRequestList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/office-use-requests/create"
                                  element={
                                    <ProtectedRoute requiredPermission="office-use-request-create">
                                      <OfficeUseRequestCreate />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/office-use-requests/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="office-use-request-list">
                                      <OfficeUseRequestDetail />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Sales Order routes (INV-02) */}
                                <Route
                                  path="/inventory/sales-orders"
                                  element={
                                    <ProtectedRoute requiredPermission="sales-order-list">
                                      <SalesOrderListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/sales-orders/new"
                                  element={
                                    <ProtectedRoute requiredPermission="sales-order-create">
                                      <SalesOrderFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/sales-orders/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="sales-order-list">
                                      <SalesOrderDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                {/* Allocation / Redemption routes (INV-03) */}
                                <Route
                                  path="/inventory/allocations"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <AllocationListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/allocations/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <AllocationDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/redemptions"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <RedemptionListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/write-offs"
                                  element={
                                    <ProtectedRoute requiredPermission="write-off-list">
                                      <WriteOffListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/write-offs/new"
                                  element={
                                    <ProtectedRoute requiredPermission="write-off-create">
                                      <WriteOffFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/reorder-alerts"
                                  element={
                                    <ProtectedRoute requiredPermission="item-list">
                                      <StockReorderPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/physical-counts"
                                  element={
                                    <ProtectedRoute requiredPermission="physical-count-list">
                                      <PhysicalCountListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/physical-counts/new"
                                  element={
                                    <ProtectedRoute requiredPermission="physical-count-create">
                                      <PhysicalCountFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/physical-counts/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="physical-count-list">
                                      <PhysicalCountFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/inventory/initial-stock-import"
                                  element={
                                    <ProtectedRoute requiredPermission="item-import">
                                      <InitialStockImportPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Unified Receivables System routes */}
                                <Route
                                  path="/receivables/dashboard"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <ReceivablesDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/collections"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <CollectionsDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/collections/workbench"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <CollectionWorkbench />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/list"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <ReceivablesList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/payments/record"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-record-payment">
                                      <RecordPayment />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/aging-report"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <AgingReport />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="receivable-view-detail">
                                      <ReceivableDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/reminders"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <ReminderManagement />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/workflows"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <AutomatedWorkflowsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/advanced-reporting"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <AdvancedReporting />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/payment-trends"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <PaymentTrends />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/statements"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <CustomerStatements />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/payment-plans"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <PaymentPlanListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/data-consistency"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <DataConsistencyPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/bulk-payment-upload"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <BulkPaymentUpload />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivables/statement-preview-test"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <StatementPreviewTest />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Sales Invoice Management routes */}
                                <Route
                                  path="/sales/invoices"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-list">
                                      <InvoicesList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/fee/invoices/create"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-create">
                                      <CreateInvoice />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/invoices/create"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-create">
                                      <UnifiedInvoiceForm />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/sales/invoices/create-inventory"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-create">
                                      <CreateInventoryInvoice />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-view-detail">
                                      <InvoiceDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-edit">
                                      <UnifiedInvoiceForm />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/sales/invoices/:invoiceId/credit-notes"
                                  element={
                                    <ProtectedRoute requiredPermission="credit-note-list">
                                      <CreditNotesList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/:invoiceId/credit-notes/create"
                                  element={
                                    <ProtectedRoute requiredPermission="credit-note-create">
                                      <CreateCreditNote />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/:invoiceId/credit-notes/:creditNoteId/view"
                                  element={
                                    <ProtectedRoute requiredPermission="credit-note-view-detail">
                                      <CreditNoteDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/sales/invoices/:invoiceId/credit-notes/:creditNoteId/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="credit-note-edit">
                                      <EditCreditNote />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Standalone Credit Notes (all invoices) */}
                                <Route
                                  path="/sales/credit-notes"
                                  element={
                                    <ProtectedRoute requiredPermission="credit-note-list">
                                      <StandaloneCreditNotesList />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Journal Voucher routes */}
                                <Route
                                  path="/accounting/journal-vouchers"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <JournalVoucherListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounting/journal-vouchers/create"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <JournalVoucherFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounting/journal-vouchers/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <JournalVoucherDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Accounting Period Close / Reopen */}
                                <Route
                                  path="/accounting/periods"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <PeriodManagementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Discount/Scholarship System routes */}
                                <Route
                                  path="/discounts/programs"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <DiscountProgramsList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/programs/create"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-create">
                                      <DiscountProgramForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/programs/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <DiscountProgramDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/programs/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-edit">
                                      <DiscountProgramForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/applications"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <DiscountApplicationsList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/applications/new"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-create">

                                      <DiscountApplicationForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/applications/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <DiscountApplicationDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/applied"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <AppliedDiscountsList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/apply"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <ApplyDiscountPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/auto-apply"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <AutoApplyDiscountPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/discounts/analytics"
                                  element={
                                    <ProtectedRoute requiredPermission="discount-list">
                                      <DiscountAnalyticsDashboard />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Procurement Management routes */}
                                <Route
                                  path="/procurement"
                                  element={
                                    <ProtectedRoute requiredPermission="pr-list">
                                      <ProcurementModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/orders"
                                  element={
                                    <ProtectedRoute requiredPermission="po-list">
                                      <PurchaseOrderListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/orders/create"
                                  element={
                                    <ProtectedRoute requiredPermission="po-create">
                                      <PurchaseOrderFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/orders/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="po-edit">
                                      <PurchaseOrderFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/orders/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="po-view-detail">
                                      <PurchaseOrderDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Purchase Requisition routes */}
                                <Route
                                  path="/procurement/requisitions"
                                  element={
                                    <ProtectedRoute requiredPermission="pr-list">
                                      <RequisitionListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/requisitions/create"
                                  element={
                                    <ProtectedRoute requiredPermission="pr-create">
                                      <RequisitionFormPageSimplified />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/requisitions/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="pr-edit">
                                      <RequisitionFormPageSimplified />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/requisitions/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="pr-view-detail">
                                      <RequisitionDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Supplier Management routes */}
                                <Route
                                  path="/procurement/suppliers"
                                  element={
                                    <ProtectedRoute requiredPermission="supplier-list">
                                      <SupplierListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/suppliers/create"
                                  element={
                                    <ProtectedRoute requiredPermission="supplier-create">
                                      <SupplierFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/suppliers/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="supplier-edit">
                                      <SupplierFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/suppliers/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="supplier-view-detail">
                                      <SupplierDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Goods Received Note (GRN) routes */}
                                <Route
                                  path="/procurement/grn"
                                  element={
                                    <ProtectedRoute requiredPermission="grn-list">
                                      <GRNListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/grn/create"
                                  element={
                                    <ProtectedRoute requiredPermission="grn-create">
                                      <GRNFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/grn/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="grn-view-detail">
                                      <GRNDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/grn/:id/quality-check"
                                  element={
                                    <ProtectedRoute requiredPermission="grn-quality-check">
                                      <GRNQualityCheckPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Purchase Returns routes */}
                                <Route
                                  path="/procurement/returns"
                                  element={
                                    <ProtectedRoute requiredPermission="return-list">
                                      <ReturnListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/returns/create"
                                  element={
                                    <ProtectedRoute requiredPermission="return-create">
                                      <ReturnFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/returns/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="return-edit">
                                      <ReturnFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/returns/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="return-view-detail">
                                      <ReturnDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Supplier Quotes routes */}
                                <Route
                                  path="/procurement/quotes"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-list">
                                      <QuoteListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/quotes/new"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-create">
                                      <QuoteDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/quotes/compare/:requisitionId"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-compare">
                                      <QuoteComparisonPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/quotes/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-view-detail">
                                      <QuoteDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/quotes/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-edit">
                                      <QuoteDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/procurement/quotes/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="quote-view-detail">
                                      <QuoteDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* 3-Way Matching */}
                                <Route
                                  path="/procurement/three-way-matching"
                                  element={
                                    <ProtectedRoute requiredPermission="po-view-detail">
                                      <ThreeWayMatchingDashboard />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Procurement Settings */}
                                <Route
                                  path="/procurement/settings"
                                  element={
                                    <ProtectedRoute requiredPermission="po-manage">
                                      <ProcurementConfigPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* HR & Payroll Management routes */}
                                <Route
                                  path="/hr"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-list">
                                      <HRIndexPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/dashboard"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-list">
                                      <HRDashboardPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/config"
                                  element={
                                    <ProtectedRoute requiredPermission="hr-config">
                                      <HRConfigPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-list">
                                      <StaffListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/create"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-create">
                                      <StaffFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/import"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-create">
                                      <StaffExcelImportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-edit">
                                      <StaffFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-view-detail">
                                      <StaffDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/:staffId/pay-components"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-pay-components">
                                      <StaffPayComponentsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/pay-component-removals"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-pay-components">
                                      <PayComponentRemovalListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/staff/:staffId/documents"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-list">
                                      <EmployeeDocumentsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Salary Components Management routes */}
                                <Route
                                  path="/hr/salary-components"
                                  element={
                                    <ProtectedRoute requiredPermission="salary-component-list">
                                      <SalaryComponentsListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/salary-components/new"
                                  element={
                                    <ProtectedRoute requiredPermission="salary-component-create">
                                      <SalaryComponentFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/salary-components/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="salary-component-edit">
                                      <SalaryComponentFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Bonus & Deduction Management routes */}
                                <Route
                                  path="/hr/bonus-deduction"
                                  element={
                                    <ProtectedRoute requiredPermission="bonus-deduction-list">
                                      <BonusDeductionListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/bonus-deduction/create"
                                  element={
                                    <ProtectedRoute requiredPermission="bonus-deduction-create">
                                      <BonusDeductionFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/bonus-deduction/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="bonus-deduction-view-detail">
                                      <BonusDeductionDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/bonus-deduction/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="bonus-deduction-edit">
                                      <BonusDeductionFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Staff IOU routes */}
                                <Route
                                  path="/hr/ious"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-iou-list">
                                      <StaffIOUListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/ious/create"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-iou-create">
                                      <StaffIOUFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/ious/bulk-debit"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-iou-create">
                                      <BulkStaffDebitPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/ious/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-iou-list">
                                      <StaffIOUDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Employee Self-Service */}
                                <Route
                                  path="/hr/self-service"
                                  element={
                                    <ProtectedRoute requiredPermission="staff-list">
                                      <EmployeeSelfServicePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Leave Management routes */}
                                <Route
                                  path="/hr/leave-balances"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-balances">
                                      <LeaveBalancesListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-types"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-types-list">
                                      <LeaveTypesListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-types/create"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-type-create">
                                      <LeaveTypeFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-types/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-type-edit">
                                      <LeaveTypeFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-requests"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-list">
                                      <LeaveRequestsListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-calendar"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-list">
                                      <LeaveCalendarPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-requests/create"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-create">
                                      <LeaveRequestFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-requests/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-edit">
                                      <LeaveRequestFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/leave-requests/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="leave-view-detail">
                                      <LeaveRequestDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Attendance Management routes */}
                                <Route
                                  path="/hr/clock"
                                  element={
                                    <ProtectedRoute requiredPermission="attendance-clock">
                                      <ClockInOutPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/attendance"
                                  element={
                                    <ProtectedRoute requiredPermission="attendance-list">
                                      <AttendanceListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/attendance/create"
                                  element={
                                    <ProtectedRoute requiredPermission="attendance-create">
                                      <AttendanceFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/attendance/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="attendance-edit">
                                      <AttendanceFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/attendance/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="attendance-view-detail">
                                      <AttendanceDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Payroll Management routes */}
                                <Route
                                  path="/hr/payroll"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-list">
                                      <PayrollListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payroll/create"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-create">
                                      <PayrollFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payroll/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-edit">
                                      <PayrollFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payroll/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-view-detail">
                                      <PayrollDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payslips"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-view-payslip">
                                      <PayslipListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payslips/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-view-payslip">
                                      <PayslipDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                {/* Payroll Schedule routes (HR-02) */}
                                <Route
                                  path="/hr/payroll-schedules"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-list">
                                      <PayrollScheduleListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payroll-schedules/new"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-create">
                                      <PayrollScheduleFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/payroll-schedules/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-edit">
                                      <PayrollScheduleFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/hr/pension-remittances"
                                  element={
                                    <ProtectedRoute requiredPermission="payroll-list">
                                      {/* no permission required */}
                                      <PensionRemittancePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Report routes */}
                                <Route
                                  path="/reports"
                                  element={
                                    <ProtectedRoute requiredPermission="report-list">
                                      {' '}
                                      //no permission required
                                      <ReportsListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/reports/new"
                                  element={
                                    <ProtectedRoute requiredPermission="report-create">
                                      {' '}
                                      //no permission required
                                      <ReportBuilder />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/reports/:reportId/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="report-edit">
                                      {' '}
                                      //no permission required
                                      <ReportBuilder />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/report/:reportCode"
                                  element={
                                    <ProtectedRoute requiredPermission="report-list">
                                      <ReportViewPage />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/admin/access-control"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <AccessControlPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* User Settings - Available to all authenticated users */}
                                <Route
                                  path="/settings"
                                  element={
                                    <ProtectedRoute>
                                      {/* //no permission required */}
                                      <UserSettingsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* User Profile - Available to all authenticated users (view/edit own info & change password) */}
                                <Route
                                  path="/profile"
                                  element={
                                    <ProtectedRoute>
                                      <UserProfilePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* User Management - Director, Principal & Administrator only */}
                                <Route
                                  path="/admin/users"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <UserManagementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Dashboard Builder - Build permission-aware dashboard templates per role */}
                                <Route
                                  path="/admin/dashboard-builder/:templateId?"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <DashboardBuilderPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Dashboard Assignment - Assign default dashboards to roles */}
                                <Route
                                  path="/admin/dashboard-assignment"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <DashboardAssignmentPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Pages & Actions Settings - Available to all authenticated users */}
                                <Route
                                  path="/admin/permissions-matrix"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <RolesPermissionsMatrixPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* User-level permission overrides */}
                                <Route
                                  path="/admin/user-overrides"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <UserPermissionOverridePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Elevated-permissions exception report */}
                                <Route
                                  path="/admin/permission-exceptions"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <PermissionExceptionReportPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Immutable elevation audit log */}
                                <Route
                                  path="/admin/permission-elevation-log"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <PermissionElevationLogPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Branch Management routes */}
                                <Route
                                  path="/admin/branches"
                                  element={
                                    <ProtectedRoute requiredPermission="branch-list">
                                      <BranchListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/branches/create"
                                  element={
                                    <ProtectedRoute requiredPermission="branch-create">
                                      <BranchFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/branches/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="branch-view-detail">
                                      <BranchFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Tenant Management routes */}
                                <Route
                                  path="/admin/tenants"
                                  element={
                                    <ProtectedRoute requiredPermission="tenant-manage">
                                      <TenantListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/tenants/create"
                                  element={
                                    <ProtectedRoute requiredPermission="tenant-manage">
                                      <TenantFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/tenants/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="tenant-manage">
                                      <TenantFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/tenants/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="tenant-manage">
                                      <TenantFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Automation routes */}
                                <Route
                                  path="/automations/templates"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <AutomationTemplatesPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/templates/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <AutomationTemplateDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/templates/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-edit">
                                      <VisualWorkflowBuilder />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/templates/create"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-create">
                                      <VisualWorkflowBuilder />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/run/:templateId"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <RunAutomationPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/runs"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <AutomationRunsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/runs/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <AutomationRunDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/runs/:id/logs"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <AutomationRunDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Approval Management routes */}
                                <Route
                                  path="/automations/approvals/history"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <ApprovalHistoryPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/automations/approvals/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="automation-list">
                                      <ApprovalsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* User Form routes - All authenticated users */}
                                <Route
                                  path="/forms"
                                  element={
                                    <ProtectedRoute requiredPermission="form-list">
                                      <UserFormsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/forms/:formId"
                                  element={
                                    <ProtectedRoute requiredPermission="form-list">
                                      <UserFormViewPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/forms/submissions"
                                  element={
                                    <ProtectedRoute requiredPermission="form-list">
                                      <UserSubmissionsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Admin Form Management routes */}
                                <Route
                                  path="/admin/forms"
                                  element={
                                    <ProtectedRoute requiredPermission="form-list">
                                      <AdminFormsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/workflows"
                                  element={
                                    <ProtectedRoute requiredPermission="workflow-list">
                                      <AdminWorkflowsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/submissions"
                                  element={
                                    <ProtectedRoute requiredPermission="form-list">
                                      <AdminSubmissionsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/workflows/new"
                                  element={
                                    <ProtectedRoute requiredPermission="workflow-create">
                                      <VisualWorkflowBuilder />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/admin/workflows/:workflowId"
                                  element={
                                    <ProtectedRoute requiredPermission="workflow-edit">
                                      <VisualWorkflowBuilder />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Client Management routes */}
                                <Route
                                  path="/clients"
                                  element={
                                    <ProtectedRoute requiredPermission="client-list">
                                      <ClientListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/classifications"
                                  element={
                                    <ProtectedRoute requiredPermission="classification-list">
                                      <ClientClassificationsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/classifications/create"
                                  element={
                                    <ProtectedRoute requiredPermission="classification-create">
                                      <ClientClassificationsPage /> // adjust if separate form
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/classifications/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="classification-edit">
                                      <ClientClassificationsPage />
                                      {/* // adjust */}
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/create"
                                  element={
                                    <ProtectedRoute requiredPermission="client-create">
                                      <ClientFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="client-view-detail">
                                      <ClientDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/:clientId/ledger"
                                  element={
                                    <ProtectedRoute requiredPermission="client-view-detail">
                                      <ClientLedgerPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="client-edit">
                                      <ClientFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/import"
                                  element={
                                    <ProtectedRoute requiredPermission="client-import">
                                      <ClientBulkImportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/school-fees-import"
                                  element={
                                    <ProtectedRoute requiredPermission="client-import">
                                      <StudentFeeExcelImportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/:id/statement"
                                  element={
                                    <ProtectedRoute requiredPermission="client-view-detail">
                                      <ClientStatement />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/clients/registration-config"
                                  element={
                                    <ProtectedRoute requiredPermission="client-edit">
                                      <ClientRegistrationConfigPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Income Fee Structure routes */}
                                <Route
                                  path="/incomes/service-items"
                                  element={
                                    <ProtectedRoute requiredPermission="service-item-list">
                                      <ServiceItemListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/fee-structures"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-list">
                                      <IncomeFeeStructureListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/fee-structures/approvals"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-list">
                                      {' '}
                                      //no permission required
                                      <FeeStructureApprovalPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/fee-structures/create"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-create">
                                      <FeeStructureForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/fee-structures/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-edit">
                                      <FeeStructureForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/fee-structures/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-view-detail">
                                      <FeeStructureForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/invoices/batch-review"
                                  element={
                                    <ProtectedRoute requiredPermission="invoice-list">
                                      <BatchReviewPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/setup/fee-structure"
                                  element={
                                    <ProtectedRoute requiredPermission="fee-structure-list">
                                      <IncomeFeeStructureSetupPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/financial-periods"
                                  element={
                                    <ProtectedRoute requiredPermission="income-list">
                                      <AcademicSessionPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/categories"
                                  element={
                                    <ProtectedRoute requiredPermission="income-list">
                                      <IncomeCategoryListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/entitlements"
                                  element={
                                    <ProtectedRoute requiredPermission="entitlement-list">
                                      <EntitlementsList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/entitlements/create"
                                  element={
                                    <ProtectedRoute requiredPermission="entitlement-create">
                                      <EntitlementForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/entitlements/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="entitlement-edit">
                                      <EntitlementForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/entitlements/:id/view"
                                  element={
                                    <ProtectedRoute requiredPermission="entitlement-view-detail">
                                      <EntitlementDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/incomes/entitlements/dashboard"
                                  element={
                                    <ProtectedRoute requiredPermission="entitlement-list">
                                      {' '}
                                      //no permission required
                                      <EntitlementDashboard />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Income Report routes */}
                                <Route
                                  path="/incomes/reports"
                                  element={<IncomeReportsDashboardPage />}
                                />
                                <Route
                                  path="/incomes/reports/by-category"
                                  element={<IncomeByCategoryPage />}
                                />
                                <Route
                                  path="/incomes/reports/by-service-item"
                                  element={<IncomeByServiceItemPage />}
                                />
                                <Route
                                  path="/incomes/reports/by-period"
                                  element={<IncomeByPeriodPage />}
                                />
                                <Route
                                  path="/incomes/reports/by-client"
                                  element={<IncomeByClientPage />}
                                />

                                {/* Approval routes */}
                                <Route
                                  path="/approvals"
                                  element={
                                    <ProtectedRoute requiredPermission="approval-list">
                                      <UnifiedPendingApprovalsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/approvals/pending"
                                  element={
                                    <ProtectedRoute requiredPermission="approval-list">
                                      <UnifiedPendingApprovalsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                {/* Automation workflow approvals (kept for backward compat) */}
                                <Route
                                  path="/approvals/workflow"
                                  element={
                                    <ProtectedRoute requiredPermission="approval-list">
                                      <ApprovalsPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/collections/dashboard"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <CollectionsDashboard />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Resource Consumption Management routes */}
                                <Route
                                  path="/expenses/resource-consumption"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-list">
                                      <ResourceConsumptionListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/create"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-create">
                                      <ResourceConsumptionFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-view-detail">
                                      <ResourceConsumptionDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-edit">
                                      <ResourceConsumptionFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/fuel-report"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-list">
                                      <FuelConsumptionReportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/irregularities"
                                  element={
                                    <ProtectedRoute requiredPermission="irregularities-view">
                                      <IrregularitiesDashboardPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/approval-queue"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-approval-queue">
                                      <ApprovalQueuePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/:id/approve"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-approve">
                                      <ApprovalDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/posting-queue"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-posting-queue">
                                      <PostingQueuePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resource-consumption/:id/post"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-post">
                                      <PostingDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Simplified Fuel Log route */}
                                <Route
                                  path="/expenses/fuel-log/create"
                                  element={
                                    <ProtectedRoute requiredPermission="consumption-create">
                                      <FuelLogFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Resource Management routes */}
                                <Route
                                  path="/expenses/resources"
                                  element={
                                    <ProtectedRoute requiredPermission="expenses-resource-list">
                                      <ResourceListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resources/create"
                                  element={
                                    <ProtectedRoute requiredPermission="expenses-resource-create">

                                      <ResourceFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resources/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="expenses-resource-list">
                                      <ResourceDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/resources/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="expenses-resource-edit">
                                      <ResourceFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Voucher Management routes */}
                                <Route
                                  path="/expenses/vouchers"
                                  element={
                                    <ProtectedRoute requiredPermission="voucher-list">
                                      <VoucherListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/vouchers/create"
                                  element={
                                    <ProtectedRoute requiredPermission="voucher-create">
                                      <VoucherFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/vouchers/expiring"
                                  element={
                                    <ProtectedRoute requiredPermission="voucher-expiring">
                                      <ExpiringVouchersDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/vouchers/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="voucher-view-detail">
                                      <VoucherDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/vouchers/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="voucher-edit">
                                      <VoucherFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Expense Category Management routes */}
                                <Route
                                  path="/expenses/categories"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-category-list">
                                      <ExpenseCategoryListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/categories/create"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-category-create">
                                      <ExpenseCategoryFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/categories/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-category-edit">
                                      <ExpenseCategoryFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Prepaid Expense Management routes */}
                                <Route
                                  path="/expenses/prepaid"
                                  element={
                                    <ProtectedRoute requiredPermission="prepaid-list">
                                      <PrepaidExpenseListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/prepaid/create"
                                  element={
                                    <ProtectedRoute requiredPermission="prepaid-create">
                                      <PrepaidExpenseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/prepaid/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="prepaid-view-detail">
                                      <PrepaidExpenseDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/prepaid/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="prepaid-edit">
                                      <PrepaidExpenseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/prepaid/:id/amortize"
                                  element={
                                    <ProtectedRoute requiredPermission="prepaid-amortize">
                                      <PrepaidExpenseAmortizePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Financial Reports routes */}
                                <Route
                                  path="/reports/financial/trial-balance"
                                  element={
                                    <ProtectedRoute requiredPermission="trial-balance-view">
                                      <TrialBalancePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/reports/financial/profit-loss"
                                  element={
                                    <ProtectedRoute requiredPermission="pl-view">
                                      <ProfitLossPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/reports/financial/balance-sheet"
                                  element={
                                    <ProtectedRoute requiredPermission="balance-sheet-view">
                                      <BalanceSheetPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/reports/financial/cash-flow"
                                  element={
                                    <ProtectedRoute requiredPermission="cash-flow-view">
                                      <CashFlowStatementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Liabilities / Accounts Payable routes */}
                                <Route
                                  path="/liabilities/payables"
                                  element={
                                    <ProtectedRoute requiredPermission="payables-list">
                                      <PayablesListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/liabilities/payables/new"
                                  element={
                                    <ProtectedRoute requiredPermission="payables-create">
                                      <CreatePayablePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/liabilities/payables/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="payables-list">
                                      <PayableDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/liabilities/matching"
                                  element={
                                    <ProtectedRoute requiredPermission="payables-list">
                                      <PayableMatchingDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/liabilities/vendors"
                                  element={
                                    <ProtectedRoute requiredPermission="payables-list">
                                      <VendorApAgingPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Fixed Asset Management routes */}
                                <Route
                                  path="/fixed-asset"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <FixedAssetModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/register"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-edit">
                                      <AssetFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/fuel-monitor"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetFuelMonitorPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/categories"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetCategoryListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/categories/create"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-create">
                                      <AssetCategoryFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/categories/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-edit">
                                      <AssetCategoryFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/purchases"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetPurchaseListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/purchases/new"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-create">
                                      <AssetPurchaseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/purchases/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetPurchaseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/acquisitions"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetPurchaseListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/acquisitions/new"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-create">
                                      <AssetPurchaseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/acquisitions/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetPurchaseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/depreciation/run"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-depreciate">
                                      <DepreciationRunPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/maintenance"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetMaintenanceListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/maintenance/new"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-create">
                                      <AssetMaintenanceFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/maintenance/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetMaintenanceFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/depreciation"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-list">
                                      <AssetDepreciationListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/dispose"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-dispose">
                                      <AssetDisposalPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/assets/:id/dispose"
                                  element={
                                    <ProtectedRoute requiredPermission="asset-dispose">
                                      <AssetDisposalPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Unified Module Routes - Replace all role-specific module routes */}
                                <Route
                                  path="/financial-management"
                                  element={
                                    <ProtectedRoute requiredPermission="accounts-view">
                                      <FinancialManagementPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/client-services"
                                  element={
                                    <ProtectedRoute requiredPermission="client-list">
                                      <StudentServicesPage />
                                    </ProtectedRoute>
                                  }
                                />

                                <Route
                                  path="/administration"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <AdministrationPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/all-access"
                                  element={
                                    <ProtectedRoute requiredPermission="user-list">
                                      <AllAccessPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Treasury / Cash Management routes */}
                                <Route
                                  path="/treasury"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <TreasuryModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/dashboard"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <TreasuryDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/bank-reconciliation"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-reconcile">
                                      <BankReconciliationPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/cash-reconciliation"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-reconcile">
                                      <CashReconciliationPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Budget Period routes */}
                                <Route
                                  path="/budgets/periods"
                                  element={
                                    <ProtectedRoute requiredPermission="budget-list">
                                      <BudgetPeriodList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/budgets/periods/new"
                                  element={
                                    <ProtectedRoute requiredPermission="budget-create">
                                      <BudgetPeriodFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/budgets/periods/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="budget-edit">
                                      <BudgetPeriodFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/budgets/periods/:id/variance"
                                  element={
                                    <ProtectedRoute requiredPermission="budget-list">
                                      <BudgetVarianceReportPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/budgets/periods/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="budget-list">
                                      <BudgetPeriodDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Petty Cash Management routes */}
                                <Route
                                  path="/petty-cash"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashModulePage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* New standalone module landing pages */}
                                <Route
                                  path="/bank"
                                  element={
                                    <ProtectedRoute requiredPermission="">
                                      <BankModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/receivable"
                                  element={
                                    <ProtectedRoute requiredPermission="receivables-list">
                                      <ReceivableModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/savings"
                                  element={
                                    <ProtectedRoute requiredPermission="">
                                      <SavingsModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/loans"
                                  element={
                                    <ProtectedRoute requiredPermission="">
                                      <LoansModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/accounts-payable"
                                  element={
                                    <ProtectedRoute requiredPermission="payable-list">
                                      <AccountsPayableModulePage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashDashboard />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/funds/new"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-create">
                                      <PettyCashFundForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/funds/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-edit">
                                      <PettyCashFundForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/funds/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashFundDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/vouchers"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashVoucherList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/vouchers/new"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-create">
                                      <PettyCashVoucherForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/vouchers/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-edit">
                                      <PettyCashVoucherForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/vouchers/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashVoucherDetail />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/replenishments"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashReplenishmentList />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/replenishments/new"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-create">
                                      <PettyCashReplenishmentForm />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/petty-cash/replenishments/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <PettyCashReplenishmentDetail />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Cashier Accounts routes */}
                                <Route
                                  path="/treasury/cashier-accounts"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <CashierAccountListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/cashier-accounts/new"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-create">
                                      <CashierAccountFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Cash Transfer routes */}
                                <Route
                                  path="/treasury/cash-transfers"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-list">
                                      <CashTransferListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/treasury/cash-transfers/new"
                                  element={
                                    <ProtectedRoute requiredPermission="treasury-create">
                                      <CashTransferFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* General Expense routes */}
                                <Route
                                  path="/expenses"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-list">
                                      <ExpenseListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/create"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-create">
                                      <ExpenseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-edit">
                                      <ExpenseFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/expenses/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="expense-list">
                                      <ExpenseDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Bank Management routes */}
                                <Route
                                  path="/banks"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/new"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-create">
                                      <BankFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-edit">
                                      <BankFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/accounts"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankAccountListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/accounts/new"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-create">
                                      <BankSetupPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/accounts/:id/edit"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-edit">
                                      <BankSetupPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/accounts/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankAccountDetailPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/transfers"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankTransferListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/transfers/new"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-create">
                                      <BankTransferFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/payments"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankPaymentListPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/payments/new"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-create">
                                      <BankPaymentFormPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/banks/transfers/approvals"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-approve">
                                      <TransferApprovalPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Bank Statement Reconciliation (Feature #2) */}
                                <Route
                                  path="/banks/statement-uploads"
                                  element={
                                    <ProtectedRoute requiredPermission="bank-list">
                                      <BankStatementUploadPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loan Verification — NIN cross-branch check (Feature #12) */}
                                <Route
                                  path="/loans/verification/:loanId"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanVerificationPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loan Disbursement approval/execution (Feature #10) */}
                                <Route
                                  path="/loans/disbursements/:loanId"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-disbursement-list">
                                      <LoanDisbursementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Business Day Management — EOD close & backdate requests (Feature #3) */}
                                <Route
                                  path="/business-day"
                                  element={
                                    <ProtectedRoute requiredPermission="business-day-manage">
                                      <BusinessDayManagementPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Daily Collection Sheet — CO collection workflow + BM reconcile (Feature #8, #13, #14) */}
                                <Route
                                  path="/cash-management/collection-sheets"
                                  element={
                                    <ProtectedRoute requiredPermission="cash-management-list">
                                      <DailyCollectionSheetPage />
                                    </ProtectedRoute>
                                  }
                                />
                                <Route
                                  path="/cash-management/collection-sheets/:sheetId"
                                  element={
                                    <ProtectedRoute requiredPermission="cash-management-list">
                                      <DailyCollectionSheetPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings collection sheet (Feature #1 — Savings Cycles) */}
                                <Route
                                  path="/savings/collection"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-list">
                                      <SavingsCollectionPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings Accounts list */}
                                <Route
                                  path="/savings/accounts"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-list">
                                      <SavingsAccountsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings — New Account form */}
                                <Route
                                  path="/savings/accounts/create"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-create">
                                      <SavingsAccountFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings — Account detail */}
                                <Route
                                  path="/savings/accounts/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-list">
                                      <SavingsAccountDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings — Compulsory Policy */}
                                <Route
                                  path="/savings/policy"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-list">
                                      <SavingsPolicyPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings — Withdrawal requests & approval inbox */}
                                <Route
                                  path="/savings/withdrawals"
                                  element={
                                    <ProtectedRoute requiredPermission="savings-list">
                                      <SavingsWithdrawalsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings Products (filtered to SAVINGS type) */}
                                <Route
                                  path="/savings/products"
                                  element={
                                    <ProtectedRoute requiredPermission="product-list">
                                      <ProductManagementPage filterType="SAVINGS" />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Savings — Product behaviour config */}
                                <Route
                                  path="/savings/products/:id/config"
                                  element={
                                    <ProtectedRoute requiredPermission="product-list">
                                      <SavingsProductConfigPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loan Accounts list */}
                                <Route
                                  path="/loans/accounts"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanAccountsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — New Application form */}
                                <Route
                                  path="/loans/accounts/create"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-create">
                                      <LoanAccountFormPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — Account detail */}
                                <Route
                                  path="/loans/accounts/:id"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanAccountDetailPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — Collection (repayment entry) */}
                                <Route
                                  path="/loans/collection"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanCollectionPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — Repayment approvals (director inbox) */}
                                <Route
                                  path="/loans/repayment-approvals"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanRepaymentApprovalsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — Products list */}
                                <Route
                                  path="/loans/products"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanProductsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loans — Product fee & savings requirements config */}
                                <Route
                                  path="/loans/products/:id/config"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanProductConfigPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loan Verification list (entry point without loanId) */}
                                <Route
                                  path="/loans/verification"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-list">
                                      <LoanAccountsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* Loan Disbursements list (entry point without loanId) */}
                                <Route
                                  path="/loans/disbursements"
                                  element={
                                    <ProtectedRoute requiredPermission="loan-disbursement-list">
                                      <LoanAccountsPage />
                                    </ProtectedRoute>
                                  }
                                />

                                {/* ── Client Management additions ─────────────────── */}
                                <Route path="/clients/groups" element={<ProtectedRoute requiredPermission="client-groups"><ClientGroupsPage /></ProtectedRoute>} />
                                <Route path="/prospects" element={<ProtectedRoute requiredPermission="client-list"><ProspectListPage /></ProtectedRoute>} />
                                <Route path="/clients/reactivate" element={<ProtectedRoute requiredPermission="client-list"><ReactivateClientPage /></ProtectedRoute>} />

                                {/* ── Savings — Combined Receipt & Thrift ──────────── */}
                                <Route path="/savings/combined-receipt" element={<ProtectedRoute requiredPermission="savings-list"><CombinedReceiptPage /></ProtectedRoute>} />
                                <Route path="/savings/group-combined-receipt" element={<ProtectedRoute requiredPermission="savings-list"><GroupCombinedReceiptPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/setup" element={<ProtectedRoute requiredPermission="savings-create"><ThriftSetupPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/monthly" element={<ProtectedRoute requiredPermission="savings-list"><ThriftMonthlyPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/smart" element={<ProtectedRoute requiredPermission="savings-list"><ThriftSmartPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/collection" element={<ProtectedRoute requiredPermission="savings-list"><ThriftCollectionPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/spreadsheet" element={<ProtectedRoute requiredPermission="savings-list"><ThriftSpreadsheetPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/multi-day" element={<ProtectedRoute requiredPermission="savings-list"><ThriftMultiDayPage /></ProtectedRoute>} />

                                {/* ── Loan & Operations Reports ────────────────────── */}
                                <Route path="/reports/loans/debtors" element={<ProtectedRoute requiredPermission="loan-list"><DebtorsReportPage /></ProtectedRoute>} />
                                <Route path="/reports/loans/defaulters" element={<ProtectedRoute requiredPermission="loan-list"><DefaultersReportPage /></ProtectedRoute>} />
                                <Route path="/reports/loans/par" element={<ProtectedRoute requiredPermission="loan-list"><PARReportPage /></ProtectedRoute>} />
                                <Route path="/reports/daily-transactions" element={<ProtectedRoute requiredPermission="loan-list"><RemittanceReportPage /></ProtectedRoute>} />
                                <Route path="/reports/daily-summary" element={<ProtectedRoute requiredPermission="loan-list"><DailySummaryReportPage /></ProtectedRoute>} />
                                <Route path="/reports/clients/groups" element={<ProtectedRoute requiredPermission="client-list"><GroupReportPage /></ProtectedRoute>} />
                                <Route path="/reports/thrift" element={<ProtectedRoute requiredPermission="savings-list"><ThriftReportPage /></ProtectedRoute>} />
                                <Route path="/savings/thrift/list" element={<ProtectedRoute requiredPermission="savings-list"><ThriftReportPage /></ProtectedRoute>} />
                                <Route path="/reports/contributions/daily" element={<ProtectedRoute requiredPermission="savings-list"><DailyContributionReportPage /></ProtectedRoute>} />
                                <Route path="/reports/contributions/spreadsheet" element={<ProtectedRoute requiredPermission="savings-list"><DCSpreadsheetReportPage /></ProtectedRoute>} />
                                <Route path="/reports/summary" element={<ProtectedRoute requiredPermission="loan-list"><ReportSummaryPage /></ProtectedRoute>} />

                                {/* ── Admin Operations ─────────────────────────────── */}
                                <Route path="/admin/transaction-reversal" element={<ProtectedRoute requiredPermission="admin"><TransactionReversalPage /></ProtectedRoute>} />
                                <Route path="/admin/review-week" element={<ProtectedRoute requiredPermission="admin"><ReviewWeekPage /></ProtectedRoute>} />
                                <Route path="/admin/close-year" element={<ProtectedRoute requiredPermission="admin"><CloseYearPage /></ProtectedRoute>} />

                                {/* ── Profile ──────────────────────────────────────── */}
                                <Route path="/profile/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

                                {/* Dynamic module routes - This must be LAST to avoid conflicts */}
                                <Route
                                  path="/:moduleCode/:pageCode"
                                  element={
                                    <DashboardThemeProvider>
                                      <ProtectedRoute>
                                        {/* //no permission required */}
                                        <DynamicModulePage />
                                      </ProtectedRoute>
                                    </DashboardThemeProvider>
                                  }
                                />

                                {/* Error routes */}
                                <Route path="/error/403" element={<ForbiddenPage />} />
                                <Route path="/error/404" element={<NotFoundPage />} />

                                {/* Catch all - redirect to 404 */}
                                <Route path="*" element={<NotFoundPage />} />
                              </Routes>
                            </RoleBasedLayout>
                          </Suspense>
                        </div>

                        {/* Global Progress Overlay for tracking operations */}
                        <GlobalProgressOverlay position="bottom-right" maxVisible={3} />
                      </ThemeProvider>
                    </SearchProvider>
                  </ToastProvider>
                </DomainLabelProvider>
              </AuthProvider>

              {import.meta.env.DEV && (
                <Suspense fallback={null}>
                  {React.createElement(
                    React.lazy(() =>
                      import('@tanstack/react-query-devtools').then(m => ({
                        default: m.ReactQueryDevtools,
                      }))
                    ),
                    { initialIsOpen: false }
                  )}
                </Suspense>
              )}
            </BrowserRouter>
          </QueryClientProvider>
        </ReceivablesErrorBoundary>
      </ErrorAndLoadingProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
