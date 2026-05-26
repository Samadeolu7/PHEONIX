// // Comprehensive stats management dashboard showcasing enhanced functionality
// import React, { useState, useEffect } from 'react';
// import {
//   Download,
//   RefreshCw,
//   Settings,
//   AlertTriangle,
//   Activity,
//   Database,
//   Wifi,
//   WifiOff,
//   BarChart3,
//   FileText,
//   Clock,
//   TrendingUp,
//   Zap,
// } from 'lucide-react';
// import { StatsCard } from './StatsCard';
// import { useStatsCards } from '../../hooks/useStatsCards';
// import { useAuth } from '../../contexts/AuthContext';
// import { usePermissions } from '../../hooks/usePermissions';
// import {Badge} from '@/components/ui/Badge'

// import Card from '@/components/ui/Card';

// import { Button } from '@/components/ui/Button';

// import { cn } from '../../lib/utils';

// interface StatsManagementDashboardProps {
//   className?: string;
// }

// export const StatsManagementDashboard: React.FC<StatsManagementDashboardProps> = ({
//   className = '',
// }) => {
//   const { user } = useAuth();
//   const { permissions } = usePermissions();
//   const [selectedModules, setSelectedModules] = useState<string[]>([
//     'financial',
//     'client-services',
//     'operations',
//   ]);
//   const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'excel' | 'pdf'>('json');
//   const [activeTab, setActiveTab] = useState<'stats' | 'performance' | 'reports' | 'settings'>('stats');

//   // Use the enhanced stats hook
//   const {
//     stats,
//     aggregatedStats,
//     allStats,
//     isLoading,
//     isRefreshing,
//     error,
//     lastUpdated,
//     refresh,
//     refreshStat,
//     toggleRealTime,
//     clearError,
//     exportStats,
//     generateReport,
//     getReportHistory,
//     getPerformanceMetrics,
//     getPerformanceAlerts,
//     getRealTimeStatus,
//     getRealTimeStatistics,
//     clearCache,
//     getCacheInfo,
//   } = useStatsCards({
//     role: user?.role || 'Officer',
//     modules: selectedModules,
//     permissions: permissions,
//     enableRealTime: true,
//     enableAggregation: true,
//     refreshInterval: 30000,
//   });

//   // Performance and real-time status
//   const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);
//   const [performanceAlerts, setPerformanceAlerts] = useState<any[]>([]);
//   const [realTimeStatus, setRealTimeStatus] = useState<any>(null);
//   const [realTimeStats, setRealTimeStats] = useState<any>(null);
//   const [cacheInfo, setCacheInfo] = useState<any>(null);

//   // Update metrics periodically
//   useEffect(() => {
//     const updateMetrics = () => {
//       setPerformanceMetrics(getPerformanceMetrics());
//       setPerformanceAlerts(getPerformanceAlerts());
//       setRealTimeStatus(getRealTimeStatus());
//       setRealTimeStats(getRealTimeStatistics());
//       setCacheInfo(getCacheInfo());
//     };

//     updateMetrics();
//     const interval = setInterval(updateMetrics, 5000);

//     return () => clearInterval(interval);
//   }, [
//     getPerformanceMetrics,
//     getPerformanceAlerts,
//     getRealTimeStatus,
//     getRealTimeStatistics,
//     getCacheInfo,
//   ]);

//   // Handle export
//   const handleExport = async () => {
//     try {
//       const blob = await exportStats({ format: exportFormat });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `stats-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//       URL.revokeObjectURL(url);
//     } catch (error) {
//       console.error('Export failed:', error);
//     }
//   };

//   // Handle report generation
//   const handleGenerateReport = async () => {
//     try {
//       const report = await generateReport({
//         format: 'json',
//         includeMetadata: true,
//         includeCharts: true,
//         groupBy: 'category',
//       });
//       console.log('Generated report:', report);
//     } catch (error) {
//       console.error('Report generation failed:', error);
//     }
//   };

//   // Module selection
//   const availableModules = [
//     { id: 'financial', name: 'Financial Management', icon: BarChart3 },
//     { id: 'client-services', name: 'Client Services', icon: FileText },
//     { id: 'operations', name: 'Operations', icon: Activity },
//     { id: 'administration', name: 'Administration', icon: Settings },
//   ];

