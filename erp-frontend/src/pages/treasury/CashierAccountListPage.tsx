// src/pages/treasury/CashierAccountListPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, PauseCircle, Plus, Search, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cashierAccountService } from '../../services/treasuryService';
import type { CashierAccount } from '../../types/treasury';
import Dialog, {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Label } from '../../components/ui/Label';
import { UserSelect } from '../../components/ui/UserSelect';

const ReassignCashierDialog: React.FC<{
  account: CashierAccount | null;
  onClose: () => void;
}> = ({ account, onClose }) => {
  const queryClient = useQueryClient();
  const [newCashier, setNewCashier] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (cashierId: number) =>
      cashierAccountService.reassignCashier(account!.id, cashierId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-accounts'] });
      toast.success('Cashier account reassigned');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to reassign cashier account');
    },
  });

  return (
    <Dialog open={!!account} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign Cashier Account</DialogTitle>
          <DialogDescription>
            {account &&
              `Change who's responsible for ${account.name} (${account.account_number}). ` +
                `The till, its balance, and its transaction history are unaffected — only the ` +
                `assigned cashier changes.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="new-cashier" className="text-sm font-medium text-gray-700">
            New Cashier
          </Label>
          <UserSelect
            value={newCashier}
            onChange={setNewCashier}
            placeholder="Search and select a user"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => newCashier && mutation.mutate(newCashier)}
            disabled={!newCashier || mutation.isPending}
          >
            {mutation.isPending ? 'Reassigning…' : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const fmt = (v: string | number | undefined) =>
  v !== undefined && v !== null
    ? parseFloat(String(v)).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
      })
    : '—';

const CashierAccountListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [reassignTarget, setReassignTarget] = useState<CashierAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['cashier-accounts'],
    queryFn: () => cashierAccountService.getAll(),
    staleTime: 30_000,
  });

  const filtered = accounts.filter(
    a =>
      search.trim() === '' ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.account_number.toLowerCase().includes(search.toLowerCase()) ||
      (a.cashier_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const active = accounts.filter(a => a.is_active && !a.is_suspended).length;
  const suspended = accounts.filter(a => a.is_suspended).length;
  const needsReconciliation = accounts.filter(a => a.needs_reconciliation).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-500" size={22} />
            Cashier Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Virtual cash tills and floats assigned to cashier staff
          </p>
        </div>
        <Link
          to="/treasury/cashier-accounts/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Account
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-sm font-medium text-gray-600">Active</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{active}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <PauseCircle size={16} className="text-amber-500" />
            <span className="text-sm font-medium text-gray-600">Suspended</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{suspended}</p>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 p-4 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Needs Reconciliation</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{needsReconciliation}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          title="Search cashier accounts"
          placeholder="Search account, cashier name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-14 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No cashier accounts found</p>
            <Link
              to="/treasury/cashier-accounts/new"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Plus size={14} /> Create the first cashier account
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Account #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Cashier</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">GL Account</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Daily Limit</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Recon</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {a.account_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.cashier_name ?? `User #${a.cashier}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.account_name ? (
                        <span>
                          {a.account_code && (
                            <span className="text-xs text-gray-400 mr-1">{a.account_code}</span>
                          )}
                          {a.account_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmt(a.current_balance)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {a.daily_collection_limit ? fmt(a.daily_collection_limit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.is_suspended ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                          <PauseCircle size={10} /> Suspended
                        </span>
                      ) : a.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          <CheckCircle size={10} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.needs_reconciliation ? (
                        <span
                          title="Needs reconciliation"
                          className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"
                        />
                      ) : (
                        <span
                          title="Up to date"
                          className="inline-block w-2.5 h-2.5 rounded-full bg-green-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setReassignTarget(a)}
                        title="Reassign cashier"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                      >
                        <UserCog size={14} />
                        Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReassignCashierDialog account={reassignTarget} onClose={() => setReassignTarget(null)} />
    </div>
  );
};

export default CashierAccountListPage;
