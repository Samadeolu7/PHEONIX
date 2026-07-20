import { useQuery } from '@tanstack/react-query';
import { invoiceService, type InvoiceFilters } from '../services/invoiceService';

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params?: InvoiceFilters) => [...invoiceKeys.lists(), params] as const,
};

export const useClientInvoices = (
  clientId?: number,
  filters?: Omit<InvoiceFilters, 'client_id'>
) => {
  return useQuery({
    queryKey: invoiceKeys.list({ client_id: clientId, ...filters }),
    queryFn: async () => {
      const res = await invoiceService.getInvoices({ client_id: clientId, ...filters });
      return Array.isArray(res) ? res : ((res as { results?: unknown[] }).results ?? res);
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });
};