//   const toggleModule = (moduleId: string) => {
//     setSelectedModules(prev =>
//       prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
//     );
//   };

//   return (
//     <div className={cn('space-y-6', className)}>
//       {/* Header */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-2xl font-bold text-gray-900">Stats Management Dashboard</h1>
//           <p className="text-gray-600">
//             Enhanced stats and metrics system with real-time updates, caching, and reporting
//           </p>
//         </div>

//         <div className="flex items-center space-x-3">
//           <Button onClick={refresh} disabled={isRefreshing} variant="outline" size="sm">
//             <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
//             Refresh
//           </Button>

//           <Button onClick={handleExport} variant="outline" size="sm">
//             <Download className="h-4 w-4 mr-2" />
//             Export
//           </Button>

//           <Button onClick={handleGenerateReport} variant="outline" size="sm">
//             <FileText className="h-4 w-4 mr-2" />
//             Generate Report
//           </Button>
//         </div>
//       </div>

//       {/* Error Display */}
//       {error && (
//         <Card className="p-4 border-red-200 bg-red-50">
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-2">
//               <AlertTriangle className="h-5 w-5 text-red-600" />
//               <span className="text-red-800">{error}</span>
//             </div>
//             <Button onClick={clearError} variant="ghost" size="sm">
//               Dismiss
//             </Button>
//           </div>
//         </Card>
//       )}

//       {/* System Status */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//         <Card className="p-4">
//           <div className="flex items-center space-x-3">
//             <div
//               className={cn(
//                 'p-2 rounded-lg',
//                 realTimeStatus?.connected ? 'bg-green-100' : 'bg-red-100'
//               )}
//             >
//               {realTimeStatus?.connected ? (
//                 <Wifi className="h-5 w-5 text-green-600" />
//               ) : (
//                 <WifiOff className="h-5 w-5 text-red-600" />
//               )}
//             </div>
//             <div>
//               <p className="text-sm font-medium">Real-time Connection</p>
//               <p className="text-xs text-gray-600">
//                 {realTimeStatus?.connected ? 'Connected' : 'Disconnected'}
//               </p>
//             </div>
//           </div>
//         </Card>

//         <Card className="p-4">
//           <div className="flex items-center space-x-3">
//             <div className="p-2 rounded-lg bg-blue-100">
//               <Database className="h-5 w-5 text-blue-600" />
//             </div>
//             <div>
//               <p className="text-sm font-medium">Cache Status</p>
//               <p className="text-xs text-gray-600">{cacheInfo?.size || 0} entries</p>
//             </div>
//           </div>
//         </Card>

//         <Card className="p-4">
//           <div className="flex items-center space-x-3">
//             <div className="p-2 rounded-lg bg-yellow-100">
//               <Clock className="h-5 w-5 text-yellow-600" />
//             </div>
//             <div>
//               <p className="text-sm font-medium">Last Updated</p>
//               <p className="text-xs text-gray-600">
//                 {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
//               </p>
//             </div>
//           </div>
//         </Card>

//         <Card className="p-4">
//           <div className="flex items-center space-x-3">
//             <div className="p-2 rounded-lg bg-purple-100">
//               <TrendingUp className="h-5 w-5 text-purple-600" />
//             </div>
//             <div>
//               <p className="text-sm font-medium">Active Stats</p>
//               <p className="text-xs text-gray-600">{allStats.length} total</p>
//             </div>
//           </div>
//         </Card>
//       </div>

//       {/* Module Selection */}
//       <Card className="p-4">
//         <h3 className="text-lg font-semibold mb-3">Module Selection</h3>
//         <div className="flex flex-wrap gap-2">
//           {availableModules.map(module => {
//             const Icon = module.icon;
//             const isSelected = selectedModules.includes(module.id);

//             return (
//               <Button
//                 key={module.id}
//                 onClick={() => toggleModule(module.id)}
//                 variant={isSelected ? 'default' : 'outline'}
//                 size="sm"
//                 className="flex items-center space-x-2"
//               >
//                 <Icon className="h-4 w-4" />
//                 <span>{module.name}</span>
//               </Button>
//             );
//           })}
//         </div>
//       </Card>

