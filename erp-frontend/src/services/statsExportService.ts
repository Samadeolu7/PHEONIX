// Stats export and reporting service
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId, FunctionalCategory } from '../types/permissions';
import { statsCalculationEngine, CacheMetrics } from './statsCalculationEngine';
import { statsAggregationService } from './statsAggregationService';

export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf' | 'json';
  includeMetadata: boolean;
  includeCharts: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: {
    categories?: FunctionalCategory[];
    modules?: string[];
    minPriority?: number;
  };
  groupBy?: 'category' | 'module' | 'priority' | 'none';
  sortBy?: 'title' | 'value' | 'priority' | 'lastUpdated';
  sortOrder?: 'asc' | 'desc';
}

export interface StatsReport {
  id: string;
  title: string;
  description: string;
  generatedAt: Date;
  generatedBy: {
    role: UserRole;
    permissions: PageId[];
  };
  metadata: {
    totalStats: number;
    categories: string[];
    modules: string[];
    dateRange?: {
      start: Date;
      end: Date;
    };
    cacheMetrics?: CacheMetrics;
  };
  stats: StatsCardData[];
  aggregatedStats?: StatsCardData[];
  summary: {
    totalValue: number;
    averageValue: number;
    highestValue: StatsCardData;
    lowestValue: StatsCardData;
    trendsAnalysis: {
      increasing: number;
      decreasing: number;
      stable: number;
    };
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  modules: string[];
  exportOptions: ExportOptions;
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string; // HH:MM format
    enabled: boolean;
  };
  recipients?: string[]; // Email addresses
}

export class StatsExportService {
  private reportTemplates: Map<string, ReportTemplate> = new Map();
  private reportHistory: Map<string, StatsReport[]> = new Map();
  private readonly MAX_HISTORY_SIZE = 50;

  constructor() {
    this.initializeDefaultTemplates();
  }

  // Initialize default report templates for each role
  private initializeDefaultTemplates(): void {
    const defaultTemplates: ReportTemplate[] = [
      {
        id: 'director-comprehensive',
        name: 'Director Comprehensive Report',
        description: 'Complete overview of all system metrics for directors',
        role: 'Director',
        modules: ['financial', 'client-services', 'operations', 'administration'],
        exportOptions: {
          format: 'pdf',
          includeMetadata: true,
          includeCharts: true,
          groupBy: 'category',
          sortBy: 'priority',
          sortOrder: 'desc',
        },
        schedule: {
          frequency: 'daily',
          time: '08:00',
          enabled: false,
        },
      },
      {
        id: 'principal-academic',
        name: 'Principal Academic Report',
        description: 'Client Services and academic performance metrics',
        role: 'Principal',
        modules: ['client-services', 'financial'],
        exportOptions: {
          format: 'excel',
          includeMetadata: true,
          includeCharts: false,
          filters: {
            categories: ['Client Management', 'Financial Operations'],
          },
          groupBy: 'category',
          sortBy: 'priority',
          sortOrder: 'desc',
        },
        schedule: {
          frequency: 'weekly',
          time: '09:00',
          enabled: false,
        },
      },
      {
        id: 'administrator-system',
        name: 'Administrator System Report',
        description: 'System administration and operational metrics',
        role: 'Administrator',
        modules: ['administration', 'operations'],
        exportOptions: {
          format: 'csv',
          includeMetadata: false,
          includeCharts: false,
          filters: {
            categories: ['System Administration', 'Operations'],
          },
          groupBy: 'module',
          sortBy: 'title',
          sortOrder: 'asc',
        },
      },
      {
        id: 'registrar-student',
        name: 'Registrar Student Report',
        description: 'Student management and enrollment metrics',
        role: 'Registrar',
        modules: ['client-services'],
        exportOptions: {
          format: 'excel',
          includeMetadata: true,
          includeCharts: true,
          filters: {
            categories: ['Client Management'],
          },
          groupBy: 'none',
          sortBy: 'value',
          sortOrder: 'desc',
        },
      },
      {
        id: 'officer-operations',
        name: 'Officer Operations Report',
        description: 'Daily operational metrics and tasks',
        role: 'Officer',
        modules: ['operations', 'financial'],
        exportOptions: {
          format: 'csv',
          includeMetadata: false,
          includeCharts: false,
          filters: {
            minPriority: 3,
          },
          groupBy: 'none',
          sortBy: 'priority',
          sortOrder: 'desc',
        },
      },
    ];

    defaultTemplates.forEach(template => {
      this.reportTemplates.set(template.id, template);
    });
  }

