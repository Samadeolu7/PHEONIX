// ExportControls Component
// Provides export functionality for financial reports

import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { ExportFormat } from '../../types/financialReports';

interface ExportControlsProps {
  onExport: (format: ExportFormat) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const ExportControls: React.FC<ExportControlsProps> = ({
  onExport,
  loading = false,
  disabled = false,
  className = '',
}) => {
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    if (loading || disabled) return;

    try {
      setExportingFormat(format);
      await onExport(format);
    } catch (error) {
      console.error('Export failed:', error);
      // Error handling is managed by the parent component
    } finally {
      setExportingFormat(null);
    }
  };

  const isExporting = (format: ExportFormat) => exportingFormat === format;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <Download className="h-4 w-4" />
        <span className="font-medium">Export:</span>
      </div>

      {/* PDF Export Button */}
      <button
        onClick={() => handleExport('pdf')}
        disabled={loading || disabled || exportingFormat !== null}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200
          ${
            loading || disabled || exportingFormat !== null
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 active:bg-red-200'
          }
          ${isExporting('pdf') ? 'bg-red-100' : ''}
        `}
        title="Export as PDF"
      >
        {isExporting('pdf') ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        <span>PDF</span>
      </button>

      {/* Excel Export Button */}
      <button
        onClick={() => handleExport('excel')}
        disabled={loading || disabled || exportingFormat !== null}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200
          ${
            loading || disabled || exportingFormat !== null
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 active:bg-green-200'
          }
          ${isExporting('excel') ? 'bg-green-100' : ''}
        `}
        title="Export as Excel"
      >
        {isExporting('excel') ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        <span>Excel</span>
      </button>

      {/* Export Status */}
      {exportingFormat && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Exporting {exportingFormat.toUpperCase()}...</span>
        </div>
      )}
    </div>
  );
};

export default ExportControls;
