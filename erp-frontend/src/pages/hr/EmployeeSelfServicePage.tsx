/**
 * Employee Self-Service Portal
 * Dashboard for employees to view their own HR information:
 * profile, payslips, leave balances, attendance, and documents.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, FileText, Calendar, Clock, DollarSign, Plus, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import hrService from '../../services/hrService';
import type { Staff, Payslip, LeaveBalance, LeaveRequest, Attendance } from '../../types/hr';

type Tab = 'overview' | 'payslips' | 'leave' | 'attendance';

type TabDef = { id: Tab; label: string; icon: React.FC<{ className?: string }> };

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'payslips', label: 'My Payslips', icon: DollarSign },
  { id: 'leave', label: 'Leave', icon: Calendar },
  { id: 'attendance', label: 'Attendance', icon: Clock },
];

const statusColor = (s: string) => {
  switch (s) {
    case 'approved':
    case 'taken':
    case 'present':
      return 'bg-green-100 text-green-800';
    case 'submitted':
    case 'late':
      return 'bg-yellow-100 text-yellow-800';
    case 'rejected':
    case 'absent':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-blue-100 text-blue-800';
  }
};

const EmployeeSelfServicePage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // ─── Queries ──────────────────────────────────────────────────────────
  const {
    data: profile,
    isLoading: loadingProfile,
    error: profileError,
  } = useQuery<Staff>({
    queryKey: ['my-profile'],
    queryFn: () => hrService.getMyProfile(),
  });

  const { data: payslips = [], isLoading: loadingPayslips } = useQuery<Payslip[]>({
    queryKey: ['my-payslips'],
    queryFn: () => hrService.getMyPayslips(),
    enabled: !!profile,
  });

  const { data: leaveBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['my-leave-balances'],
    queryFn: () => hrService.getMyLeaveBalances(),
    enabled: !!profile,
  });

  const { data: leaveRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ['my-leave-requests'],
    queryFn: () => hrService.getMyLeaveRequests(),
    enabled: !!profile,
  });

  const { data: attendance = [] } = useQuery<Attendance[]>({
    queryKey: ['my-attendance'],
    queryFn: () => hrService.getMyAttendance(),
    enabled: !!profile,
  });

  // ─── Error state ──────────────────────────────────────────────────────
  if (profileError) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-semibold">No Staff Profile Found</h2>
          <p className="text-gray-500 max-w-md">
            Your user account is not linked to a staff record. Please contact your HR administrator.
          </p>
        </div>
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">Loading your profile…</p>
      </div>
    );
  }

  const totalLeaveAvailable = leaveBalances.reduce(
    (sum, b) => sum + parseFloat(String(b.available_days || '0')),
    0
  );

  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header / Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
            {profile?.first_name?.[0]}
            {profile?.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Welcome, {profile?.first_name} {profile?.last_name}
            </h1>
            <p className="text-blue-100 text-sm">
              {profile?.position || 'Staff'}
              {profile?.department ? ` · ${profile.department}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="-mb-px flex space-x-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              title={tab.label}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Overview Tab ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalLeaveAvailable.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">Leave days available</p>
                </div>
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{payslips.length}</p>
                  <p className="text-xs text-gray-500">Payslips</p>
                </div>
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{presentCount}</p>
                  <p className="text-xs text-gray-500">Days present (recent)</p>
                </div>
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {leaveRequests.filter(l => l.status === 'submitted').length}
                  </p>
                  <p className="text-xs text-gray-500">Pending leave requests</p>
                </div>
              </div>
            </div>
          </div>

          {/* Leave Balances Card */}
          {leaveBalances.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Leave Balances
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {leaveBalances.map(b => (
                  <div key={b.id} className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">{b.leave_type_name || 'Leave'}</p>
                    <p className="text-xl font-bold text-blue-600">
                      {parseFloat(String(b.available_days || '0')).toFixed(1)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      of {parseFloat(String(b.entitled_days || '0')).toFixed(0)} entitled
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              {profile && (
                <button
                  onClick={() => navigate('/hr/leave-requests/create')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                  title="Apply for leave"
                >
                  <Plus className="h-4 w-4" /> Apply for Leave
                </button>
              )}
              <button
                onClick={() => setActiveTab('payslips')}
                className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-sm"
                title="View payslips"
              >
                <DollarSign className="h-4 w-4" /> View Payslips
              </button>
              <button
                onClick={() => navigate('/hr/leave-calendar')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-sm"
                title="View leave calendar"
              >
                <Calendar className="h-4 w-4" /> Leave Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Payslips Tab ──────────────────────────────────────────────── */}
      {activeTab === 'payslips' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">My Payslips</h3>
          </div>
          {loadingPayslips ? (
            <div className="p-8 text-center text-gray-400">Loading payslips…</div>
          ) : payslips.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No payslips found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Payslip #</th>
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Payroll Ref</th>
                  <th className="text-right px-5 py-2 font-medium text-gray-500">Gross</th>
                  <th className="text-right px-5 py-2 font-medium text-gray-500">Net Pay</th>
                  <th className="text-center px-5 py-2 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(p => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{p.payslip_number || `#${p.id}`}</td>
                    <td className="px-5 py-3 text-gray-600">{p.payroll_reference || ''}</td>
                    <td className="px-5 py-3 text-right">
                      {parseFloat(p.gross_pay || '0').toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {parseFloat(p.net_pay || '0').toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => navigate(`/hr/payslips/${p.id}`)}
                        className="text-blue-600 hover:text-blue-800"
                        title="View payslip"
                      >
                        <FileText className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Leave Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Leave Balances */}
          {leaveBalances.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-3">Leave Balances</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {leaveBalances.map(b => {
                  const available = parseFloat(String(b.available_days || '0'));
                  const entitled = parseFloat(String(b.entitled_days || '0'));
                  const used = parseFloat(String(b.used_days || '0'));
                  const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
                  return (
                    <div key={b.id} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{b.leave_type_name}</p>
                      <div className="flex items-end justify-between mb-1">
                        <span className="text-lg font-bold text-blue-600">
                          {available.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-gray-400">/ {entitled.toFixed(0)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{used.toFixed(1)} used</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leave Requests */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">My Leave Requests</h3>
              <button
                onClick={() => navigate('/hr/leave-requests/create')}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                title="Apply for leave"
              >
                <Plus className="h-3 w-3" /> Apply
              </button>
            </div>
            {leaveRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No leave requests yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-5 py-2 font-medium text-gray-500">From</th>
                    <th className="text-left px-5 py-2 font-medium text-gray-500">To</th>
                    <th className="text-right px-5 py-2 font-medium text-gray-500">Days</th>
                    <th className="text-center px-5 py-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map(lr => (
                    <tr
                      key={lr.id}
                      onClick={() => navigate(`/hr/leave-requests/${lr.id}`)}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3">{lr.leave_type_name}</td>
                      <td className="px-5 py-3 text-gray-600">{lr.start_date}</td>
                      <td className="px-5 py-3 text-gray-600">{lr.end_date}</td>
                      <td className="px-5 py-3 text-right">{lr.num_days}</td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(lr.status)}`}
                        >
                          {lr.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Attendance Tab ────────────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Recent Attendance</h3>
          </div>
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No attendance records found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Date</th>
                  <th className="text-center px-5 py-2 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Clock In</th>
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Clock Out</th>
                  <th className="text-right px-5 py-2 font-medium text-gray-500">Hours</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map(a => (
                  <tr key={a.id} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{a.date}</td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.status || '')}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{a.clock_in || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{a.clock_out || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {a.hours_worked ? parseFloat(a.hours_worked).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeSelfServicePage;
