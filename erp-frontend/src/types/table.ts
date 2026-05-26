export interface Column {
  key: string;
  label: string;
  header: string; // Same as label if not provided
}

export interface TableOptions {
  title: string;
  columns: Column[];
  data: Record<string, unknown>[];
  loading?: boolean;
  pageSize?: number;
  currentPage?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  rowActions?: {
    label: string;
    onClick: (row: Record<string, unknown>) => void;
  }[];
}
