// src/components/receivables/StatementPreview.tsx
import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Mail,
  Printer,
  Calendar,
  User,
  DollarSign,
  X,
  Send,
  Eye,
  AlertCircle,
} from 'lucide-react';
import {
  StatementPreview as StatementPreviewType,
  StatementEmailData,
} from '../../types/statements';
import { receivablesService } from '../../services/receivablesService';

interface StatementPreviewProps {
  statementId?: number;
  previewData?: StatementPreviewType;
  onClose: () => void;
  onEmailSent?: () => void;
  onDownload?: () => void;
}

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (emailData: StatementEmailData) => void;
  clientEmail: string;
  statementNumber?: string;
  isLoading: boolean;
}

const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  onSend,
  clientEmail,
  statementNumber,
  isLoading,
}) => {
  const [emailData, setEmailData] = useState<StatementEmailData>({
    email: clientEmail,
    subject: `Account Statement ${statementNumber || ''}`,
    message: `Dear Valued Customer,

Please find attached your account statement for the specified period.

If you have any questions about your statement or need assistance with payment arrangements, please don't hesitate to contact us.

Thank you for your business.

Best regards,
Accounts Department`,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(emailData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Send Statement via Email</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Email Address
              </label>
              <input
                type="email"
                value={emailData.email}
                onChange={e => setEmailData({ ...emailData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={emailData.subject}
                onChange={e => setEmailData({ ...emailData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={emailData.message}
                onChange={e => setEmailData({ ...emailData, message: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Statement
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const StatementPreview: React.FC<StatementPreviewProps> = ({
  statementId,
  previewData,
  onClose,
  onEmailSent,
  onDownload,
}) => {
  const [statement, setStatement] = useState<StatementPreviewType | null>(previewData || null);
  const [loading, setLoading] = useState(!previewData && !!statementId);
  const [error, setError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    if (statementId && !previewData) {
      loadStatement();
    }
  }, [statementId, previewData]);

  const loadStatement = async () => {
    if (!statementId) return;

    try {
      setLoading(true);
      setError(null);

      // For now, we'll create mock data since the API might not have preview endpoint
      // In a real implementation, this would call the API
      const mockStatement: StatementPreviewType = {
        client: {
          id: 1,
          full_name: 'John Doe',
          email: 'john.doe@example.com',
          phone: '+234 801 234 5678',
          address: '123 Main Street, Lagos, Nigeria',
        },
        period_start: '2025-01-01',
        period_end: '2025-01-31',
        opening_balance: '50000.00',
        closing_balance: '85000.00',
        total_charges: '50000.00',
        total_payments: '15000.00',
        transaction_count: 5,
        statement_date: new Date().toISOString().split('T')[0],
        transactions: [
          {
            id: 1,
            date: '2025-01-01',
            reference: 'Opening Balance',
            description: 'Balance brought forward',
            charges: '0.00',
            payments: '0.00',
            balance: '50000.00',
            type: 'charge',
          },
          {
            id: 2,
            date: '2025-01-05',
            reference: 'INV-20250105-001',
            description: 'Consulting Services - January',
            charges: '25000.00',
            payments: '0.00',
            balance: '75000.00',
            type: 'charge',
          },
          {
            id: 3,
            date: '2025-01-10',
            reference: 'PMT-001',
            description: 'Payment received - Bank Transfer',
            charges: '0.00',
            payments: '15000.00',
            balance: '60000.00',
            type: 'payment',
          },
          {
            id: 4,
            date: '2025-01-15',
            reference: 'INV-20250115-002',
            description: 'Additional Services',
            charges: '25000.00',
            payments: '0.00',
            balance: '85000.00',
            type: 'charge',
          },
        ],
      };

      setStatement(mockStatement);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSend = async (emailData: StatementEmailData) => {
    if (!statementId) return;

    try {
      setEmailLoading(true);
      await receivablesService.sendStatement(statementId, emailData);
      setShowEmailModal(false);
      onEmailSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send statement');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleDownload = () => {
    // In a real implementation, this would download the PDF
    if (statement) {
      // Create a simple text version for demo
      const content = `
ACCOUNT STATEMENT

Customer: ${statement.client.full_name}
Period: ${statement.period_start} to ${statement.period_end}
Statement Date: ${statement.statement_date}

Opening Balance: ₦${parseFloat(statement.opening_balance).toLocaleString()}
Total Charges: ₦${parseFloat(statement.total_charges).toLocaleString()}
Total Payments: ₦${parseFloat(statement.total_payments).toLocaleString()}
Closing Balance: ₦${parseFloat(statement.closing_balance).toLocaleString()}

TRANSACTIONS:
${statement.transactions
  .map(
    t =>
      `${t.date} | ${t.reference} | ${t.description} | Charges: ₦${parseFloat(t.charges).toLocaleString()} | Payments: ₦${parseFloat(t.payments).toLocaleString()} | Balance: ₦${parseFloat(t.balance).toLocaleString()}`
  )
  .join('\n')}
      `;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${statement.client.full_name.replace(/\s+/g, '-')}-${statement.statement_date}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    onDownload?.();
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: string) => {
    return `₦${parseFloat(amount).toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            <span className="text-gray-700">Loading statement...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
          <div className="flex items-center space-x-3 text-red-600 mb-4">
            <AlertCircle className="h-6 w-6" />
            <span className="font-semibold">Error Loading Statement</span>
          </div>
          <p className="text-gray-700 mb-4">{error}</p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Close
            </button>
            <button
              onClick={loadStatement}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!statement) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-gray-50">
            <div className="flex items-center space-x-3">
              <FileText className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-semibold text-gray-900">Statement Preview</h2>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center px-3 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </button>

              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Statement Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
            <div className="p-8 print:p-0">
              {/* Statement Header */}
              <div className="mb-8">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">ACCOUNT STATEMENT</h1>
                  <p className="text-gray-600">
                    Statement Date: {formatDate(statement.statement_date)}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Customer Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      Customer Information
                    </h3>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium">Name:</span> {statement.client.full_name}
                      </p>
                      <p>
                        <span className="font-medium">Email:</span> {statement.client.email}
                      </p>
                      {statement.client.phone && (
                        <p>
                          <span className="font-medium">Phone:</span> {statement.client.phone}
                        </p>
                      )}
                      {statement.client.address && (
                        <p>
                          <span className="font-medium">Address:</span> {statement.client.address}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Statement Period */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      Statement Period
                    </h3>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium">From:</span>{' '}
                        {formatDate(statement.period_start)}
                      </p>
                      <p>
                        <span className="font-medium">To:</span> {formatDate(statement.period_end)}
                      </p>
                      <p>
                        <span className="font-medium">Transactions:</span>{' '}
                        {statement.transaction_count}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Balance Summary */}
                <div className="bg-indigo-50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Balance Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Opening Balance</p>
                      <p className="font-semibold text-lg">
                        {formatCurrency(statement.opening_balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Charges</p>
                      <p className="font-semibold text-lg text-red-600">
                        {formatCurrency(statement.total_charges)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Payments</p>
                      <p className="font-semibold text-lg text-green-600">
                        {formatCurrency(statement.total_payments)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Closing Balance</p>
                      <p className="font-semibold text-lg text-indigo-600">
                        {formatCurrency(statement.closing_balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transaction Details */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Transaction Details</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reference
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Charges
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payments
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {statement.transactions.map(transaction => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {transaction.reference}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.description}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            {parseFloat(transaction.charges) > 0 ? (
                              <span className="text-red-600 font-medium">
                                {formatCurrency(transaction.charges)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            {parseFloat(transaction.payments) > 0 ? (
                              <span className="text-green-600 font-medium">
                                {formatCurrency(transaction.payments)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                            {formatCurrency(transaction.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-600">
                <p>This is a computer-generated statement and does not require a signature.</p>
                <p className="mt-1">For inquiries, please contact our accounts department.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSend={handleEmailSend}
        clientEmail={statement.client.email}
        statementNumber={`STMT-${statement.statement_date}`}
        isLoading={emailLoading}
      />
    </>
  );
};

export default StatementPreview;
