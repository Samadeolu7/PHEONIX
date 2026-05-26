// src/pages/hr/PayslipListPage.tsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, FileText, Mail, Search } from 'lucide-react';
import { hrService } from '../../services/hrService';

const PAGE_SIZE = 25;

const fmt = (v: string | undefined) =>
  v
    ? parseFloat(v).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
      })
    : '—';

const PayslipListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [emailing, setEmailing] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payslips-list', search, page],
    queryFn: () =>
      hrService.getPayslips({
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  const payslips = data?.results ?? [];
  const totalPages = data?.count ? Math.ceil(data.count / PAGE_SIZE) : 1;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleDownload = async (id: number, payslipNumber: string) => {
    setDownloading(id);
    try {
      const blob = await hrService.downloadPayslipPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${payslipNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download payslip PDF');
    } finally {
      setDownloading(null);
    }
  };

  const handleEmail = async (id: number) => {
    setEmailing(id);
    try {
      const res = await hrService.emailPayslip(id);
      showToast((res as { message?: string }).message ?? 'Payslip emailed successfully');
    } catch {
      showToast('Failed to send payslip email');
    } finally {
      setEmailing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="text-blue-500" size={22} />
          Payslips
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Download and email staff payslips across all payroll periods
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          title="Search payslips"
          placeholder="Search staff name, payslip #…"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-14 text-gray-400 text-sm">Loading…</div>
        ) : payslips.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No payslips found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Payslip #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Staff</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Payroll</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Basic Salary</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Gross Pay</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Net Pay</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Deductions</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">PDF</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payslips.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">
                      {p.payslip_number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.staff_name}</p>
                      <p className="text-xs text-gray-400">{p.staff_id}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.payroll_reference}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.basic_salary)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.gross_pay)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {fmt(p.net_pay)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">{fmt(p.total_deductions)}</td>
                    <td className="px-4 py-3 text-center">
                      {p.pdf_file ? (
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-green-400"
                          title="PDF available"
                        />
                      ) : (
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-gray-200"
                          title="No PDF yet"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          title="Download PDF"
                          disabled={downloading === p.id}
                          onClick={() => handleDownload(p.id, p.payslip_number)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
                        >
                          {downloading === p.id ? (
                            <span className="text-xs">…</span>
                          ) : (
                            <Download size={15} />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Email payslip to staff"
                          disabled={emailing === p.id}
                          onClick={() => handleEmail(p.id)}
                          className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40"
                        >
                          {emailing === p.id ? (
                            <span className="text-xs">…</span>
                          ) : (
                            <Mail size={15} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} ({data?.count} payslips)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                title="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                title="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayslipListPage;
