// src/pages/receivables/BulkPaymentUpload.tsx
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
  X,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { invoiceService } from '../../services/invoiceService';

interface PaymentRecord {
  row: number;
  invoice_number: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
}

interface PaymentValidation {
  row: number;
  invoice_number: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
  status: 'valid' | 'warning' | 'error';
  message?: string;
  invoice_id?: number;
  invoice_balance?: string;
  client_name?: string;
}

interface ProcessingResult {
  row: number;
  invoice_number: string;
  amount: string;
  status: 'success' | 'failed';
  message: string;
  invoice_id?: number;
  client_name?: string;
}

interface FieldMapping {
  invoice_number: number;
  amount: number;
  payment_date: number;
  payment_method: number;
  reference?: number;
  notes?: number;
}

const BulkPaymentUpload: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State management
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    invoice_number: 0,
    amount: 1,
    payment_date: 2,
    payment_method: 3,
    reference: 4,
    notes: 5,
  });
  const [validatedPayments, setValidatedPayments] = useState<PaymentValidation[]>([]);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);

  // UI state
  const [currentStep, setCurrentStep] = useState<
    'upload' | 'mapping' | 'validation' | 'processing' | 'results'
  >('upload');
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Payment method options
  const paymentMethods = ['cash', 'bank_transfer', 'check', 'online', 'other'];

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
      showError('Please upload a CSV file');
      return;
    }

    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        showError('CSV file must contain at least a header row and one data row');
        return;
      }

      const parsedData = lines.map(line => {
        // Simple CSV parsing - handle quoted fields
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      });

      setHeaders(parsedData[0]);
      setCsvData(parsedData.slice(1));
      setCurrentStep('mapping');
    };

    reader.readAsText(uploadedFile);
  };

  // Handle field mapping
  const handleMappingChange = (field: keyof FieldMapping, columnIndex: number) => {
    setFieldMapping(prev => ({
      ...prev,
      [field]: columnIndex,
    }));
  };

  // Validate payments
  const validatePayments = async () => {
    setIsValidating(true);
    const validations: PaymentValidation[] = [];

    try {
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const payment: PaymentRecord = {
          row: i + 2, // +2 because we start from row 2 (after header)
          invoice_number: row[fieldMapping.invoice_number]?.trim() || '',
          amount: row[fieldMapping.amount]?.trim() || '',
          payment_date: row[fieldMapping.payment_date]?.trim() || '',
          payment_method: row[fieldMapping.payment_method]?.trim().toLowerCase() || '',
          reference:
            fieldMapping.reference !== undefined ? row[fieldMapping.reference]?.trim() : '',
          notes: fieldMapping.notes !== undefined ? row[fieldMapping.notes]?.trim() : '',
        };

        const validation: PaymentValidation = {
          ...payment,
          status: 'valid',
          message: '',
        };

        // Basic validation
        if (!payment.invoice_number) {
          validation.status = 'error';
          validation.message = 'Invoice number is required';
        } else if (
          !payment.amount ||
          isNaN(parseFloat(payment.amount)) ||
          parseFloat(payment.amount) <= 0
        ) {
          validation.status = 'error';
          validation.message = 'Valid payment amount is required';
        } else if (!payment.payment_date) {
          validation.status = 'error';
          validation.message = 'Payment date is required';
        } else if (!paymentMethods.includes(payment.payment_method)) {
          validation.status = 'error';
          validation.message = `Invalid payment method. Must be one of: ${paymentMethods.join(', ')}`;
        } else {
          // Validate date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(payment.payment_date)) {
            validation.status = 'error';
            validation.message = 'Payment date must be in YYYY-MM-DD format';
          } else {
            // Try to find the invoice
            try {
              const invoicesResponse = await invoiceService.getInvoices({
                search: payment.invoice_number,
              });

              console.log('Invoice search response:', invoicesResponse); // Debug log
              console.log('Payment invoice number:', payment.invoice_number); // Debug log

              const invoices =
                invoicesResponse.results ||
                invoicesResponse.data?.results ||
                invoicesResponse.data ||
                [];
              console.log('Found invoices:', invoices); // Debug log
              console.log('Number of invoices found:', invoices.length); // Debug log

              // Log each invoice number for comparison
              invoices.forEach((inv: any, index: number) => {
                console.log(`Invoice ${index + 1}: "${inv.invoice_number}" (ID: ${inv.id})`);
              });

              // Try exact match first
              let invoice = invoices.find(
                (inv: any) => inv.invoice_number === payment.invoice_number
              );

              console.log(
                'Exact match result:',
                invoice ? `Found: ${invoice.invoice_number}` : 'Not found'
              );

              // If no exact match, try case-insensitive match
              if (!invoice) {
                invoice = invoices.find(
                  (inv: any) =>
                    inv.invoice_number?.toLowerCase() === payment.invoice_number.toLowerCase()
                );
                console.log(
                  'Case-insensitive match result:',
                  invoice ? `Found: ${invoice.invoice_number}` : 'Not found'
                );
              }

              // If still no match, try partial match
              if (!invoice) {
                invoice = invoices.find(
                  (inv: any) =>
                    inv.invoice_number?.includes(payment.invoice_number) ||
                    payment.invoice_number.includes(inv.invoice_number)
                );
                console.log(
                  'Partial match result:',
                  invoice ? `Found: ${invoice.invoice_number}` : 'Not found'
                );
              }

              if (!invoice) {
                validation.status = 'error';
                validation.message = `Invoice not found. Searched for: "${payment.invoice_number}". Found ${invoices.length} invoices in search results.`;
                console.log('FINAL RESULT: Invoice not found');
              } else if (invoice.status === 'paid') {
                validation.status = 'warning';
                validation.message = 'Invoice is already fully paid';
                validation.invoice_id = invoice.id;
                validation.invoice_balance = invoice.balance;
                validation.client_name = invoice.client_name;
                console.log('FINAL RESULT: Invoice already paid');
              } else if (parseFloat(payment.amount) > parseFloat(invoice.balance)) {
                validation.status = 'error';
                validation.message = `Payment amount (${payment.amount}) exceeds invoice balance (${invoice.balance})`;
                validation.invoice_id = invoice.id;
                validation.invoice_balance = invoice.balance;
                validation.client_name = invoice.client_name;
                console.log('FINAL RESULT: Payment amount exceeds balance');
              } else {
                validation.invoice_id = invoice.id;
                validation.invoice_balance = invoice.balance;
                validation.client_name = invoice.client_name;

                if (parseFloat(payment.amount) === parseFloat(invoice.balance)) {
                  validation.message = 'Will fully pay invoice';
                } else {
                  validation.message = 'Partial payment - valid';
                }
                console.log('FINAL RESULT: Valid payment');
              }
            } catch (error) {
              console.error('Error validating invoice:', error); // Debug log
              validation.status = 'error';
              validation.message = `Error validating invoice: ${error.message || 'Unknown error'}`;
            }
          }
        }

        validations.push(validation);
      }

      setValidatedPayments(validations);
      setCurrentStep('validation');
    } catch (error) {
      showError('Error validating payments');
    } finally {
      setIsValidating(false);
    }
  };

  // Process payments
  const processPayments = async () => {
    setIsProcessing(true);
    const results: ProcessingResult[] = [];

    // Only process valid payments
    const validPayments = validatedPayments.filter(
      p => p.status === 'valid' || p.status === 'warning'
    );

    try {
      for (const payment of validPayments) {
        if (!payment.invoice_id) continue;

        try {
          await invoiceService.recordPayment(payment.invoice_id, {
            amount: payment.amount,
            payment_date: payment.payment_date,
            payment_method: payment.payment_method,
            reference: payment.reference,
            notes: payment.notes,
          });

          results.push({
            row: payment.row,
            invoice_number: payment.invoice_number,
            amount: payment.amount,
            status: 'success',
            message: 'Payment recorded successfully',
            invoice_id: payment.invoice_id,
            client_name: payment.client_name,
          });
        } catch (error: any) {
          results.push({
            row: payment.row,
            invoice_number: payment.invoice_number,
            amount: payment.amount,
            status: 'failed',
            message: error.response?.data?.message || 'Failed to record payment',
            invoice_id: payment.invoice_id,
            client_name: payment.client_name,
          });
        }
      }

      setProcessingResults(results);
      setCurrentStep('results');

      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;

      if (successCount > 0) {
        success(
          `Successfully processed ${successCount} payments${failedCount > 0 ? `, ${failedCount} failed` : ''}`
        );
      }
      if (failedCount > 0 && successCount === 0) {
        showError(`Failed to process ${failedCount} payments`);
      }
    } catch (error) {
      showError('Error processing payments');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download template
  const downloadTemplate = () => {
    const template = [
      ['invoice_number', 'amount', 'payment_date', 'payment_method', 'reference', 'notes'],
      [
        'INV-20250201-001',
        '50000.00',
        '2025-01-26',
        'bank_transfer',
        'TRX-12345',
        'Payment received',
      ],
      ['INV-20250201-002', '25000.00', '2025-01-26', 'online', 'PAY-67890', 'Online payment'],
    ];

    const csvContent = template.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_payment_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Export results
  const exportResults = () => {
    if (processingResults.length === 0) return;

    const headers = ['Row', 'Invoice Number', 'Amount', 'Status', 'Message', 'Client Name'];
    const data = [
      headers,
      ...processingResults.map(result => [
        result.row.toString(),
        result.invoice_number,
        result.amount,
        result.status,
        result.message,
        result.client_name || '',
      ]),
    ];

    const csvContent = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_payment_results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Reset to start
  const resetUpload = () => {
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setValidatedPayments([]);
    setProcessingResults([]);
    setCurrentStep('upload');
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const getStatusIcon = (status: 'valid' | 'warning' | 'error' | 'success' | 'failed') => {
    switch (status) {
      case 'valid':
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
      case 'failed':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: 'valid' | 'warning' | 'error' | 'success' | 'failed') => {
    switch (status) {
      case 'valid':
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'error':
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bulk Payment Upload</h1>
            <p className="text-gray-600">Upload CSV file to record multiple payments at once</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
            <button
              onClick={() => navigate('/receivables/list')}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to Receivables
            </button>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          {[
            { key: 'upload', label: 'Upload File', icon: Upload },
            { key: 'mapping', label: 'Map Fields', icon: FileText },
            { key: 'validation', label: 'Validate Data', icon: AlertCircle },
            { key: 'processing', label: 'Process Payments', icon: RefreshCw },
            { key: 'results', label: 'View Results', icon: CheckCircle },
          ].map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.key;
            const isCompleted =
              ['upload', 'mapping', 'validation', 'processing', 'results'].indexOf(currentStep) >
              index;

            return (
              <div key={step.key} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    isActive
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : isCompleted
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 bg-white text-gray-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`ml-2 text-sm font-medium ${
                    isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
                {index < 4 && (
                  <div
                    className={`w-12 h-0.5 mx-4 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'upload' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Upload CSV File</h3>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-900">
                {file ? file.name : 'Choose a CSV file to upload'}
              </p>
              <p className="text-sm text-gray-500">
                File should contain invoice numbers, amounts, payment dates, and payment methods
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {file ? 'Choose Different File' : 'Choose File'}
            </button>
          </div>

          {file && csvData.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Loaded {csvData.length} payment records from {file.name}
                </p>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Eye className="h-4 w-4" />
                  {showPreview ? 'Hide' : 'Show'} Preview
                </button>
              </div>

              {showPreview && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Row
                          </th>
                          {headers.map((header, index) => (
                            <th
                              key={index}
                              className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {csvData.slice(0, 5).map((row, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-900">{index + 2}</td>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="px-4 py-2 text-sm text-gray-900">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvData.length > 5 && (
                    <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500">
                      ... and {csvData.length - 5} more rows
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setCurrentStep('mapping')}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Continue to Field Mapping
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentStep === 'mapping' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Map CSV Fields</h3>
          <p className="text-sm text-gray-600 mb-6">
            Map your CSV columns to the required payment fields
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { key: 'invoice_number', label: 'Invoice Number', required: true },
              { key: 'amount', label: 'Payment Amount', required: true },
              { key: 'payment_date', label: 'Payment Date (YYYY-MM-DD)', required: true },
              { key: 'payment_method', label: 'Payment Method', required: true },
              { key: 'reference', label: 'Reference Number', required: false },
              { key: 'notes', label: 'Notes', required: false },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={fieldMapping[field.key as keyof FieldMapping] ?? ''}
                  onChange={e =>
                    handleMappingChange(field.key as keyof FieldMapping, parseInt(e.target.value))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={field.required}
                >
                  <option value="">Select column...</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      Column {index + 1}: {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Payment Method Values</h4>
            <p className="text-sm text-blue-700">
              Valid payment methods: {paymentMethods.join(', ')}
            </p>
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setCurrentStep('upload')}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Back to Upload
            </button>
            <button
              onClick={validatePayments}
              disabled={
                fieldMapping.invoice_number === undefined ||
                fieldMapping.amount === undefined ||
                fieldMapping.payment_date === undefined ||
                fieldMapping.payment_method === undefined
              }
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Validate Payments
            </button>
          </div>
        </div>
      )}

      {currentStep === 'validation' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Validation Results</h3>
            {isValidating && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Validating payments...
              </div>
            )}
          </div>

          {validatedPayments.length > 0 && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium text-green-700">Valid</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">
                    {validatedPayments.filter(p => p.status === 'valid').length}
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-700">Warnings</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-900">
                    {validatedPayments.filter(p => p.status === 'warning').length}
                  </p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <X className="h-5 w-5 text-red-500" />
                    <span className="text-sm font-medium text-red-700">Errors</span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">
                    {validatedPayments.filter(p => p.status === 'error').length}
                  </p>
                </div>
              </div>

              {/* Validation Details */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Row
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Invoice
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Client
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Method
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Message
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {validatedPayments.map((payment, index) => (
                        <tr key={index} className={getStatusColor(payment.status)}>
                          <td className="px-4 py-3 text-sm font-medium">{payment.row}</td>
                          <td className="px-4 py-3 text-sm">{payment.invoice_number}</td>
                          <td className="px-4 py-3 text-sm">{payment.client_name || '-'}</td>
                          <td className="px-4 py-3 text-sm">{formatCurrency(payment.amount)}</td>
                          <td className="px-4 py-3 text-sm">{payment.payment_date}</td>
                          <td className="px-4 py-3 text-sm">{payment.payment_method}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(payment.status)}
                              <span className="capitalize">{payment.status}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{payment.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep('mapping')}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Back to Mapping
                </button>
                <button
                  onClick={processPayments}
                  disabled={
                    validatedPayments.filter(p => p.status === 'valid' || p.status === 'warning')
                      .length === 0
                  }
                  className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Process{' '}
                  {
                    validatedPayments.filter(p => p.status === 'valid' || p.status === 'warning')
                      .length
                  }{' '}
                  Payments
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {currentStep === 'processing' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Processing Payments</h3>
            <p className="text-sm text-gray-600">Please wait while we record the payments...</p>
          </div>
        </div>
      )}

      {currentStep === 'results' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Processing Results</h3>
            <button
              onClick={exportResults}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
            >
              <Download className="h-4 w-4" />
              Export Results
            </button>
          </div>

          {processingResults.length > 0 && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium text-green-700">Successful</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">
                    {processingResults.filter(r => r.status === 'success').length}
                  </p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <X className="h-5 w-5 text-red-500" />
                    <span className="text-sm font-medium text-red-700">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">
                    {processingResults.filter(r => r.status === 'failed').length}
                  </p>
                </div>
              </div>

              {/* Results Details */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Row
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Invoice
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Client
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Message
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {processingResults.map((result, index) => (
                        <tr key={index} className={getStatusColor(result.status)}>
                          <td className="px-4 py-3 text-sm font-medium">{result.row}</td>
                          <td className="px-4 py-3 text-sm">{result.invoice_number}</td>
                          <td className="px-4 py-3 text-sm">{result.client_name || '-'}</td>
                          <td className="px-4 py-3 text-sm">{formatCurrency(result.amount)}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(result.status)}
                              <span className="capitalize">{result.status}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{result.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={resetUpload}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Upload Another File
                </button>
                <button
                  onClick={() => navigate('/receivables/list')}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Back to Receivables
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkPaymentUpload;
