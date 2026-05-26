/**
 * Fuel Consumption Report Page
 *
 * Comprehensive fuel/resource consumption report showing:
 *  - Period summary: total litres, cost, km driven, avg efficiency
 *  - Per-beneficiary breakdown (vehicles & employees) with efficiency & flag status
 *  - By-resource breakdown (premium vs diesel, etc.)
 *  - Recent irregularity / discrepancy alerts
 *
 * Calls: GET /api/expenses/reports/fuel-consumption/
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Fuel,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  Gauge,
  DollarSign,
  MapPin,
  Filter,
  RefreshCw,
  Car,
  Users,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ReportPeriod {
  date_from: string;
  date_to: string;
}

interface ReportSummary {
  total_quantity: number;
  total_cost: number;
  total_km: number;
  avg_efficiency: number | null;
  total_records: number;
  irregular_count: number;
  beneficiary_count: number;
}

interface BeneficiaryRow {
  beneficiary_type: string;
  display_name: string;
  vehicle: {
    id: number;
    asset_number: string;
    registration_number: string;
    make: string;
    model: string;
  } | null;
  employee_info: {
    id: number;
    staff_id: string;
    department: string;
  } | null;
  resource: { id: number; code: string; name: string; unit: string };
  total_quantity: number;
  total_cost: number;
  total_km: number;
  efficiency: number | null;
  efficiency_status: 'ok' | 'low' | 'high' | 'no_km';
  efficiency_note: string | null;
  fill_count: number;
  irregular_count: number;
  has_irregularities: boolean;
  last_consumption_date: string | null;
  last_odometer_reading: number | null;
}

interface ResourceSummaryRow {
  resource_code: string;
  resource_name: string;
  unit: string;
  total_quantity: number;
  total_cost: number;
  total_km: number;
  avg_efficiency: number | null;
  records: number;
}

interface IrregularityItem {
  id: number;
  consumption_number: string;
  consumption_date: string;
  beneficiary: string;
  resource_name: string;
  quantity_consumed: number;
  total_cost: number;
  irregularity_type: string;
  variance_percentage: number;
  irregularity_notes: string | null;
  status: string;
}

interface FuelReportData {
  period: ReportPeriod;
  resource_type: string;
  summary: ReportSummary;
  by_beneficiary: BeneficiaryRow[];
  by_resource: ResourceSummaryRow[];
  irregularities: IrregularityItem[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const toISODate = (d: Date): string => d.toISOString().split('T')[0];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(v);

const fmtNum = (v: number | null, dp = 1): string => (v == null ? '—' : v.toFixed(dp));

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const irregularityLabel: Record<string, string> = {
  excessive_consumption: 'Excessive',
  low_usage: 'Low Usage',
  high_usage: 'High Usage',
  duplicate_reading: 'Duplicate Reading',
  reading_rollback: 'Rollback',
  impossible_rate: 'Impossible Rate',
  no_usage: 'No Usage',
  frequency_anomaly: 'Frequency Anomaly',
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const EfficiencyBadge: React.FC<{
  status: BeneficiaryRow['efficiency_status'];
  efficiency: number | null;
  unit: string;
}> = ({ status, efficiency, unit }) => {
  if (status === 'no_km' || efficiency == null) {
    return <Badge className="bg-gray-100 text-gray-600">No odometer</Badge>;
  }
  const config = {
    ok: { cls: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
    low: { cls: 'bg-red-100 text-red-800', icon: <TrendingDown className="h-3 w-3 mr-1" /> },
    high: { cls: 'bg-blue-100 text-blue-800', icon: <TrendingUp className="h-3 w-3 mr-1" /> },
  }[status] ?? { cls: 'bg-gray-100 text-gray-600', icon: null };

  return (
    <Badge className={config.cls}>
      {config.icon}
      {fmtNum(efficiency)} km/{unit}
    </Badge>
  );
};

const IrregularityBadge: React.FC<{ type: string }> = ({ type }) => (
  <Badge className="bg-amber-100 text-amber-800">
    <AlertTriangle className="h-3 w-3 mr-1 inline" />
    {irregularityLabel[type] ?? type}
  </Badge>
);

const KPICard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}> = ({ icon, label, value, sub, highlight }) => (
  <Card className={highlight ? 'border-amber-400' : ''}>
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">{icon}</div>
        {highlight && (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

const FuelConsumptionReportPage: React.FC = () => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [dateFrom, setDateFrom] = useState(toISODate(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(toISODate(today));
  const [resourceType, setResourceType] = useState('fuel');
  const [beneficiaryType, setBeneficiaryType] = useState('all');
  const [includeDraft, setIncludeDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'staff' | 'irregularities' | 'by-resource'>('vehicles');

  // Applied params (only update on "Apply" click for efficiency)
  const [appliedParams, setAppliedParams] = useState({
    dateFrom: toISODate(thirtyDaysAgo),
    dateTo: toISODate(today),
    resourceType: 'fuel',
    beneficiaryType: 'all',
    includeDraft: false,
  });

  const { data, isLoading, error, refetch } = useQuery<FuelReportData>({
    queryKey: ['fuel-consumption-report', appliedParams],
    queryFn: async () => {
      const params: Record<string, string> = {
        date_from: appliedParams.dateFrom,
        date_to: appliedParams.dateTo,
        resource_type: appliedParams.resourceType,
      };
      if (appliedParams.beneficiaryType !== 'all') {
        params.beneficiary_type = appliedParams.beneficiaryType;
      }
      if (appliedParams.includeDraft) {
        params.include_draft = 'true';
      }
      const res = await api.get('/expenses/reports/fuel-consumption/', { params });
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const handleApply = () => {
    setAppliedParams({ dateFrom, dateTo, resourceType, beneficiaryType, includeDraft });
  };

  const vehicleRows = data?.by_beneficiary.filter((r) => r.beneficiary_type === 'asset') ?? [];
  const staffRows = data?.by_beneficiary.filter((r) => r.beneficiary_type === 'employee') ?? [];
  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/expenses/resource-consumption"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Consumptions
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Fuel className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fuel Consumption Report</h1>
              <p className="text-sm text-gray-500">
                Fuel usage, efficiency metrics, and discrepancy analysis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link to="/expenses/resource-consumption/irregularities">
              <Button variant="outline" size="sm">
                <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-500" />
                Irregularities
              </Button>
            </Link>
            <Link to="/expenses/resource-consumption/create">
              <Button size="sm">
                <Fuel className="h-4 w-4 mr-1.5" />
                Record Fuel
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date From</label>
              <input
                type="date"
                title="Date From"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date To</label>
              <input
                type="date"
                title="Date To"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Resource Type</label>
              <select
                title="Resource Type"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fuel">Fuel</option>
                <option value="electricity">Electricity</option>
                <option value="water">Water</option>
                <option value="gas">Gas</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Beneficiary</label>
              <select
                title="Beneficiary Type"
                value={beneficiaryType}
                onChange={(e) => setBeneficiaryType(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="asset">Vehicles</option>
                <option value="employee">Employees</option>
                <option value="department">Departments</option>
                <option value="location">Locations</option>
              </select>
            </div>
            <div className="flex items-center gap-2 self-end pb-1">
              <input
                id="include-draft"
                type="checkbox"
                checked={includeDraft}
                onChange={(e) => setIncludeDraft(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="include-draft" className="text-sm text-gray-600">
                Include draft
              </label>
            </div>
            <Button onClick={handleApply} className="self-end">
              <Filter className="h-4 w-4 mr-1.5" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>Failed to load report. Please try again.</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {!isLoading && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            icon={<Fuel className="h-5 w-5" />}
            label="Total Quantity"
            value={`${fmtNum(summary.total_quantity, 0)} L`}
            sub={`${summary.total_records} fill-up records`}
          />
          <KPICard
            icon={<DollarSign className="h-5 w-5" />}
            label="Total Cost"
            value={fmtCurrency(summary.total_cost)}
            sub={`${summary.beneficiary_count} beneficiaries`}
          />
          <KPICard
            icon={<MapPin className="h-5 w-5" />}
            label="Total Distance"
            value={summary.total_km > 0 ? `${fmtNum(summary.total_km, 0)} km` : '—'}
            sub={
              summary.avg_efficiency != null
                ? `Avg ${fmtNum(summary.avg_efficiency)} km/L`
                : 'Odometer data incomplete'
            }
          />
          <KPICard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Flagged Items"
            value={`${summary.irregular_count}`}
            sub="Discrepancies detected"
            highlight={summary.irregular_count > 0}
          />
        </div>
      )}

      {/* By-resource summary chips */}
      {!isLoading && (data?.by_resource ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {data!.by_resource.map((r) => (
            <span
              key={r.resource_code}
              className="inline-flex items-center gap-1.5 bg-white border rounded-full px-3 py-1 text-sm shadow-sm"
            >
              <Fuel className="h-3.5 w-3.5 text-blue-500" />
              <strong>{r.resource_name}</strong>
              <span className="text-gray-500">
                {fmtNum(r.total_quantity, 0)} {r.unit} · {fmtCurrency(r.total_cost)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { key: 'vehicles', label: 'Vehicles', icon: <Car className="h-4 w-4" />, count: vehicleRows.length },
            { key: 'staff', label: 'Employees', icon: <Users className="h-4 w-4" />, count: staffRows.length },
            {
              key: 'irregularities',
              label: 'Discrepancies',
              icon: <AlertTriangle className="h-4 w-4" />,
              count: data?.irregularities.length ?? 0,
              alert: (data?.irregularities.length ?? 0) > 0,
            },
            {
              key: 'by-resource',
              label: 'By Resource',
              icon: <Gauge className="h-4 w-4" />,
              count: data?.by_resource.length ?? 0,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                    tab.alert
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Vehicles */}
      {activeTab === 'vehicles' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" /> Vehicle Fuel Breakdown
            </CardTitle>
            <CardDescription>
              Fuel consumption per vehicle — efficiency (km/L), cost, and discrepancy status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vehicleRows.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Car className="h-10 w-10 mx-auto mb-2 opacity-40" />
                No vehicle fuel data for this period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Vehicle</th>
                      <th className="px-4 py-3 text-right">Litres</th>
                      <th className="px-4 py-3 text-right">KM Driven</th>
                      <th className="px-4 py-3 text-center">Efficiency</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center">Fill-ups</th>
                      <th className="px-4 py-3 text-center">Flags</th>
                      <th className="px-4 py-3 text-right">Last Fill</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vehicleRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`hover:bg-gray-50 ${row.has_irregularities ? 'bg-amber-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{row.display_name}</div>
                          {row.vehicle && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {[row.vehicle.registration_number, row.vehicle.make, row.vehicle.model]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          <div className="text-xs text-blue-500 mt-0.5">{row.resource.name}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {fmtNum(row.total_quantity, 1)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {row.total_km > 0 ? fmtNum(row.total_km, 0) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <EfficiencyBadge
                            status={row.efficiency_status}
                            efficiency={row.efficiency}
                            unit={row.resource.unit}
                          />
                          {row.efficiency_note && (
                            <div className="text-xs text-gray-400 mt-0.5 max-w-[150px] mx-auto">
                              {row.efficiency_note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {fmtCurrency(row.total_cost)}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{row.fill_count}</td>
                        <td className="px-4 py-3 text-center">
                          {row.has_irregularities ? (
                            <Badge className="bg-amber-100 text-amber-800">
                              <AlertTriangle className="h-3 w-3 mr-1 inline" />
                              {row.irregular_count}
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1 inline" />
                              OK
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {fmtDate(row.last_consumption_date)}
                          {row.last_odometer_reading != null && (
                            <div>{fmtNum(row.last_odometer_reading, 0)} km</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Employees */}
      {activeTab === 'staff' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Employee Fuel Allocations
            </CardTitle>
            <CardDescription>Fuel issued directly to employees</CardDescription>
          </CardHeader>
          <CardContent>
            {staffRows.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                No employee fuel data for this period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Employee</th>
                      <th className="px-4 py-3 text-right">Litres</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center">Fill-ups</th>
                      <th className="px-4 py-3 text-center">Flags</th>
                      <th className="px-4 py-3 text-right">Last Fill</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {staffRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`hover:bg-gray-50 ${row.has_irregularities ? 'bg-amber-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{row.display_name}</div>
                          {row.employee_info && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {[row.employee_info.staff_id, row.employee_info.department]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          <div className="text-xs text-blue-500 mt-0.5">{row.resource.name}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmtNum(row.total_quantity, 1)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtCurrency(row.total_cost)}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{row.fill_count}</td>
                        <td className="px-4 py-3 text-center">
                          {row.has_irregularities ? (
                            <Badge className="bg-amber-100 text-amber-800">
                              <AlertTriangle className="h-3 w-3 mr-1 inline" />
                              {row.irregular_count}
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1 inline" />
                              OK
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {fmtDate(row.last_consumption_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Discrepancies */}
      {activeTab === 'irregularities' && (
        <div className="space-y-4">
          {(data?.irregularities.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
                <p className="text-gray-500 text-lg font-medium">No discrepancies found</p>
                <p className="text-gray-400 text-sm mt-1">
                  All consumption records are within expected parameters for this period.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>{data!.irregularities.length} discrepancy records</strong> detected.
                  Review each item below and approve or raise a deduction where necessary.
                </AlertDescription>
              </Alert>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 text-left">Record</th>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Beneficiary</th>
                          <th className="px-4 py-3 text-center">Irregularity</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Cost</th>
                          <th className="px-4 py-3 text-right">Variance %</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data!.irregularities.map((item) => (
                          <tr key={item.id} className="hover:bg-amber-50 bg-amber-50/30">
                            <td className="px-4 py-3">
                              <Link
                                to={`/expenses/resource-consumption/${item.id}`}
                                className="font-mono text-blue-600 hover:underline text-xs"
                              >
                                {item.consumption_number}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {fmtDate(item.consumption_date)}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {item.beneficiary}
                              <div className="text-xs text-gray-400">{item.resource_name}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <IrregularityBadge type={item.irregularity_type} />
                              {item.irregularity_notes && (
                                <div className="text-xs text-gray-400 mt-1 max-w-[180px] mx-auto line-clamp-2">
                                  {item.irregularity_notes}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {fmtNum(item.quantity_consumed, 1)} L
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {fmtCurrency(item.total_cost)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {item.variance_percentage ? (
                                <span
                                  className={
                                    Math.abs(item.variance_percentage) > 30
                                      ? 'text-red-600 font-bold'
                                      : 'text-amber-600'
                                  }
                                >
                                  {item.variance_percentage > 0 ? '+' : ''}
                                  {fmtNum(item.variance_percentage, 1)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge
                                className={
                                  item.status === 'approved'
                                    ? 'bg-green-100 text-green-700'
                                    : item.status === 'flagged'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-600'
                                }
                              >
                                {item.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Link
                                to={`/expenses/resource-consumption/${item.id}`}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Tab: By Resource */}
      {activeTab === 'by-resource' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" /> Breakdown by Resource
            </CardTitle>
            <CardDescription>Totals grouped by individual resource (e.g. premium petrol vs diesel)</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.by_resource ?? []).length === 0 ? (
              <div className="py-12 text-center text-gray-400">No resource data</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Resource</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">KM Driven</th>
                      <th className="px-4 py-3 text-center">Avg Efficiency</th>
                      <th className="px-4 py-3 text-right">Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data!.by_resource.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{r.resource_name}</div>
                          <div className="text-xs text-gray-400">{r.resource_code}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmtNum(r.total_quantity, 1)} {r.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmtCurrency(r.total_cost)}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {r.total_km > 0 ? `${fmtNum(r.total_km, 0)} km` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.avg_efficiency != null ? (
                            <Badge className="bg-blue-100 text-blue-800">
                              {fmtNum(r.avg_efficiency)} km/{r.unit}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.records}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FuelConsumptionReportPage;