  // Generate a comprehensive stats report
  async generateReport(
    role: UserRole,
    modules: string[],
    permissions: PageId[],
    options: Partial<ExportOptions> = {}
  ): Promise<StatsReport> {
    const exportOptions: ExportOptions = {
      format: 'json',
      includeMetadata: true,
      includeCharts: false,
      groupBy: 'category',
      sortBy: 'priority',
      sortOrder: 'desc',
      ...options,
    };

    // Get individual stats
    const stats = await statsCalculationEngine.calculateStatsForRole(role, modules, permissions);

    // Get aggregated stats if needed
    const aggregatedStats = exportOptions.includeMetadata
      ? await statsAggregationService.aggregateStatsForRole(role, modules, permissions)
      : [];

    // Apply filters
    const filteredStats = this.applyFilters(stats, exportOptions.filters);
    const filteredAggregatedStats = this.applyFilters(aggregatedStats, exportOptions.filters);

    // Sort stats
    const sortedStats = this.sortStats(
      filteredStats,
      exportOptions.sortBy,
      exportOptions.sortOrder
    );
    const sortedAggregatedStats = this.sortStats(
      filteredAggregatedStats,
      exportOptions.sortBy,
      exportOptions.sortOrder
    );

    // Generate summary
    const summary = this.generateSummary([...sortedStats, ...sortedAggregatedStats]);

    // Get cache metrics if metadata is included
    const cacheMetrics = exportOptions.includeMetadata
      ? statsCalculationEngine.getCacheMetrics()
      : undefined;

    const report: StatsReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `Stats Report - ${role}`,
      description: `Comprehensive stats report for ${role} role`,
      generatedAt: new Date(),
      generatedBy: {
        role,
        permissions,
      },
      metadata: {
        totalStats: sortedStats.length + sortedAggregatedStats.length,
        categories: [
          ...new Set(
            [...sortedStats, ...sortedAggregatedStats].map(s => s.category).filter(Boolean)
          ),
        ],
        modules,
        dateRange: exportOptions.dateRange,
        cacheMetrics,
      },
      stats: sortedStats,
      aggregatedStats: sortedAggregatedStats,
      summary,
    };

    // Store in history
    this.addToHistory(role, report);

