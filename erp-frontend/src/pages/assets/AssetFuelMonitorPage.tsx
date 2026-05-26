/**
 * Fleet Fuel Monitor Dashboard
 *
 * Central hub for monitoring:
 *  1. Vehicle fleet fuel efficiency (km/litre) with anomaly alerts
 *  2. Staff fuel allocations (fuel given directly to employees)
 *  3. Per-vehicle consumption history drill-down
 *
 * Accounting integration:
 *  - PREPAID fuel:  Dr Fuel Expense / Cr Prepaid Fuel Asset  (amortisation on posting)
 *  - POSTPAID fuel: Dr Fuel Expense / Cr Accounts Payable   (accrual on posting)
 *  - Staff fuel:    Same flows, beneficiary_type = 'employee'
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useFleetSummary,
  useStaffFuelSummary,
  useAssetConsumptionHistory,
  useAssetCategories,
} from '../../hooks/useAssets';
import type { VehicleFleetItem } from '../../types/assets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Truck,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Droplets,
  MapPin,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Eye,
  Plus,
  CheckCircle,
  XCircle,
  Gauge,
  Zap,
  Settings,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(v);

const fmtNum = (v: number, dp = 1) => v.toFixed(dp);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const AnomalyBadge: React.FC<{ status: string; hasAnomalies: boolean }> = ({
  status,
  hasAnomalies,
}) => {
  if (!hasAnomalies) return <Badge className="bg-green-100 text-green-800">Normal</Badge>;
  if (status === 'critical') return <Badge className="bg-red-100 text-red-800">⚠ Critical</Badge>;
  return <Badge className="bg-amber-100 text-amber-800">⚠ Alert</Badge>;
};

const EfficiencyIndicator: React.FC<{
  current: number | null;
  average: number | null;
  status: string;
}> = ({ current, average, status }) => {
  if (!current) return <span className="text-gray-400 text-sm">No data</span>;

  const diff = average ? current - average : 0;
  const pct = average && average > 0 ? (diff / average) * 100 : 0;

  const color =
    status === 'critical'
      ? 'text-red-600'
      : status === 'warning'
        ? 'text-amber-600'
        : 'text-green-600';

  return (
    <div className="flex items-center gap-1">
      <Gauge className={`h-3.5 w-3.5 ${color}`} />
      <span className={`font-semibold text-sm ${color}`}>{fmtNum(current)} km/L</span>
      {average && (
        <span className="text-xs text-gray-400">
          ({diff >= 0 ? '+' : ''}
          {fmtNum(pct, 0)}% vs avg {fmtNum(average)} km/L)
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Vehicle Detail Drill-Down panel
// ─────────────────────────────────────────────

const VehicleDetailPanel: React.FC<{
  vehicleId: number;
  vehicleName: string;
  onClose: () => void;
}> = ({ vehicleId, vehicleName, onClose }) => {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAssetConsumptionHistory(vehicleId, {
    days,
    resource_type: 'fuel',
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end pt-4 pr-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
        {/* Panel header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">{vehicleName}</h2>
            <p className="text-xs text-gray-500">Consumption history</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days.toString()} onValueChange={v => setDays(Number(v))}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 30, 60, 90, 180].map(d => (
                  <SelectItem key={d} value={d.toString()}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : data ? (
          <div className="p-5 space-y-4">
            {/* Efficiency summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Current', val: data.efficiency.current },
                { label: 'Average', val: data.efficiency.average },
                { label: 'Best', val: data.efficiency.best },
                { label: 'Worst', val: data.efficiency.worst },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-lg font-bold text-gray-800">
                    {val != null ? `${fmtNum(val)} km/L` : '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Period totals */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-xs text-blue-600">Total Fuel</div>
                <div className="font-bold text-blue-900">{fmtNum(data.totals.quantity)} L</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-xs text-green-600">Total Cost</div>
                <div className="font-bold text-green-900">{fmtCurrency(data.totals.cost)}</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="text-xs text-purple-600">Distance</div>
                <div className="font-bold text-purple-900">{fmtNum(data.totals.usage, 0)} km</div>
              </div>
            </div>

            {/* Current odometer */}
            {data.asset.current_reading != null && (
              <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-3 text-sm">
                <Gauge className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Current odometer:</span>
                <span className="font-bold">
                  {data.asset.current_reading.toLocaleString('en-NG')} km
                </span>
              </div>
            )}

            {/* History table */}
            <h3 className="font-medium text-gray-800 text-sm">Fill-up History</h3>
            {data.history.length === 0 ? (
              <p className="text-gray-400 text-sm">No consumption records in period.</p>
            ) : (
              <div className="space-y-2">
                {data.history.map(h => (
                  <div
                    key={h.id}
                    className={`border rounded-lg p-3 text-sm ${
                      h.is_irregular ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {h.is_irregular ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <span className="font-medium">{fmtDate(h.consumption_date)}</span>
                        <Badge
                          className={
                            h.payment_flow === 'prepaid'
                              ? 'bg-blue-100 text-blue-700 text-xs'
                              : 'bg-purple-100 text-purple-700 text-xs'
                          }
                        >
                          {h.payment_flow}
                        </Badge>
                      </div>
                      <span className="text-gray-500 text-xs">{h.consumption_number}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-400">Fuel: </span>
                        {fmtNum(h.quantity_consumed)} {h.resource_unit}
                      </div>
                      <div>
                        <span className="text-gray-400">Cost: </span>
                        {fmtCurrency(h.total_cost)}
                      </div>
                      <div>
                        <span className="text-gray-400">Efficiency: </span>
                        {h.consumption_rate != null ? `${fmtNum(h.consumption_rate)} km/L` : '—'}
                      </div>
                      {h.previous_reading != null && h.current_reading != null && (
                        <>
                          <div>
                            <span className="text-gray-400">Prev km: </span>
                            {h.previous_reading.toLocaleString('en-NG')}
                          </div>
                          <div>
                            <span className="text-gray-400">Curr km: </span>
                            {h.current_reading.toLocaleString('en-NG')}
                          </div>
                          <div>
                            <span className="text-gray-400">Travelled: </span>
                            {fmtNum(h.usage_since_last, 0)} km
                          </div>
                        </>
                      )}
                      {h.operator_name && (
                        <div className="col-span-2">
                          <span className="text-gray-400">Driver: </span>
                          {h.operator_name}
                        </div>
                      )}
                      {h.consumption_location && (
                        <div className="col-span-3">
                          <MapPin className="inline h-3 w-3 mr-0.5 text-gray-400" />
                          {h.consumption_location}
                        </div>
                      )}
                    </div>

                    {h.is_irregular && h.irregularity_notes && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        ⚠ {h.irregularity_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Link to={`/expenses/fuel-log/create?asset_id=${vehicleId}`}>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Record Fill-up
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">No data available.</div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

const AssetFuelMonitorPage: React.FC = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(30);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'generators' | 'electricity' | 'staff'>(
    'vehicles'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedVehicleName, setSelectedVehicleName] = useState<string>('');

  const { data: categories = [] } = useAssetCategories();

  // Derive resource_type from active tab
  const resourceType =
    activeTab === 'vehicles' || activeTab === 'generators'
      ? 'fuel'
      : activeTab === 'electricity'
        ? 'electricity'
        : undefined;

  const fleetParams = {
    days: period,
    category: categoryFilter !== 'all' ? parseInt(categoryFilter) : undefined,
    resource_type: resourceType,
  };

  const {
    data: fleetData,
    isLoading: loadingFleet,
    refetch: refetchFleet,
  } = useFleetSummary(fleetParams);
  const {
    data: staffData,
    isLoading: loadingStaff,
    refetch: refetchStaff,
  } = useStaffFuelSummary({
    days: period,
  });

  const handleVehicleClick = (vehicle: VehicleFleetItem) => {
    setSelectedVehicleId(vehicle.id);
    setSelectedVehicleName(vehicle.name);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/assets')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Truck className="h-6 w-6 text-orange-500" />
              Fleet Fuel Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Track vehicle fuel efficiency, odometer readings, and anomaly alerts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <Select value={period.toString()} onValueChange={v => setPeriod(Number(v))}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[7, 14, 30, 60, 90].map(d => (
                <SelectItem key={d} value={d.toString()}>
                  Last {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchFleet();
              refetchStaff();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Link to="/expenses/fuel-log/create">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Record Fill-up
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      {fleetData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Truck className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Active Vehicles</div>
                  <div className="text-xl font-bold text-gray-900">
                    {fleetData.summary.active_assets}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Fleet Fuel Cost ({period}d)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {fmtCurrency(fleetData.summary.total_fleet_cost)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Droplets className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Total Fuel ({period}d)</div>
                  <div className="text-xl font-bold text-gray-900">
                    {fmtNum(fleetData.summary.total_fleet_quantity, 0)} L
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-lg ${
                    fleetData.summary.anomaly_count > 0 ? 'bg-red-100' : 'bg-gray-100'
                  }`}
                >
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      fleetData.summary.anomaly_count > 0 ? 'text-red-600' : 'text-gray-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Anomalies</div>
                  <div
                    className={`text-xl font-bold ${
                      fleetData.summary.anomaly_count > 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {fleetData.summary.anomaly_count}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff summary card (if data available) */}
      {staffData && staffData.summary.total_staff_count > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-medium text-blue-900">Staff Fuel Allocations</div>
                  <div className="text-xs text-blue-700">
                    {staffData.summary.total_staff_count} staff received fuel in the last {period}{' '}
                    days — {fmtCurrency(staffData.summary.grand_total_cost)} total (
                    {fmtNum(staffData.summary.grand_total_quantity)} L)
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700"
                onClick={() => setActiveTab('staff')}
              >
                View Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ── */}
      <div className="border-b flex gap-0 overflow-x-auto">
        {(
          [
            { id: 'vehicles', label: 'Vehicle Fleet', icon: <Truck className="h-4 w-4" /> },
            { id: 'generators', label: 'Generators', icon: <Settings className="h-4 w-4" /> },
            { id: 'electricity', label: 'Electricity', icon: <Zap className="h-4 w-4" /> },
            { id: 'staff', label: 'Staff Allocations', icon: <Users className="h-4 w-4" /> },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedVehicleId(null);
            }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Fleet / Generator / Electricity Tab ── */}
      {(activeTab === 'vehicles' || activeTab === 'generators' || activeTab === 'electricity') && (
        <div className="space-y-3">
          {/* Tab context banner */}
          {activeTab === 'generators' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
              <Settings className="h-4 w-4 flex-shrink-0" />
              Showing fuel consumption for generator assets. Use the category filter above to narrow
              by generator type.
            </div>
          )}
          {activeTab === 'electricity' && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex items-center gap-2">
              <Zap className="h-4 w-4 flex-shrink-0" />
              Showing electricity consumption across all assets. Record electricity usage via
              Resource Consumption.
            </div>
          )}
          {loadingFleet ? (
            <div className="text-center p-12 text-gray-400">Loading data...</div>
          ) : !fleetData || fleetData.fleet.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                {activeTab === 'electricity' ? (
                  <Zap className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                ) : activeTab === 'generators' ? (
                  <Settings className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                ) : (
                  <Truck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                )}
                <h3 className="font-medium text-gray-700">
                  {activeTab === 'electricity'
                    ? 'No electricity records'
                    : activeTab === 'generators'
                      ? 'No generator records'
                      : 'No vehicles found'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {activeTab === 'electricity'
                    ? 'Record electricity consumption via Resource Consumption entries.'
                    : activeTab === 'generators'
                      ? 'Register generator assets and record fuel fill-ups to see data here.'
                      : 'Register a vehicle asset first, then record fuel consumptions.'}
                </p>
                <div className="flex justify-center gap-3 mt-4">
                  <Link to="/assets/register">
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Register Vehicle
                    </Button>
                  </Link>
                  <Link to="/expenses/fuel-log/create">
                    <Button variant="outline" size="sm">
                      Record Fill-up
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Anomaly banner */}
              {fleetData.summary.anomaly_count > 0 && (
                <Alert className="border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>{fleetData.summary.anomaly_count} vehicle(s)</strong> have flagged
                    irregular consumption. Review these immediately — they may indicate fuel theft,
                    odometer tampering, or mechanical issues.
                  </AlertDescription>
                </Alert>
              )}

              {/* Fleet table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {activeTab === 'electricity'
                      ? 'Electricity Consumers'
                      : activeTab === 'generators'
                        ? 'Generator Fleet'
                        : 'Vehicle Fleet'}{' '}
                    ({fleetData.count})
                  </CardTitle>
                  <CardDescription>
                    {activeTab === 'electricity'
                      ? 'Click any row to view full electricity consumption history'
                      : 'Click any row to view full consumption history and drill-down'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Vehicle</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">
                            Reg. No.
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            Odometer
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">
                            Efficiency
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            {activeTab === 'electricity' ? `kWh (${period}d)` : `Fuel (${period}d)`}
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            Cost ({period}d)
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">Fills</th>
                          <th className="text-center px-4 py-3 font-medium text-gray-600">
                            Status
                          </th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {fleetData.fleet.map(v => (
                          <tr
                            key={v.id}
                            className={`border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                              v.has_anomalies ? 'bg-amber-50/50' : ''
                            }`}
                            onClick={() => handleVehicleClick(v)}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{v.name}</div>
                              <div className="text-xs text-gray-400">
                                {v.make} {v.model} {v.year}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">
                              {v.registration_number || '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {v.current_reading != null
                                ? `${v.current_reading.toLocaleString('en-NG')} km`
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <EfficiencyIndicator
                                current={v.efficiency.current}
                                average={v.efficiency.average}
                                status={v.efficiency.status || 'ok'}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              {v.period_totals.quantity > 0
                                ? `${fmtNum(v.period_totals.quantity)} ${activeTab === 'electricity' ? 'kWh' : 'L'}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {v.period_totals.cost > 0 ? fmtCurrency(v.period_totals.cost) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {v.period_totals.fill_count}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <AnomalyBadge
                                status={v.anomaly_status}
                                hasAnomalies={v.has_anomalies}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <p className="text-xs text-gray-400 text-center">
                {activeTab === 'electricity'
                  ? 'Consumption outside \u00b125% of the historical average triggers an anomaly alert.'
                  : "Efficiency outside \u00b125% of the asset's historical average triggers an anomaly alert. Configure thresholds per resource in Resource Management."}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Staff Fuel Tab ── */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {loadingStaff ? (
            <div className="text-center p-12 text-gray-400">Loading staff fuel data...</div>
          ) : !staffData || staffData.staff_summary.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="font-medium text-gray-700">No staff fuel records</h3>
                <p className="text-sm text-gray-500 mt-1">
                  To record fuel given to a staff member, create a Resource Consumption with{' '}
                  <strong>Beneficiary Type = Employee</strong>.
                </p>
                <div className="flex justify-center mt-4">
                  <Link to="/expenses/fuel-log/create">
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Record Staff Fuel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Staff summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-gray-500">Total Staff Recipients</div>
                    <div className="text-2xl font-bold">{staffData.summary.total_staff_count}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-gray-500">Total Quantity</div>
                    <div className="text-2xl font-bold">
                      {fmtNum(staffData.summary.grand_total_quantity)} L
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-gray-500">Total Cost</div>
                    <div className="text-2xl font-bold">
                      {fmtCurrency(staffData.summary.grand_total_cost)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Accounting note */}
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-blue-800 text-xs">
                  <strong>Accounting:</strong> Staff fuel recorded as <em>Prepaid</em> will debit
                  the Fuel Expense account and credit the Prepaid Fuel asset when posted.{' '}
                  <em>Postpaid</em> records debit the expense and credit Accounts Payable, settled
                  when the supplier invoice is paid.
                </AlertDescription>
              </Alert>

              {/* Per-staff table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Per-Staff Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Dept.</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            Quantity
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">
                            Records
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-gray-600">
                            Last Date
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-gray-600">
                            Alerts
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffData.staff_summary.map(s => (
                          <tr
                            key={s.employee_id}
                            className={`border-b hover:bg-gray-50 ${
                              s.has_irregularities ? 'bg-amber-50/50' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{s.employee_name}</div>
                              <div className="text-xs text-gray-400">
                                {s.staff_id || s.job_title}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{s.department}</td>
                            <td className="px-4 py-3 text-right">{fmtNum(s.total_quantity)} L</td>
                            <td className="px-4 py-3 text-right font-medium">
                              {fmtCurrency(s.total_cost)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {s.consumption_count}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-500">
                              {s.last_consumption_date ? fmtDate(s.last_consumption_date) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.has_irregularities ? (
                                <Badge className="bg-amber-100 text-amber-800 text-xs">
                                  {s.irregular_count} flag(s)
                                </Badge>
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Recent consumption log */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent Transactions</CardTitle>
                  <CardDescription>Latest 50 staff fuel records</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Dept.</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
                          <th className="text-center px-4 py-3 font-medium text-gray-600">Flow</th>
                          <th className="text-center px-4 py-3 font-medium text-gray-600">
                            Status
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Ref.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffData.recent_consumptions.map(c => (
                          <tr key={c.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-xs text-gray-600">
                              {fmtDate(c.consumption_date)}
                            </td>
                            <td className="px-4 py-2 font-medium">{c.employee_name}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{c.department}</td>
                            <td className="px-4 py-2 text-right">
                              {fmtNum(c.quantity_consumed)} {c.resource_unit}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">
                              {fmtCurrency(c.total_cost)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <Badge
                                className={
                                  c.payment_flow === 'prepaid'
                                    ? 'bg-blue-100 text-blue-700 text-xs'
                                    : 'bg-purple-100 text-purple-700 text-xs'
                                }
                              >
                                {c.payment_flow}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-center">
                              {c.is_irregular ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-400">
                              {c.consumption_number}
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

      {/* ── Vehicle detail drill-down panel ── */}
      {selectedVehicleId && (
        <VehicleDetailPanel
          vehicleId={selectedVehicleId}
          vehicleName={selectedVehicleName}
          onClose={() => setSelectedVehicleId(null)}
        />
      )}
    </div>
  );
};

export default AssetFuelMonitorPage;
