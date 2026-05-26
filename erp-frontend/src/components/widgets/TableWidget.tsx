import { useState, type FC } from 'react';

interface Column {
  key: string;
  header: string;
  format?: 'currency' | 'percentage' | 'number' | 'date';
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
}

interface TableWidgetProps {
  config: {
    title: string;
    columns: Column[];
    pagination?: {
      enabled: boolean;
      pageSize: number;
    };
  };
  data?: Array<Record<string, any>>;
  loading?: boolean;
  error?: Error | null;
  onRowClick?: (row: Record<string, any>) => void;
}

const TableWidget: FC<TableWidgetProps> = ({
  config,
  data = [],
  loading = false,
  error: _error = null,
  onRowClick: _onRowClick,
}: TableWidgetProps) => {
  const [page, setPage] = useState<number>(0);
  const pageSize = config.pagination?.pageSize || 10;

  const formatCell = (value: any, format?: string) => {
    if (value === null || value === undefined) return '-';

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'number':
        return value.toLocaleString();
      case 'date':
        return new Date(value).toLocaleDateString();
      default:
        return value;
    }
  };

  const displayData = config.pagination?.enabled
    ? data.slice(page * pageSize, (page + 1) * pageSize)
    : data;

  return (
    <div className="table-widget">
      <h3 className="table-title">{config.title}</h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              {config.columns.map((col: Column) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, i) => (
              <tr key={i}>
                {config.columns.map((col: Column) => (
                  <td key={col.key}>{formatCell(row[col.key], col.format)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {config.pagination?.enabled && (
        <div className="table-pagination">
          <button onClick={() => setPage((p: number) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(data.length / pageSize)}
          </span>
          <button
            onClick={() =>
              setPage((p: number) => Math.min(Math.ceil(data.length / pageSize) - 1, p + 1))
            }
            disabled={page >= Math.ceil(data.length / pageSize) - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export { TableWidget };
