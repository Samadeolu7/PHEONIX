import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { PayablesFilters } from '../../types/liabilities';
import { Badge } from '@/components/ui/Badge';
import { usePayables } from '../../hooks/usePayables';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    partial: 'secondary',
    paid: 'default',
    overdue: 'destructive',
    cancelled: 'outline',
  };

  return <Badge variant={variants[status] || 'default'}>{status.toUpperCase()}</Badge>;
};

const MatchStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    passed: 'default',
    failed: 'destructive',
    not_required: 'secondary',
  };

  const labels: Record<string, string> = {
    pending: 'Pending',
    passed: 'Passed',
    failed: 'Failed',
    not_required: 'Not Required',
  };

  return (
    <Badge variant={variants[status] || 'default'}>{labels[status] || status.toUpperCase()}</Badge>
  );
};

// ============================================================================
// PAYABLES LIST COMPONENT
// ============================================================================

interface PayablesListProps {
  filters?: PayablesFilters;
  onFilterChange?: (filters: PayablesFilters) => void;
  compact?: boolean;
}

export const PayablesList: React.FC<PayablesListProps> = ({
  filters: externalFilters,
  onFilterChange,
  compact = false,
}) => {
  const navigate = useNavigate();
  const [localFilters, setLocalFilters] = useState<PayablesFilters>(externalFilters || {});

  const activeFilters = externalFilters || localFilters;
  const { data, isLoading, error } = usePayables(activeFilters);

  const handleFilterChange = (key: keyof PayablesFilters, value: any) => {
    const newFilters = { ...activeFilters, [key]: value };

    if (onFilterChange) {
      onFilterChange(newFilters);
    } else {
      setLocalFilters(newFilters);
    }
  };

  const handleRowClick = (id: number) => {
    navigate(`/liabilities/payables/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading payables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-destructive">Error loading payables: {error.message}</div>
      </div>
    );
  }

  const payables = data?.results || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <Input
            placeholder="Search by invoice number..."
            value={activeFilters.search || ''}
            onChange={e => handleFilterChange('search', e.target.value)}
          />

          <Select
            value={activeFilters.status || 'all'}
            onValueChange={value =>
              handleFilterChange('status', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={activeFilters.vendor_type || 'all'}
            onValueChange={value =>
              handleFilterChange('vendor_type', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              <SelectItem value="supplier">Suppliers</SelectItem>
              <SelectItem value="client">Clients</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={activeFilters.three_way_match_status || 'all'}
            onValueChange={value =>
              handleFilterChange('three_way_match_status', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Match Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Match Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="not_required">Not Required</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.count || 0} payable{data?.count !== 1 ? 's' : ''} found
        </p>
        {!compact && (
          <Button onClick={() => navigate('/liabilities/payables/new')}>Create Payable</Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-right">Amount Due</TableHead>
              <TableHead>Status</TableHead>
              {!compact && <TableHead>Match Status</TableHead>}
              {!compact && <TableHead>PO Number</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={compact ? 8 : 10} className="text-center py-8">
                  <div className="text-muted-foreground">No payables found</div>
                </TableCell>
              </TableRow>
            ) : (
              payables.map(payable => (
                <TableRow
                  key={payable.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(payable.id)}
                >
                  <TableCell className="font-medium">{payable.invoice_number}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{payable.vendor_name}</div>
                      <div className="text-xs text-muted-foreground">{payable.vendor_type}</div>
                    </div>
                  </TableCell>
                  <TableCell>{payable.invoice_number}</TableCell>
                  <TableCell>{formatDate(payable.invoice_date)}</TableCell>
                  <TableCell>{formatDate(payable.due_date)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(parseFloat(payable.amount) || 0)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(parseFloat(payable.outstanding_amount) || 0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={payable.status} />
                  </TableCell>
                  {!compact && (
                    <TableCell>
                      <MatchStatusBadge status={payable.three_way_match_status} />
                    </TableCell>
                  )}
                  {!compact && (
                    <TableCell>
                      {payable.purchase_order !== null ? (
                        `PO #${payable.purchase_order}`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PayablesList;