//       {/* Main Content Tabs */}
//       <div className="space-y-4">
//         {/* Custom Tab Navigation */}
//         <div className="border-b border-gray-200">
//           <nav className="-mb-px flex space-x-8">
//             {[
//               { id: 'stats', label: 'Stats Cards' },
//               { id: 'performance', label: 'Performance' },
//               { id: 'reports', label: 'Reports' },
//               { id: 'settings', label: 'Settings' },
//             ].map((tab) => (
//               <button
//                 key={tab.id}
//                 onClick={() => setActiveTab(tab.id as any)}
//                 className={cn(
//                   'whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm',
//                   activeTab === tab.id
//                     ? 'border-blue-500 text-blue-600'
//                     : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
//                 )}
//               >
//                 {tab.label}
//               </button>
//             ))}
//           </nav>
//         </div>

//         {/* Tab Content */}
//         <div className="mt-6">
//           {/* Stats Cards Tab */}
//           {activeTab === 'stats' && (
//             <div className="space-y-6">
//               {/* Aggregated Stats */}
//               {aggregatedStats.length > 0 && (
//                 <div>
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <Zap className="h-5 w-5 mr-2" />
//                     Aggregated Metrics
//                   </h3>
//                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//                     {aggregatedStats.map(stat => (
//                       <StatsCard
//                         key={stat.id}
//                         {...stat}
//                         onRefresh={refreshStat}
//                         realTimeEnabled={true}
//                         showControls={true}
//                       />
//                     ))}
//                   </div>
//                 </div>
//               )}

//               {/* Individual Stats */}
//               <div>
//                 <h3 className="text-lg font-semibold mb-4 flex items-center">
//                   <BarChart3 className="h-5 w-5 mr-2" />
//                   Individual Metrics
//                 </h3>
//                 {isLoading ? (
//                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//                     {[...Array(8)].map((_, i) => (
//                       <div key={i} className="animate-pulse">
//                         <div className="bg-gray-200 rounded-lg h-32"></div>
//                       </div>
//                     ))}
//                   </div>
//                 ) : (
//                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//                     {stats.map(stat => (
//                       <StatsCard
//                         key={stat.id}
//                         {...stat}
//                         onRefresh={refreshStat}
//                         realTimeEnabled={true}
//                         showControls={true}
//                       />
//                     ))}
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}

//           {/* Performance Tab */}
//           {activeTab === 'performance' && (
//             <div className="space-y-6">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                 {/* Performance Metrics */}
//                 <div className="bg-white rounded-lg border p-6">
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <Activity className="h-5 w-5 mr-2" />
//                     Performance Metrics
//                   </h3>
//                   {performanceMetrics && (
//                     <div className="space-y-3">
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Average Load Time</span>
//                         <span className="text-sm font-medium">
//                           {performanceMetrics.averageLoadTime?.toFixed(0)}ms
//                         </span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Cache Hit Rate</span>
//                         <span className="text-sm font-medium">
//                           {performanceMetrics.cacheHitRate?.toFixed(1)}%
//                         </span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Error Rate</span>
//                         <span className="text-sm font-medium">
//                           {performanceMetrics.errorRate?.toFixed(1)}%
//                         </span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Total Requests</span>
//                         <span className="text-sm font-medium">
//                           {performanceMetrics.totalRequests || 0}
//                         </span>
//                       </div>
//                     </div>
//                   )}
//                 </div>

