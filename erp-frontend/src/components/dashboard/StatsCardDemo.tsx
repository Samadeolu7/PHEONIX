// Demo component showcasing the stats card system integration
import React, { useState } from 'react';
import { StatsCardContainer } from './StatsCardContainer';
import { useStatsCards } from '../../hooks/useStatsCards';
import { UserRole } from '../../types/roles';
import { PageId } from '../../types/permissions';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Dialog, {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

import { Button } from '@/components/ui/Button';

import Textarea from '@/components/ui/Textarea';

import { Input } from '@/components/ui/Input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

import { Alert, AlertDescription } from '@/components/ui/Alert';

import { Label } from '../ui/Label';
import { RefreshCw, Settings, Eye, BarChart3 } from 'lucide-react';

// Mock permissions for demo
const mockPermissions: Record<UserRole, PageId[]> = {
  Director: [
    'financial.receivables_dashboard',
    'financial.accounts_management',
    'students.client_management',
    'students.entitlements',
    'operations.procurement_dashboard',
    'operations.inventory_management',
    'admin.system_settings',
    'users.add',
  ],
  Principal: [
    'financial.receivables_dashboard',
    'students.client_management',
    'students.entitlements',
    'operations.procurement_dashboard',
  ],
  Administrator: [
    'admin.system_settings',
    'users.add',
    'financial.accounts_management',
    'operations.inventory_management',
  ],
  Registrar: [
    'students.client_management',
    'students.entitlements',
    'financial.receivables_dashboard',
  ],
  Officer: ['operations.procurement_dashboard', 'operations.inventory_management'],
};

const mockModules: Record<UserRole, string[]> = {
  Director: ['financial', 'client-services', 'operations', 'administration'],
  Principal: ['financial', 'client-services', 'operations'],
  Administrator: ['administration', 'financial', 'operations'],
  Registrar: ['client-services', 'financial'],
  Officer: ['operations'],
};

export const StatsCardDemo: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('Director');
  const [layout, setLayout] = useState<'grid' | 'list' | 'masonry' | 'carousel'>('grid');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [theme, setTheme] = useState<'light' | 'dark' | 'gradient' | 'mixed'>('light');
  const [showAggregated, setShowAggregated] = useState(true);
  const [enableRealTime, setEnableRealTime] = useState(true);
  const [showControls, setShowControls] = useState(true);

  // Use the stats cards hook
  const {
    stats,
    aggregatedStats,
    allStats,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
    refreshStat,
    toggleRealTime,
    clearError,
    getCacheInfo,
  } = useStatsCards({
    role: selectedRole,
    modules: mockModules[selectedRole],
    permissions: mockPermissions[selectedRole],
    enableRealTime,
    enableAggregation: showAggregated,
    refreshInterval: 30000,
  });

  const handleRoleChange = (role: string) => {
    setSelectedRole(role as UserRole);
  };

  const handleRefresh = async () => {
    await refresh();
  };

  const cacheInfo = getCacheInfo();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stats Card System Demo</h1>
          <p className="text-gray-600">
            Demonstrating dynamic stats cards with real-time updates and role-based permissions
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline">{allStats.length} stats loaded</Badge>
          {lastUpdated && (
            <Badge variant="secondary">Updated {lastUpdated.toLocaleTimeString()}</Badge>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">User Role</label>
              <select
                value={selectedRole}
                onChange={e => handleRoleChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="Director">Director</option>
                <option value="Principal">Principal</option>
                <option value="Administrator">Administrator</option>
                <option value="Registrar">Registrar</option>
                <option value="Officer">Officer</option>
              </select>
            </div>

            {/* Layout Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Layout</label>
              <select
                value={layout}
                onChange={e => setLayout(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="grid">Grid</option>
                <option value="list">List</option>
                <option value="masonry">Masonry</option>
                <option value="carousel">Carousel</option>
              </select>
            </div>

            {/* Size Selection */}
            <div className="space-y-2">
              B<label className="text-sm font-medium">Card Size</label>
              <select
                value={size}
                onChange={e => setSize(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            {/* Theme Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme</label>
              <select
                value={theme}
                onChange={e => setTheme(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="gradient">Gradient</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6 mt-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showAggregated}
                onChange={e => setShowAggregated(e.target.checked)}
                className="rounded"
              />
              <label className="text-sm">Show Aggregated Stats</label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={enableRealTime}
                onChange={e => {
                  setEnableRealTime(e.target.checked);
                  toggleRealTime(e.target.checked);
                }}
                className="rounded"
              />
              <label className="text-sm">Real-time Updates</label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showControls}
                onChange={e => setShowControls(e.target.checked)}
                className="rounded"
              />
              <label className="text-sm">Show Controls</label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 mt-4">
            <Button onClick={handleRefresh} disabled={isRefreshing} size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh All
            </Button>
            {error && (
              <Button onClick={clearError} variant="outline" size="sm">
                Clear Error
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Individual Stats</p>
                <p className="text-2xl font-bold">{stats.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Aggregated Stats</p>
                <p className="text-2xl font-bold">{aggregatedStats.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Cache Entries</p>
                <p className="text-2xl font-bold">{cacheInfo.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-800 font-medium">Error Loading Stats</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
              <Button onClick={clearError} variant="outline" size="sm">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Display */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Dashboard Stats</h3>
          <StatsCardContainer
            role={selectedRole}
            modules={mockModules[selectedRole]}
            permissions={mockPermissions[selectedRole]}
            layout={layout}
            size={size}
            theme={theme}
            showAggregated={showAggregated}
            showControls={showControls}
            enableRealTime={enableRealTime}
            refreshInterval={30}
            maxCards={12}
            onStatsUpdate={updatedStats => {
              console.log('Stats updated:', updatedStats);
            }}
            onError={error => {
              console.error('Stats error:', error);
            }}
          />
        </div>

        {/* Aggregated Stats Section */}
        {showAggregated && aggregatedStats.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Aggregated Cross-Module Stats</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {aggregatedStats.map(stat => (
                <Card key={stat.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{stat.title}</h4>
                    <Badge variant="outline">{stat.category}</Badge>
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  {stat.change && (
                    <p
                      className={`text-sm ${
                        stat.change.type === 'increase' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {stat.change.value > 0 ? '+' : ''}
                      {stat.change.value}% vs {stat.change.period}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions & Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Available Modules</h4>
              <div className="flex flex-wrap gap-2">
                {mockModules[selectedRole].map(module => (
                  <Badge key={module} variant="secondary">
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Permissions</h4>
              <div className="flex flex-wrap gap-2">
                {mockPermissions[selectedRole].slice(0, 6).map(permission => (
                  <Badge key={permission} variant="outline" className="text-xs">
                    {permission}
                  </Badge>
                ))}
                {mockPermissions[selectedRole].length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{mockPermissions[selectedRole].length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsCardDemo;
