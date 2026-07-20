/**
 * Treasury Dashboard Page
 * Daily summary of cash collections, reconciliations, and outstanding items
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  DollarSignIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  TrendingUpIcon,
  UsersIcon,
  FileTextIcon,
  BanknoteIcon,
} from 'lucide-react';
import {
  useTreasurySummary,
  useCashierSummaries,
  useCashiersNeedingReconciliation,
  usePendingCashTransfers,
  useReconciliationsNeedingSignoff,
} from '../../hooks/useTreasury';
import { useBankTransfers } from '../../hooks/useBanks';
import { CashCollectionForm } from '../../components/treasury/CashCollectionForm';
import { CashReconciliationForm } from '../../components/treasury/CashReconciliationForm';
import { CashTransferForm } from '../../components/treasury/CashTransferForm';
import { CashierAccountForm } from '../../components/treasury/CashierAccountForm';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/Dialog';

export const TreasuryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isCashierDialogOpen, setIsCashierDialogOpen] = useState(false);
  const [selectedCashierId, setSelectedCashierId] = useState<number | null>(null);
  const [isReconciliationDialogOpen, setIsReconciliationDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'cashiers' | 'pending-reconciliations' | 'pending-transfers' | 'finance-signoff'
  >('cashiers');

  const { data: summary, isLoading: loadingSummary } = useTreasurySummary();
  const { data: cashierSummaries = [], isLoading: loadingCashiers } = useCashierSummaries();
  const { data: cashiersNeedingRecon = [] } = useCashiersNeedingReconciliation();
  const { data: pendingTransfers = [] } = usePendingCashTransfers();
  const { data: needingSignoff = [] } = useReconciliationsNeedingSignoff();

  const { data: pendingBankTransfersData } = useBankTransfers({ status: 'PENDING_APPROVAL' });
  const pendingBankTransfers = pendingBankTransfersData?.results ?? [];

  if (loadingSummary || loadingCashiers) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Treasury Management</h1>
          <p className="text-muted-foreground">
            Daily cash operations for {format(new Date(), 'EEEE, MMMM dd, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isCashierDialogOpen} onOpenChange={setIsCashierDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <UsersIcon className="mr-2 h-4 w-4" />
                New Cashier Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Cashier Account</DialogTitle>
              </DialogHeader>
              <CashierAccountForm
                onSuccess={() => setIsCashierDialogOpen(false)}
                onCancel={() => setIsCashierDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isCollectionDialogOpen} onOpenChange={setIsCollectionDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <DollarSignIcon className="mr-2 h-4 w-4" />
                New Collection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Cash Collection</DialogTitle>
              </DialogHeader>
              {selectedCashierId && (
                <CashCollectionForm
                  cashierAccountId={selectedCashierId}
                  onSuccess={() => {
                    setIsCollectionDialogOpen(false);
                    setSelectedCashierId(null);
                  }}
                  onCancel={() => {
                    setIsCollectionDialogOpen(false);
                    setSelectedCashierId(null);
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/banks/transfers')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Collections</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_collections_today || '0.00'}</div>
            <p className="text-xs text-muted-foreground">All cashier collections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inter-bank Transfers</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_transfers_today || '0.00'}</div>
            <p className="text-xs text-muted-foreground">
              {pendingBankTransfers.length} pending approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Undeposited Cash</CardTitle>
            <BanknoteIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.undeposited_cash || '0.00'}</div>
            <p className="text-xs text-muted-foreground">
              Across {summary?.active_cashiers || 0} cashiers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Items</CardTitle>
            <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(
                (summary?.pending_reconciliations || 0) +
                (summary?.collections_requiring_approval || 0) +
                pendingTransfers.length +
                pendingBankTransfers.length
              ).toString()}
            </div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts for Pending Actions */}
      {cashiersNeedingRecon.length > 0 && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Reconciliation Required</AlertTitle>
          <AlertDescription>
            {cashiersNeedingRecon.length} cashier account(s) need end-of-day reconciliation
          </AlertDescription>
        </Alert>
      )}

      {needingSignoff.length > 0 && (
        <Alert>
          <FileTextIcon className="h-4 w-4" />
          <AlertTitle>Finance Officer Sign-off Required</AlertTitle>
          <AlertDescription>
            {needingSignoff.length} reconciliation(s) awaiting finance officer approval
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <div className="space-y-4">
        {/* Custom Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'cashiers', label: 'Cashier Summary', icon: UsersIcon },
              {
                id: 'pending-reconciliations',
                label: 'Pending Reconciliations',
                badge: cashiersNeedingRecon.length,
              },
              {
                id: 'pending-transfers',
                label: 'Pending Transfers',
                badge: pendingTransfers.length + pendingBankTransfers.length,
              },
              { id: 'finance-signoff', label: 'Finance Sign-off', badge: needingSignoff.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon && <tab.icon className="h-4 w-4" />}
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <Badge variant={tab.id === 'pending-reconciliations' ? 'destructive' : 'default'}>
                    {tab.badge}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Cashier Summary Tab */}
          {activeTab === 'cashiers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cashierSummaries.map(cashier => (
                  <Card key={cashier.cashier_account}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{cashier.cashier_name}</span>
                        {cashier.needs_reconciliation && (
                          <Badge variant="destructive">Needs Recon</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Last reconciled: {cashier.last_reconciled || 'Never'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Current Balance</div>
                          <div className="text-xl font-bold">
                            {parseFloat(cashier.current_balance).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Today&apos;s Collections</div>
                          <div className="text-xl font-bold">
                            {parseFloat(cashier.collections_amount_today).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-sm">
                        <div className="text-muted-foreground">Receipts Today</div>
                        <div className="font-medium">{cashier.collections_today}</div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => {
                            setSelectedCashierId(cashier.cashier_account);
                            setIsCollectionDialogOpen(true);
                          }}
                        >
                          New Collection
                        </Button>
                        {cashier.needs_reconciliation && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedCashierId(cashier.cashier_account);
                              setIsReconciliationDialogOpen(true);
                            }}
                          >
                            Reconcile
                          </Button>
                        )}
                        {parseFloat(cashier.current_balance) > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                              setSelectedCashierId(cashier.cashier_account);
                              setIsTransferDialogOpen(true);
                            }}
                          >
                            Transfer
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Pending Reconciliations Tab */}
          {activeTab === 'pending-reconciliations' && (
            <div className="space-y-4">
              {cashiersNeedingRecon.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2Icon className="h-12 w-12 mx-auto text-green-600 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                    <p className="text-muted-foreground">
                      No cashier accounts require reconciliation at this time.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {cashiersNeedingRecon.map(cashier => (
                    <Card key={cashier.id} className="border-yellow-500">
                      <CardHeader>
                        <CardTitle>{cashier.name}</CardTitle>
                        <CardDescription>Account: {cashier.account_number}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Current Balance</div>
                            <div className="text-2xl font-bold">
                              {parseFloat(cashier.current_balance).toFixed(2)}
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              setSelectedCashierId(cashier.id);
                              setIsReconciliationDialogOpen(true);
                            }}
                          >
                            Start Reconciliation
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Transfers Tab */}
          {activeTab === 'pending-transfers' && (
            <div className="space-y-4">
              {pendingTransfers.length === 0 && pendingBankTransfers.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2Icon className="h-12 w-12 mx-auto text-green-600 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
                    <p className="text-muted-foreground">No pending transfers awaiting approval.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {/* Cash Transfers */}
                  {pendingTransfers.map(transfer => (
                    <Card key={transfer.id}>
                      <CardHeader>
                        <CardTitle>Transfer #{transfer.transfer_number}</CardTitle>
                        <CardDescription>
                          From: {transfer.cashier_name} → To: {transfer.destination_account_name}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Amount</div>
                            <div className="text-2xl font-bold">
                              {parseFloat(transfer.amount).toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground mt-2">
                              Date: {format(new Date(transfer.transfer_date), 'PPP')}
                            </div>
                          </div>
                          <Button
                            onClick={() => navigate(`/treasury/transfers/${transfer.id}/approve`)}
                          >
                            Review & Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Inter-bank Transfers */}
                  {pendingBankTransfers.map(transfer => (
                    <Card key={transfer.id}>
                      <CardHeader>
                        <CardTitle>Inter-bank Transfer #{transfer.transfer_number}</CardTitle>
                        <CardDescription>
                          From: {transfer.source_account_name} → To:{' '}
                          {transfer.destination_account_name}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Amount</div>
                            <div className="text-2xl font-bold">
                              {parseFloat(transfer.amount).toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground mt-2">
                              Date: {format(new Date(transfer.transfer_date), 'PPP')}
                            </div>
                          </div>
                          <Button onClick={() => navigate('/banks/transfers/approvals')}>
                            Review & Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Finance Sign-off Tab */}
          {activeTab === 'finance-signoff' && (
            <div className="space-y-4">
              {needingSignoff.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2Icon className="h-12 w-12 mx-auto text-green-600 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">All Signed Off!</h3>
                    <p className="text-muted-foreground">
                      No reconciliations awaiting finance officer sign-off.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {needingSignoff.map(recon => (
                    <Card key={recon.id}>
                      <CardHeader>
                        <CardTitle>Reconciliation #{recon.id}</CardTitle>
                        <CardDescription>
                          Cashier: {recon.cashier_name} - Date:{' '}
                          {format(new Date(recon.reconciliation_date), 'PPP')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-sm text-muted-foreground">System Balance</div>
                            <div className="font-bold">
                              {parseFloat(recon.system_balance).toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Physical Count</div>
                            <div className="font-bold">
                              {parseFloat(recon.physical_count).toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Variance</div>
                            <div
                              className={`font-bold ${parseFloat(recon.variance) === 0 ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {parseFloat(recon.variance).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => navigate(`/treasury/reconciliations/${recon.id}/signoff`)}
                        >
                          Review & Sign Off
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={isReconciliationDialogOpen} onOpenChange={setIsReconciliationDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cash Reconciliation</DialogTitle>
          </DialogHeader>
          {selectedCashierId && (
            <CashReconciliationForm
              cashierAccountId={selectedCashierId}
              onSuccess={() => {
                setIsReconciliationDialogOpen(false);
                setSelectedCashierId(null);
              }}
              onCancel={() => {
                setIsReconciliationDialogOpen(false);
                setSelectedCashierId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cash Transfer</DialogTitle>
          </DialogHeader>
          {selectedCashierId && (
            <CashTransferForm
              cashierAccountId={selectedCashierId}
              onSuccess={() => {
                setIsTransferDialogOpen(false);
                setSelectedCashierId(null);
              }}
              onCancel={() => {
                setIsTransferDialogOpen(false);
                setSelectedCashierId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TreasuryDashboard;