//                 {/* Real-time Statistics */}
//                 <div className="bg-white rounded-lg border p-6">
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <Wifi className="h-5 w-5 mr-2" />
//                     Real-time Statistics
//                   </h3>
//                   {realTimeStats && (
//                     <div className="space-y-3">
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Connection Status</span>
//                         <Badge variant={realTimeStats.connected ? 'success' : 'error'}>
//                           {realTimeStats.connected ? 'Connected' : 'Disconnected'}
//                         </Badge>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Active Subscriptions</span>
//                         <span className="text-sm font-medium">{realTimeStats.subscriptions || 0}</span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Latency</span>
//                         <span className="text-sm font-medium">{realTimeStats.latency || 0}ms</span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-sm text-gray-600">Uptime</span>
//                         <span className="text-sm font-medium">
//                           {realTimeStats.uptime ? `${Math.floor(realTimeStats.uptime / 1000)}s` : 'N/A'}
//                         </span>
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Performance Alerts */}
//               {performanceAlerts.length > 0 && (
//                 <div className="bg-white rounded-lg border p-6">
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <AlertTriangle className="h-5 w-5 mr-2" />
//                     Performance Alerts
//                   </h3>
//                   <div className="space-y-2">
//                     {performanceAlerts.slice(0, 5).map((alert, index) => (
//                       <div
//                         key={index}
//                         className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
//                       >
//                         <div className="flex items-center space-x-2">
//                           <AlertTriangle className="h-4 w-4 text-yellow-600" />
//                           <span className="text-sm">{alert.message}</span>
//                         </div>
//                         <Badge variant="outline">{alert.type}</Badge>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}
//             </div>
//           )}

//           {/* Reports Tab */}
//           {activeTab === 'reports' && (
//             <div className="space-y-6">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                 {/* Export Options */}
//                 <div className="bg-white rounded-lg border p-6">
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <Download className="h-5 w-5 mr-2" />
//                     Export Options
//                   </h3>
//                   <div className="space-y-4">
//                     <div>
//                       <label className="text-sm font-medium text-gray-700">Export Format</label>
//                       <select
//                         value={exportFormat}
//                         onChange={e => setExportFormat(e.target.value as any)}
//                         className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
//                       >
//                         <option value="json">JSON</option>
//                         <option value="csv">CSV</option>
//                         <option value="excel">Excel</option>
//                         <option value="pdf">PDF</option>
//                       </select>
//                     </div>
//                     <Button onClick={handleExport} className="w-full">
//                       <Download className="h-4 w-4 mr-2" />
//                       Export Stats
//                     </Button>
//                   </div>
//                 </div>

//                 {/* Report History */}
//                 <div className="bg-white rounded-lg border p-6">
//                   <h3 className="text-lg font-semibold mb-4 flex items-center">
//                     <FileText className="h-5 w-5 mr-2" />
//                     Report History
//                   </h3>
//                   <div className="space-y-2">
//                     {getReportHistory(5).map((report) => (
//                       <div
//                         key={report.id}
//                         className="flex items-center justify-between p-2 bg-gray-50 rounded"
//                       >
//                         <div>
//                           <p className="text-sm font-medium">{report.title}</p>
//                           <p className="text-xs text-gray-600">{report.generatedAt.toLocaleString()}</p>
//                         </div>
//                         <Badge variant="outline">{report.metadata.totalStats} stats</Badge>
//                       </div>
//                     ))}
//                     {getReportHistory().length === 0 && (
//                       <p className="text-sm text-gray-500 text-center py-4">No reports generated yet</p>
//                     )}
//                   </div>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Settings Tab */}
//           {activeTab === 'settings' && (
//             <div className="space-y-6">
//               <div className="bg-white rounded-lg border p-6">
//                 <h3 className="text-lg font-semibold mb-4 flex items-center">
//                   <Settings className="h-5 w-5 mr-2" />
//                   Cache Management
//                 </h3>
//                 <div className="space-y-4">
//                   <div className="flex items-center justify-between">
//                     <div>
//                       <p className="text-sm font-medium">Cache Entries</p>
//                       <p className="text-xs text-gray-600">{cacheInfo?.size || 0} cached items</p>
//                     </div>
//                     <Button onClick={clearCache} variant="secondary">
//                       Clear Cache
//                     </Button>
//                   </div>

//                   <div className="flex items-center justify-between">
//                     <div>
//                       <p className="text-sm font-medium">Real-time Updates</p>
//                       <p className="text-xs text-gray-600">
//                         {realTimeStatus?.connected ? 'Enabled' : 'Disabled'}
//                       </p>
//                     </div>
//                     <Button
//                       onClick={() => toggleRealTime(!realTimeStatus?.connected)}
//                       variant="secondary"
//                     >
//                       {realTimeStatus?.connected ? 'Disable' : 'Enable'}
//                     </Button>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default StatsManagementDashboard;
