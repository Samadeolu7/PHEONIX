/**
 * Group Report
 * All client groups with members, savings balances, and loan status.
 * Route: /reports/clients/groups
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { clientService, ClientGroup, Client } from '../../services/clientService';
import { loanService, LoanAccountList } from '../../services/loanService';
import { getSavingsAccounts, SavingsAccount } from '../../services/savingsService';
import api from '../../services/api';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface GroupMemberDetail {
  client: Client;
  savingsBalance: number;
  outstandingLoan: number;
  daysInArrears: number;
  loanStatus: string;
}

interface ExpandedGroupData {
  loading: boolean;
  error: string | null;
  members: GroupMemberDetail[];
}

// ── Member status badge ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:     'bg-green-100 text-green-700',
    defaulted:  'bg-red-100 text-red-700',
    paid_off:   'bg-blue-100 text-blue-700',
    disbursed:  'bg-purple-100 text-purple-700',
    pending:    'bg-yellow-100 text-yellow-700',
    none:       'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status === 'none' ? 'No Loan' : status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function GroupReportPage() {
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [groupData, setGroupData] = useState<Record<number, ExpandedGroupData>>({});

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientService.listClientGroups({});
      setGroups(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  async function loadGroupMembers(groupId: number) {
    if (groupData[groupId] && !groupData[groupId].loading) return;

    setGroupData(prev => ({
      ...prev,
      [groupId]: { loading: true, error: null, members: [] },
    }));

    try {
      // Fetch group members
      const membersRes: any = await api.get(`/clients/groups/${groupId}/members/`);
      const members: Client[] = Array.isArray(membersRes)
        ? membersRes
        : (membersRes?.results ?? membersRes?.members ?? []);

      // For each member, fetch their active loan and savings
      const details: GroupMemberDetail[] = await Promise.all(
        members.map(async (client: Client) => {
          const [loanRes, savingsRes] = await Promise.allSettled([
            loanService.listLoans({ client: client.id, status: 'active' }),
            getSavingsAccounts({ client: client.id }),
          ]);

          // Loan data
          let outstandingLoan = 0;
          let daysInArrears = 0;
          let loanStatus = 'none';
          if (loanRes.status === 'fulfilled') {
            const lr = loanRes.value as any;
            const loans: LoanAccountList[] = Array.isArray(lr) ? lr : (lr?.results ?? []);
            if (loans.length > 0) {
              outstandingLoan = parseFloat(loans[0].outstanding_principal ?? '0');
              daysInArrears = loans[0].days_in_arrears ?? 0;
              loanStatus = loans[0].status;
            }
          }

          // Savings data
          let savingsBalance = 0;
          if (savingsRes.status === 'fulfilled') {
            const sr = savingsRes.value as any;
            const accs: SavingsAccount[] = Array.isArray(sr) ? sr : (sr?.results ?? []);
            const activeAccs = accs.filter((a: SavingsAccount) => a.status === 'active');
            savingsBalance = activeAccs.reduce(
              (sum: number, a: SavingsAccount) => sum + parseFloat(String(a.current_balance ?? '0')),
              0
            );
          }

          return { client, savingsBalance, outstandingLoan, daysInArrears, loanStatus };
        })
      );

      setGroupData(prev => ({
        ...prev,
        [groupId]: { loading: false, error: null, members: details },
      }));
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setGroupData(prev => ({
        ...prev,
        [groupId]: {
          loading: false,
          error: err?.detail ?? err?.message ?? 'Failed to load members.',
          members: [],
        },
      }));
    }
  }

  function toggleGroup(groupId: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
        loadGroupMembers(groupId);
      }
      return next;
    });
  }

  function handleExportCsv() {
    const rows: string[][] = [
      ['Group Name', 'Code', 'Meeting Day', 'Leader', 'Members', 'Active'],
      ...filtered.map(g => [
        g.name,
        g.group_code,
        g.meeting_day ?? '',
        g.group_leader_name ?? '',
        String(g.members_count),
        g.is_active ? 'Yes' : 'No',
      ]),
    ];
    // Add member details for expanded groups
    expanded.forEach(gid => {
      const gd = groupData[gid];
      if (gd && gd.members.length > 0) {
        const group = groups.find(g => g.id === gid);
        rows.push([]);
        rows.push([`Members of: ${group?.name ?? gid}`]);
        rows.push(['Client Name', 'Savings Balance', 'Outstanding Loan', 'Days in Arrears', 'Loan Status']);
        gd.members.forEach(m => {
          rows.push([
            m.client.full_name,
            m.savingsBalance.toFixed(2),
            m.outstandingLoan.toFixed(2),
            String(m.daysInArrears),
            m.loanStatus,
          ]);
        });
      }
    });

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.group_code.toLowerCase().includes(search.toLowerCase()) ||
    (g.group_leader_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            to="/reports"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Users size={20} className="text-[#0a1857]" />
              <h1 className="text-xl font-bold text-gray-900">Group Report</h1>
            </div>
            <p className="text-sm text-gray-500">
              All client groups — members, savings and loan status
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        {/* Toolbar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search groups…"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadGroups}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={groups.length === 0}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Loading */}
        {loading && groups.length === 0 && (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
        )}

        {/* Groups table */}
        {filtered.length === 0 && !loading ? (
          <div className="rounded-xl bg-white py-16 text-center text-sm text-gray-400 shadow-sm">
            {search ? `No groups match "${search}"` : 'No groups found.'}
          </div>
        ) : (
          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th scope="col" aria-label="Expand" className="px-4 py-3 w-6" />
                  <th className="px-4 py-3">Group Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Meeting Day</th>
                  <th className="px-4 py-3">Leader</th>
                  <th className="px-4 py-3 text-center">Members</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(group => (
                  <React.Fragment key={group.id}>
                    {/* Group row */}
                    <tr
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${expanded.has(group.id) ? 'bg-blue-50' : ''}`}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expanded.has(group.id)
                          ? <ChevronDown size={16} />
                          : <ChevronRight size={16} />
                        }
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{group.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{group.group_code}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">
                        {group.meeting_day ?? '—'}
                        {group.meeting_frequency && (
                          <span className="ml-1 text-xs text-gray-400">({group.meeting_frequency})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{group.group_leader_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {group.members_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          group.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {group.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {expanded.has(group.id) ? 'Collapse' : 'View Members'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded member rows */}
                    {expanded.has(group.id) && (
                      <tr>
                        <td colSpan={8} className="px-0 py-0">
                          <div className="bg-blue-50 border-b border-blue-100">
                            {/* Member table header */}
                            <div className="px-8 py-2 text-xs font-semibold uppercase tracking-wide text-blue-600 border-b border-blue-100">
                              Members of {group.name}
                            </div>

                            {groupData[group.id]?.loading ? (
                              <div className="flex justify-center py-6">
                                <Loader2 size={18} className="animate-spin text-blue-600" />
                              </div>
                            ) : groupData[group.id]?.error ? (
                              <div className="flex items-center gap-2 px-8 py-4 text-sm text-red-600">
                                <AlertCircle size={14} />
                                {groupData[group.id].error}
                              </div>
                            ) : groupData[group.id]?.members.length === 0 ? (
                              <div className="px-8 py-6 text-sm text-gray-400">
                                No members found for this group.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-blue-500">
                                      <th className="px-8 py-2">Member Name</th>
                                      <th className="px-4 py-2 text-right">Savings Balance</th>
                                      <th className="px-4 py-2 text-right">Outstanding Loan</th>
                                      <th className="px-4 py-2 text-center">Days in Arrears</th>
                                      <th className="px-4 py-2">Loan Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-blue-100">
                                    {groupData[group.id].members.map(m => (
                                      <tr key={m.client.id} className="hover:bg-blue-100/40">
                                        <td className="px-8 py-2.5 font-medium text-gray-900">
                                          {m.client.full_name}
                                          <span className="ml-2 text-xs text-gray-400">
                                            {m.client.client_id}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-green-700 font-medium">
                                          ₦{fmt(m.savingsBalance)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-gray-900">
                                          {m.outstandingLoan > 0 ? `₦${fmt(m.outstandingLoan)}` : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                          {m.daysInArrears > 0 ? (
                                            <span className="text-red-600 font-medium">
                                              {m.daysInArrears}d
                                            </span>
                                          ) : '—'}
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <StatusBadge status={m.loanStatus} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-blue-200 bg-blue-100/50">
                                      <td className="px-8 py-2 text-xs font-semibold text-blue-700">
                                        Group Total ({groupData[group.id].members.length} members)
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs font-bold text-green-700">
                                        ₦{fmt(groupData[group.id].members.reduce((s, m) => s + m.savingsBalance, 0))}
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">
                                        ₦{fmt(groupData[group.id].members.reduce((s, m) => s + m.outstandingLoan, 0))}
                                      </td>
                                      <td colSpan={2} />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-500">
              {filtered.length} group{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
              {' '}— {groups.filter(g => g.is_active).length} active
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
