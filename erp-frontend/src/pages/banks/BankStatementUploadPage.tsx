// src/pages/banks/BankStatementUploadPage.tsx
/**
 * Bank Statement Upload & Manual Reconciliation
 * Feature #2 — Bank Statement Reconciliation
 *
 * Route: /banks/statement-uploads
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  bankStatementService,
  BankStatementUpload,
  BankStatementLine,
  MatchStatus,
} from '../../services/bankStatementService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  X,
  Link2,
  RefreshCw,
  Eye,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-blue-100 text-blue-800',
  processing: 'bg-yellow-100 text-yellow-800',
  processed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const MATCH_COLORS: Record<MatchStatus, string> = {
  unmatched: 'bg-red-100 text-red-700',
  auto_matched: 'bg-green-100 text-green-700',
  manual_matched: 'bg-blue-100 text-blue-700',
  exception: 'bg-yellow-100 text-yellow-700',
};

const BankStatementUploadPage: React.FC = () => {
  const { selectedRole } = useAuth();
  const { success, error: showError } = useToast();

  const [uploads, setUploads] = useState<BankStatementUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUpload, setSelectedUpload] = useState<BankStatementUpload | null>(null);
  const [lines, setLines] = useState<BankStatementLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);

  // Manual match modal
  const [matchingLine, setMatchingLine] = useState<BankStatementLine | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [matching, setMatching] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await bankStatementService.listUploads();
      setUploads(data);
    } catch {
      showError('Failed to load statement uploads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadLines = useCallback(async (upload: BankStatementUpload, unmatchedOnly = false) => {
    try {
      setLinesLoading(true);
      const data = unmatchedOnly
        ? await bankStatementService.getUnmatchedLines(upload.id)
        : await bankStatementService.getUploadLines(upload.id);
      setLines(data);
    } catch {
      showError('Failed to load statement lines');
    } finally {
      setLinesLoading(false);
    }
  }, []);

  const handleSelectUpload = async (upload: BankStatementUpload) => {
    setSelectedUpload(upload);
    setShowUnmatchedOnly(false);
    await loadLines(upload, false);
  };

  const handleToggleUnmatched = async () => {
    if (!selectedUpload) return;
    const next = !showUnmatchedOnly;
    setShowUnmatchedOnly(next);
    await loadLines(selectedUpload, next);
  };

  const handleMatchLine = async () => {
    if (!matchingLine || !selectedUpload || !transactionId.trim()) {
      showError('Please enter a transaction ID');
      return;
    }
    try {
      setMatching(true);
      await bankStatementService.matchLine(selectedUpload.id, {
        line_id: matchingLine.id,
        transaction_id: Number(transactionId),
      });
      success('Line matched successfully');
      setMatchingLine(null);
      setTransactionId('');
      await loadLines(selectedUpload, showUnmatchedOnly);
      // Refresh upload summary (matched_count may have changed)
      const updated = await bankStatementService.getUpload(selectedUpload.id);
      setSelectedUpload(updated);
      setUploads((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to match line');
    } finally {
      setMatching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Upload className="w-6 h-6 text-blue-600" />
          Bank Statement Reconciliation
        </h1>
        <button onClick={() => load()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload list */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Uploads</h2>
          </div>
          <div className="divide-y max-h-[480px] overflow-y-auto">
            {uploads.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectUpload(u)}
                className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start justify-between gap-2 ${
                  selectedUpload?.id === u.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {u.bank_account_number}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(u.statement_date_from).toLocaleDateString()} –{' '}
                    {new Date(u.statement_date_to).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u.matched_count}/{u.row_count} matched
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status]}`}>
                    {u.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
            {uploads.length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">No uploads found.</p>
            )}
          </div>
        </div>

        {/* Lines panel */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {!selectedUpload ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
              <Eye className="w-10 h-10 mb-2" />
              <p className="text-sm">Select an upload to view lines</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">
                    Lines — {selectedUpload.bank_account_number}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedUpload.matched_count} matched · {selectedUpload.unmatched_count} unmatched
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showUnmatchedOnly}
                    onChange={handleToggleUnmatched}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Show unmatched only</span>
                </label>
              </div>

              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                {linesLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                  </div>
                ) : lines.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10">
                    {showUnmatchedOnly ? 'No unmatched lines!' : 'No lines found.'}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Debit</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Credit</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Match</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {new Date(line.line_date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">
                            {line.description}
                          </td>
                          <td className="px-3 py-2 text-right text-red-700">
                            {Number(line.debit_amount) > 0
                              ? Number(line.debit_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-green-700">
                            {Number(line.credit_amount) > 0
                              ? Number(line.credit_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_COLORS[line.match_status]}`}>
                              {line.match_status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {line.match_status === 'unmatched' && (
                              <button
                                onClick={() => { setMatchingLine(line); setTransactionId(''); }}
                                className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                                title="Match manually"
                              >
                                <Link2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manual match modal */}
      {matchingLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />
                Manual Match
              </h2>
              <button
                onClick={() => setMatchingLine(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Statement Line</p>
                <p className="font-medium text-gray-800 mt-0.5">{matchingLine.description}</p>
                <p className="text-xs text-gray-500">{new Date(matchingLine.line_date).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Enter GL transaction ID…"
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleMatchLine}
                  disabled={matching || !transactionId.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {matching ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle className="w-4 h-4" />}
                  Match
                </button>
                <button
                  onClick={() => setMatchingLine(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankStatementUploadPage;
