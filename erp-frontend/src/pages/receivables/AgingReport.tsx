// src/pages/receivables/AgingReport.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receivablesService, CustomerReceivable } from '../../services/receivablesService';
import { branchService, BranchOption } from '../../services/branchService';
import { useToast } from '../../hooks/useToast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Download, Calendar, Filter, Eye, FileText, Printer, X } from 'lucide-react';

interface AgingData {
  client_id: number;
  client_name: string;
  current: number;
  '1-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
  total: number;
}

interface AgingReportResponse {
  as_of_date: string;
  total_clients: number;
  totals: {
    current: string;
    '1-30': string;
    '31-60': string;
    '61-90': string;
    '90+': string;
    total: string;
  };
  clients: AgingData[];
}

interface CustomerDrillDownData {
  client_id: number;
  client_name: string;
  receivables: CustomerReceivable[];
  summary: AgingData;
}

const AgingReport: React.FC = () => {
  const navigate = useNavigate();
  const [agingData, setAgingData] = useState<AgingData[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [summary, setSummary] = useState({
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [filters, setFilters] = useState({
    branch: '',
    search: '',
    as_of_date: new Date().toISOString().split('T')[0],
  });
  const { success, error: showError } = useToast();

  // Chart colors for aging buckets
  const AGING_COLORS = {
    current: '#10B981',
    '1-30': '#F59E0B',
    '31-60': '#F97316',
    '61-90': '#EF4444',
    '90+': '#B91C1C',
  };

  useEffect(() => {
    loadBranches();
    loadAgingReport();
  }, [filters]);

  const loadBranches = async () => {
    try {
      const branchOptions = await branchService.getBranchOptions({ is_active: true });
      setBranches(branchOptions);
    } catch (error) {
      console.error('Error loading branches:', error);
      showError('Failed to load branches');
    }
  };

  const loadAgingReport = async () => {
    try {
      setLoading(true);

      const response: AgingReportResponse = await receivablesService.getAgingReport({
        as_of_date: filters.as_of_date,
        branch: filters.branch ? parseInt(filters.branch) : undefined,
        format: 'json',
      });

      if (response.clients && response.totals) {
        // Convert string values to numbers for client data
        const processedClients = response.clients.map(client => ({
          client_id: client.client_id,
          client_name: client.client_name,
          current: parseFloat(client.current.toString()),
          '1-30': parseFloat(client['1-30'].toString()),
          '31-60': parseFloat(client['31-60'].toString()),
          '61-90': parseFloat(client['61-90'].toString()),
          '90+': parseFloat(client['90+'].toString()),
          total: parseFloat(client.total.toString()),
        }));

        let filteredCustomers = processedClients;
        if (filters.search) {
          filteredCustomers = processedClients.filter(customer =>
            customer.client_name.toLowerCase().includes(filters.search.toLowerCase())
          );
        }

        setAgingData(filteredCustomers);

        const summaryTotals = {
          current: parseFloat(response.totals.current),
          '1-30': parseFloat(response.totals['1-30']),
          '31-60': parseFloat(response.totals['31-60']),
          '61-90': parseFloat(response.totals['61-90']),
          '90+': parseFloat(response.totals['90+']),
          total: parseFloat(response.totals.total),
        };

        setSummary(summaryTotals);
      }
    } catch (error) {
      console.error('Error loading aging report:', error);
      showError('Failed to load aging report');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getPercentage = (amount: number, total: number) => {
    return total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
  };

  const handleCustomerDrillDown = async (client: AgingData) => {
    try {
      setLoading(true);

      const receivablesResponse = await receivablesService.getReceivables({
        client: client.client_id,
        status: 'pending,partial,overdue',
      });

      const customerData: CustomerDrillDownData = {
        client_id: client.client_id,
        client_name: client.client_name,
        receivables: receivablesResponse.results || [],
        summary: client,
      };

      setSelectedCustomer(customerData);
      setShowDrillDown(true);
    } catch (error) {
      console.error('Error loading customer details:', error);
      showError('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      setExporting(true);

      const headers = [
        'Client Name',
        'Current',
        '1-30 Days',
        '31-60 Days',
        '61-90 Days',
        '90+ Days',
        'Total',
      ];
      const csvContent = [
        `"Aging Report as of ${String(filters.as_of_date)}"`,
        '',
        headers.join(','),
        ...agingData.map(row =>
          [
            `"${row.client_name}"`,
            row.current,
            row['1-30'],
            row['31-60'],
            row['61-90'],
            row['90+'],
            row.total,
          ].join(',')
        ),
        '',
        [
          'TOTALS',
          summary.current,
          summary['1-30'],
          summary['31-60'],
          summary['61-90'],
          summary['90+'],
          summary.total,
        ].join(','),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aging-report-${filters.as_of_date}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      showError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Aging Report - ${String(filters.as_of_date)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background-color: #f5f5f5; }
            .client-name { text-align: left; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Aging Report</h1>
            <p>As of ${String(filters.as_of_date)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th class="client-name">Client Name</th>
                <th>Current</th>
                <th>1-30 Days</th>
                <th>31-60 Days</th>
                <th>61-90 Days</th>
                <th>90+ Days</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${agingData
                .map(
                  client => `
                <tr>
                  <td class="client-name">${client.client_name}</td>
                  <td>${client.current > 0 ? formatCurrency(client.current) : '-'}</td>
                  <td>${client['1-30'] > 0 ? formatCurrency(client['1-30']) : '-'}</td>
                  <td>${client['31-60'] > 0 ? formatCurrency(client['31-60']) : '-'}</td>
                  <td>${client['61-90'] > 0 ? formatCurrency(client['61-90']) : '-'}</td>
                  <td>${client['90+'] > 0 ? formatCurrency(client['90+']) : '-'}</td>
                  <td>${formatCurrency(client.total)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const chartData = [
    { name: 'Current', value: summary.current, color: AGING_COLORS.current },
    { name: '1-30 Days', value: summary['1-30'], color: AGING_COLORS['1-30'] },
    { name: '31-60 Days', value: summary['31-60'], color: AGING_COLORS['31-60'] },
    { name: '61-90 Days', value: summary['61-90'], color: AGING_COLORS['61-90'] },
    { name: '90+ Days', value: summary['90+'], color: AGING_COLORS['90+'] },
  ].filter(item => item.value > 0);

  const barChartData = chartData.map(item => ({
    name: item.name,
    amount: item.value,
    percentage: parseFloat(getPercentage(item.value, summary.total)),
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Aging Report</h1>
            <p className="text-gray-600">
              Accounts receivable aging analysis as of {filters.as_of_date}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={exportToCSV}
              disabled={exporting}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              Export PDF
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Filters with Date Range */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-500">Filter Options</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              As of Date
            </label>
            <input
              type="date"
              value={filters.as_of_date}
              onChange={e => handleFilterChange('as_of_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Client</label>
            <input
              type="text"
              placeholder="Search by client name..."
              value={filters.search}
              onChange={e => handleFilterChange('search', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
            <select
              value={filters.branch}
              onChange={e => handleFilterChange('branch', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Branches</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id.toString()}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() =>
                setFilters({
                  branch: '',
                  search: '',
                  as_of_date: new Date().toISOString().split('T')[0],
                })
              }
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Current</h3>
          <p className="text-xl font-bold text-green-600">{formatCurrency(summary.current)}</p>
          <p className="text-xs text-gray-500">{getPercentage(summary.current, summary.total)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">1-30 Days</h3>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(summary['1-30'])}</p>
          <p className="text-xs text-gray-500">{getPercentage(summary['1-30'], summary.total)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">31-60 Days</h3>
          <p className="text-xl font-bold text-orange-600">{formatCurrency(summary['31-60'])}</p>
          <p className="text-xs text-gray-500">{getPercentage(summary['31-60'], summary.total)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">61-90 Days</h3>
          <p className="text-xl font-bold text-red-600">{formatCurrency(summary['61-90'])}</p>
          <p className="text-xs text-gray-500">{getPercentage(summary['61-90'], summary.total)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">90+ Days</h3>
          <p className="text-xl font-bold text-red-700">{formatCurrency(summary['90+'])}</p>
          <p className="text-xs text-gray-500">{getPercentage(summary['90+'], summary.total)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total</h3>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total)}</p>
          <p className="text-xs text-gray-500">100%</p>
        </div>
      </div>

      {/* Interactive Aging Charts */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Aging Distribution</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setChartType('bar')}
              className={`px-3 py-1 text-sm rounded ${
                chartType === 'bar'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setChartType('pie')}
              className={`px-3 py-1 text-sm rounded ${
                chartType === 'pie'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Pie Chart
            </button>
          </div>
        </div>

        {summary.total > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} />
                  <Bar dataKey="amount">
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartData[index]?.color || '#6B7280'} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} />
                  <Legend />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">??</div>
              <p>No data to display</p>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Report */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Detailed Aging Report ({agingData.length} clients)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client Name
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      1-30 Days
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      31-60 Days
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      61-90 Days
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      90+ Days
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {agingData.map(client => (
                    <tr key={client.client_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {client.client_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {client.current > 0 ? formatCurrency(client.current) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-yellow-600">
                        {client['1-30'] > 0 ? formatCurrency(client['1-30']) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-orange-600">
                        {client['31-60'] > 0 ? formatCurrency(client['31-60']) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600">
                        {client['61-90'] > 0 ? formatCurrency(client['61-90']) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-700 font-medium">
                        {client['90+'] > 0 ? formatCurrency(client['90+']) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                        {formatCurrency(client.total)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleCustomerDrillDown(client)}
                            className="flex items-center text-blue-600 hover:text-blue-900"
                            title="View detailed receivables"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Drill Down
                          </button>
                          <button
                            onClick={() => navigate(`/receivables/list?client=${client.client_id}`)}
                            className="text-green-600 hover:text-green-900"
                          >
                            View All
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      TOTALS
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                      {formatCurrency(summary.current)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-yellow-600">
                      {formatCurrency(summary['1-30'])}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-orange-600">
                      {formatCurrency(summary['31-60'])}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">
                      {formatCurrency(summary['61-90'])}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-700">
                      {formatCurrency(summary['90+'])}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                      {formatCurrency(summary.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {agingData.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-4xl mb-4">??</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No aging data found</h3>
                  <p className="text-gray-600">
                    No outstanding receivables to display in the aging report.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Customer Drill-Down Modal */}
      {showDrillDown && selectedCustomer && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Customer Drill-Down: {selectedCustomer.client_name}
                </h3>
                <p className="text-sm text-gray-600">Detailed receivables breakdown</p>
              </div>
              <button
                onClick={() => setShowDrillDown(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Customer Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
              <div className="bg-green-50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-green-700 mb-1">Current</h4>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(selectedCustomer.summary.current)}
                </p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-yellow-700 mb-1">1-30 Days</h4>
                <p className="text-lg font-bold text-yellow-600">
                  {formatCurrency(selectedCustomer.summary['1-30'])}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-orange-700 mb-1">31-60 Days</h4>
                <p className="text-lg font-bold text-orange-600">
                  {formatCurrency(selectedCustomer.summary['31-60'])}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-red-700 mb-1">61-90 Days</h4>
                <p className="text-lg font-bold text-red-600">
                  {formatCurrency(selectedCustomer.summary['61-90'])}
                </p>
              </div>
              <div className="bg-red-100 rounded-lg p-3">
                <h4 className="text-xs font-medium text-red-800 mb-1">90+ Days</h4>
                <p className="text-lg font-bold text-red-700">
                  {formatCurrency(selectedCustomer.summary['90+'])}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-gray-700 mb-1">Total</h4>
                <p className="text-lg font-bold text-gray-900">
                  {formatCurrency(selectedCustomer.summary.total)}
                </p>
              </div>
            </div>

            {/* Detailed Receivables Table */}
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Original Amount
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aging
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedCustomer.receivables.map(receivable => (
                    <tr key={receivable.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {receivable.reference_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <span className="capitalize">{receivable.receivable_type}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(parseFloat(receivable.original_amount))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {formatCurrency(parseFloat(receivable.balance))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(receivable.due_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            receivable.aging_bucket === 'current'
                              ? 'bg-green-100 text-green-800'
                              : receivable.aging_bucket === '1-30'
                                ? 'bg-yellow-100 text-yellow-800'
                                : receivable.aging_bucket === '31-60'
                                  ? 'bg-orange-100 text-orange-800'
                                  : receivable.aging_bucket === '61-90'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-red-200 text-red-900'
                          }`}
                        >
                          {receivable.aging_bucket}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            receivable.status === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : receivable.status === 'partial'
                                ? 'bg-yellow-100 text-yellow-800'
                                : receivable.status === 'overdue'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {receivable.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedCustomer.receivables.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No outstanding receivables found for this customer.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
              <button
                onClick={() => navigate(`/receivables/list?client=${selectedCustomer.client_id}`)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
              >
                View All Receivables
              </button>
              <button
                onClick={() => setShowDrillDown(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgingReport;