    return report;
  }

  // Apply filters to stats array
  private applyFilters(
    stats: StatsCardData[],
    filters?: ExportOptions['filters']
  ): StatsCardData[] {
    if (!filters) return stats;

    return stats.filter(stat => {
      // Category filter
      if (
        filters.categories &&
        stat.category &&
        !filters.categories.includes(stat.category as FunctionalCategory)
      ) {
        return false;
      }

      // Priority filter
      if (filters.minPriority && (!stat.priority || stat.priority < filters.minPriority)) {
        return false;
      }

      return true;
    });
  }

  // Sort stats array
  private sortStats(
    stats: StatsCardData[],
    sortBy?: ExportOptions['sortBy'],
    sortOrder: ExportOptions['sortOrder'] = 'desc'
  ): StatsCardData[] {
    if (!sortBy) return stats;

    return [...stats].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'value':
          const aValue = typeof a.value === 'number' ? a.value : parseFloat(String(a.value)) || 0;
          const bValue = typeof b.value === 'number' ? b.value : parseFloat(String(b.value)) || 0;
          comparison = aValue - bValue;
          break;
        case 'priority':
          comparison = (a.priority || 0) - (b.priority || 0);
          break;
        case 'lastUpdated':
          const aDate = a.lastUpdated?.getTime() || 0;
          const bDate = b.lastUpdated?.getTime() || 0;
          comparison = aDate - bDate;
          break;
        default:
          return 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // Generate summary statistics
  private generateSummary(stats: StatsCardData[]): StatsReport['summary'] {
    if (stats.length === 0) {
      return {
        totalValue: 0,
        averageValue: 0,
        highestValue: {} as StatsCardData,
        lowestValue: {} as StatsCardData,
        trendsAnalysis: { increasing: 0, decreasing: 0, stable: 0 },
      };
    }

    const numericStats = stats.filter(stat => typeof stat.value === 'number') as (StatsCardData & {
      value: number;
    })[];

    const totalValue = numericStats.reduce((sum, stat) => sum + stat.value, 0);
    const averageValue = numericStats.length > 0 ? totalValue / numericStats.length : 0;

    const sortedByValue = [...numericStats].sort((a, b) => b.value - a.value);
    const highestValue = sortedByValue[0] || stats[0];
    const lowestValue = sortedByValue[sortedByValue.length - 1] || stats[0];

    // Analyze trends
    const trendsAnalysis = stats.reduce(
      (acc, stat) => {
        if (stat.change) {
          if (stat.change.value > 0) acc.increasing++;
          else if (stat.change.value < 0) acc.decreasing++;
          else acc.stable++;
        } else {
          acc.stable++;
        }
        return acc;
      },
      { increasing: 0, decreasing: 0, stable: 0 }
    );

    return {
      totalValue,
      averageValue,
      highestValue,
      lowestValue,
      trendsAnalysis,
    };
  }

  // Export report to specified format
  async exportReport(report: StatsReport, format: ExportOptions['format']): Promise<Blob> {
    switch (format) {
      case 'json':
        return this.exportToJSON(report);
      case 'csv':
        return this.exportToCSV(report);
      case 'excel':
        return this.exportToExcel(report);
      case 'pdf':
        return this.exportToPDF(report);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Export to JSON
  private exportToJSON(report: StatsReport): Blob {
    const jsonData = JSON.stringify(report, null, 2);
    return new Blob([jsonData], { type: 'application/json' });
  }

  // Export to CSV
  private exportToCSV(report: StatsReport): Blob {
    const allStats = [...report.stats, ...(report.aggregatedStats || [])];

    const headers = [
      'ID',
      'Title',
      'Value',
      'Category',
      'Priority',
      'Change Value',
      'Change Type',
      'Last Updated',
    ];

    const rows = allStats.map(stat => [
      stat.id,
      stat.title,
      stat.value,
      stat.category || '',
      stat.priority || '',
      stat.change?.value || '',
      stat.change?.type || '',
      stat.lastUpdated?.toISOString() || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return new Blob([csvContent], { type: 'text/csv' });
  }

  // Export to Excel (simplified - would need a library like xlsx for full Excel support)
  private exportToExcel(report: StatsReport): Blob {
    // For now, return CSV with Excel MIME type
    // In a real implementation, you'd use a library like xlsx
    const csvBlob = this.exportToCSV(report);
    return new Blob([csvBlob], { type: 'application/vnd.ms-excel' });
  }

  // Export to PDF (simplified - would need a library like jsPDF for full PDF support)
  private exportToPDF(report: StatsReport): Blob {
    // For now, return a simple text representation
    // In a real implementation, you'd use a library like jsPDF
    const content = this.generateTextReport(report);
    return new Blob([content], { type: 'application/pdf' });
  }

  // Generate text representation of report
  private generateTextReport(report: StatsReport): string {
    const lines: string[] = [];

    lines.push(`STATS REPORT - ${report.title}`);
    lines.push(`Generated: ${report.generatedAt.toLocaleString()}`);
    lines.push(`Role: ${report.generatedBy.role}`);
    lines.push('');

    lines.push('SUMMARY:');
    lines.push(`Total Stats: ${report.metadata.totalStats}`);
    lines.push(`Categories: ${report.metadata.categories.join(', ')}`);
    lines.push(`Modules: ${report.metadata.modules.join(', ')}`);
    lines.push(`Total Value: ${report.summary.totalValue}`);
    lines.push(`Average Value: ${report.summary.averageValue.toFixed(2)}`);
    lines.push('');

    lines.push('TRENDS ANALYSIS:');
    lines.push(`Increasing: ${report.summary.trendsAnalysis.increasing}`);
    lines.push(`Decreasing: ${report.summary.trendsAnalysis.decreasing}`);
    lines.push(`Stable: ${report.summary.trendsAnalysis.stable}`);
    lines.push('');

    lines.push('INDIVIDUAL STATS:');
    report.stats.forEach(stat => {
      lines.push(`${stat.title}: ${stat.value} (${stat.category || 'N/A'})`);
      if (stat.change) {
        lines.push(`  Change: ${stat.change.value}% ${stat.change.type} vs ${stat.change.period}`);
      }
    });

    if (report.aggregatedStats && report.aggregatedStats.length > 0) {
      lines.push('');
      lines.push('AGGREGATED STATS:');
      report.aggregatedStats.forEach(stat => {
        lines.push(`${stat.title}: ${stat.value} (${stat.category || 'N/A'})`);
      });
    }

    return lines.join('\n');
  }

  // Template management
  getReportTemplate(templateId: string): ReportTemplate | undefined {
    return this.reportTemplates.get(templateId);
  }

  getReportTemplatesForRole(role: UserRole): ReportTemplate[] {
    return Array.from(this.reportTemplates.values()).filter(template => template.role === role);
  }

  saveReportTemplate(template: ReportTemplate): void {
    this.reportTemplates.set(template.id, template);
  }

  deleteReportTemplate(templateId: string): boolean {
    return this.reportTemplates.delete(templateId);
  }

  // Generate report from template
  async generateReportFromTemplate(
    templateId: string,
    permissions: PageId[]
  ): Promise<StatsReport> {
    const template = this.getReportTemplate(templateId);
    if (!template) {
      throw new Error(`Report template not found: ${templateId}`);
    }

    return this.generateReport(
      template.role,
      template.modules,
      permissions,
      template.exportOptions
    );
  }

  // History management
  private addToHistory(role: UserRole, report: StatsReport): void {
    const roleKey = role;
    const history = this.reportHistory.get(roleKey) || [];

    history.unshift(report);

    // Keep only the most recent reports
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.splice(this.MAX_HISTORY_SIZE);
    }

    this.reportHistory.set(roleKey, history);
  }

  getReportHistory(role: UserRole, limit: number = 10): StatsReport[] {
    const history = this.reportHistory.get(role) || [];
    return history.slice(0, limit);
  }

  getReportById(reportId: string): StatsReport | undefined {
    for (const history of this.reportHistory.values()) {
      const report = history.find(r => r.id === reportId);
      if (report) return report;
    }
    return undefined;
  }

  // Bulk export multiple reports
  async bulkExport(reports: StatsReport[], format: ExportOptions['format']): Promise<Blob> {
    if (format === 'json') {
      const bulkData = {
        exportedAt: new Date(),
        totalReports: reports.length,
        reports,
      };
      return new Blob([JSON.stringify(bulkData, null, 2)], { type: 'application/json' });
    }

    // For other formats, combine all stats into a single export
    const combinedStats: StatsCardData[] = [];
    const combinedAggregatedStats: StatsCardData[] = [];

    reports.forEach(report => {
      combinedStats.push(...report.stats);
      if (report.aggregatedStats) {
        combinedAggregatedStats.push(...report.aggregatedStats);
      }
    });

    const combinedReport: StatsReport = {
      id: `bulk-export-${Date.now()}`,
      title: 'Bulk Export Report',
      description: `Combined export of ${reports.length} reports`,
      generatedAt: new Date(),
      generatedBy: reports[0]?.generatedBy || { role: 'Director', permissions: [] },
      metadata: {
        totalStats: combinedStats.length + combinedAggregatedStats.length,
        categories: [
          ...new Set(
            [...combinedStats, ...combinedAggregatedStats].map(s => s.category).filter(Boolean)
          ),
        ],
        modules: [...new Set(reports.flatMap(r => r.metadata.modules))],
      },
      stats: combinedStats,
      aggregatedStats: combinedAggregatedStats,
      summary: this.generateSummary([...combinedStats, ...combinedAggregatedStats]),
    };

    return this.exportReport(combinedReport, format);
  }

  // Clear old reports from history
  clearOldReports(olderThanDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let clearedCount = 0;

    for (const [role, history] of this.reportHistory.entries()) {
      const filteredHistory = history.filter(report => report.generatedAt > cutoffDate);
      clearedCount += history.length - filteredHistory.length;
      this.reportHistory.set(role, filteredHistory);
    }

    return clearedCount;
  }

  // Get export statistics
  getExportStatistics(): {
    totalTemplates: number;
    totalReportsInHistory: number;
    reportsByRole: Record<UserRole, number>;
    oldestReport: Date | null;
    newestReport: Date | null;
  } {
    const reportsByRole: Record<UserRole, number> = {
      Director: 0,
      Principal: 0,
      Administrator: 0,
      Registrar: 0,
      Officer: 0,
    };

    let totalReports = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    for (const [role, history] of this.reportHistory.entries()) {
      reportsByRole[role as UserRole] = history.length;
      totalReports += history.length;

      history.forEach(report => {
        if (!oldestDate || report.generatedAt < oldestDate) {
          oldestDate = report.generatedAt;
        }
        if (!newestDate || report.generatedAt > newestDate) {
          newestDate = report.generatedAt;
        }
      });
    }

    return {
      totalTemplates: this.reportTemplates.size,
      totalReportsInHistory: totalReports,
      reportsByRole,
      oldestReport: oldestDate,
      newestReport: newestDate,
    };
  }
}

// Export singleton instance
export const statsExportService = new StatsExportService();
