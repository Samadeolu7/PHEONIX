// Unified search service for global search functionality
import {
  FileText,
  Users,
  Building2,
  Package,
  UserCheck,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { SearchResult, SearchFilters, SearchOptions } from '../types/search';
import { invoiceService } from './invoiceService';
import { clientService } from './clientService';
import { inventoryService } from './inventoryService';
import { staffService } from './staffService';
import { receivablesService } from './receivablesService';
import { procurementService } from './procurementService';

class SearchService {
  private searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Perform unified search across all modules
   */
  async search(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const { maxResults = 50, includeMetadata = true } = options;
    const cacheKey = this.getCacheKey(query, filters);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.results.slice(0, maxResults);
    }

    try {
      const searchPromises: Promise<SearchResult[]>[] = [];
      const enabledTypes = filters.types || [
        'invoice',
        'student',
        'supplier',
        'item',
        'staff',
        'receivable',
        'purchase-order',
      ];

      // Search invoices
      if (enabledTypes.includes('invoice')) {
        searchPromises.push(this.searchInvoices(query, filters));
      }

      // Search clients
      if (enabledTypes.includes('client')) {
        searchPromises.push(this.searchClients(query, filters));
      }

      // Search suppliers
      if (enabledTypes.includes('supplier')) {
        searchPromises.push(this.searchSuppliers(query, filters));
      }

      // Search inventory items
      if (enabledTypes.includes('item')) {
        searchPromises.push(this.searchItems(query, filters));
      }

      // Search staff
      if (enabledTypes.includes('staff')) {
        searchPromises.push(this.searchStaff(query, filters));
      }

      // Search receivables
      if (enabledTypes.includes('receivable')) {
        searchPromises.push(this.searchReceivables(query, filters));
      }

      // Search purchase orders
      if (enabledTypes.includes('purchase-order')) {
        searchPromises.push(this.searchPurchaseOrders(query, filters));
      }

      const searchResults = await Promise.allSettled(searchPromises);
      const allResults: SearchResult[] = [];

      searchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        }
      });

      // Sort by relevance (title matches first, then subtitle, then description)
      const sortedResults = this.sortByRelevance(allResults, query);
      const limitedResults = sortedResults.slice(0, maxResults);

      // Cache results
      this.searchCache.set(cacheKey, {
        results: limitedResults,
        timestamp: Date.now(),
      });

      return limitedResults;
    } catch (error) {
      console.error('Search error:', error);
      throw new Error('Search failed. Please try again.');
    }
  }

  /**
   * Search invoices
   */
  private async searchInvoices(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      const response = await invoiceService.getInvoices({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(invoice => ({
        id: invoice.id.toString(),
        type: 'invoice' as const,
        title: `Invoice ${invoice.invoice_number}`,
        subtitle: invoice.client_name || 'Unknown Client',
        description: `Amount: ${invoice.total_amount} | Status: ${invoice.status}`,
        path: `/invoices/${invoice.id}`,
        icon: FileText,
        metadata: {
          amount: invoice.total_amount,
          status: invoice.status,
          date: invoice.invoice_date,
        },
      }));
    } catch (error) {
      console.error('Invoice search error:', error);
      return [];
    }
  }

  /**
   * Search clients
   */
  private async searchClients(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      const response = await clientService.getClients({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(client => ({
        id: client.id.toString(),
        type: 'client' as const,
        title: client.name,
        subtitle: client.email || client.phone || 'No contact info',
        description: `Classification: ${client.classification_name || 'None'}`,
        path: `/clients/${client.id}`,
        icon: Users,
        metadata: {
          classification: client.classification_name,
          isActive: client.is_active,
        },
      }));
    } catch (error) {
      console.error('Client search error:', error);
      return [];
    }
  }

  /**
   * Search suppliers
   */
  private async searchSuppliers(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      // Note: Using client service as suppliers might be stored as clients with different classification
      const response = await clientService.getClients({
        search: query,
        usage_context: 'financial',
        page_size: 20,
      });

      return (response.results || [])
        .filter(client => client.classification_name?.toLowerCase().includes('supplier'))
        .map(supplier => ({
          id: supplier.id.toString(),
          type: 'supplier' as const,
          title: supplier.name,
          subtitle: supplier.email || supplier.phone || 'No contact info',
          description: `Classification: ${supplier.classification_name || 'Supplier'}`,
          path: `/suppliers/${supplier.id}`,
          icon: Building2,
          metadata: {
            classification: supplier.classification_name,
            isActive: supplier.is_active,
          },
        }));
    } catch (error) {
      console.error('Supplier search error:', error);
      return [];
    }
  }

  /**
   * Search inventory items
   */
  private async searchItems(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      const response = await inventoryService.getItems({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(item => ({
        id: item.id.toString(),
        type: 'item' as const,
        title: item.name,
        subtitle: item.code || 'No code',
        description: `Category: ${item.category_name || 'Uncategorized'} | Stock: ${item.current_stock || 0}`,
        path: `/inventory/items/${item.id}`,
        icon: Package,
        metadata: {
          code: item.code,
          category: item.category_name,
          stock: item.current_stock,
        },
      }));
    } catch (error) {
      console.error('Item search error:', error);
      return [];
    }
  }

  /**
   * Search staff
   */
  private async searchStaff(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      const response = await staffService.getStaff({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(staff => ({
        id: staff.id.toString(),
        type: 'staff' as const,
        title: `${staff.first_name} ${staff.last_name}`,
        subtitle: staff.email || 'No email',
        description: `Department: ${staff.department_name || 'None'} | Position: ${staff.position || 'None'}`,
        path: `/hr/staff/${staff.staff_id || staff.id}/view`,
        icon: UserCheck,
        metadata: {
          department: staff.department_name,
          position: staff.position,
          isActive: staff.is_active,
        },
      }));
    } catch (error) {
      console.error('Staff search error:', error);
      return [];
    }
  }

  /**
   * Search receivables
   */
  private async searchReceivables(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    try {
      const response = await receivablesService.getReceivables({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(receivable => ({
        id: receivable.id.toString(),
        type: 'receivable' as const,
        title: `${receivable.customer_name} - ${receivable.invoice_number}`,
        subtitle: `Amount: ${receivable.total_amount}`,
        description: `Outstanding: ${receivable.outstanding_amount} | Due: ${receivable.due_date}`,
        path: `/receivables/${receivable.id}`,
        icon: Receipt,
        metadata: {
          totalAmount: receivable.total_amount,
          outstandingAmount: receivable.outstanding_amount,
          dueDate: receivable.due_date,
          status: receivable.status,
        },
      }));
    } catch (error) {
      console.error('Receivable search error:', error);
      return [];
    }
  }

  /**
   * Search purchase orders
   */
  private async searchPurchaseOrders(
    query: string,
    filters: SearchFilters
  ): Promise<SearchResult[]> {
    try {
      const response = await procurementService.getPurchaseOrders({
        search: query,
        page_size: 20,
      });

      return (response.results || []).map(po => ({
        id: po.id.toString(),
        type: 'purchase-order' as const,
        title: `PO ${po.po_number}`,
        subtitle: po.supplier_name || 'Unknown Supplier',
        description: `Total: ${po.total_amount} | Status: ${po.status}`,
        path: `/procurement/purchase-orders/${po.id}`,
        icon: ShoppingCart,
        metadata: {
          totalAmount: po.total_amount,
          status: po.status,
          supplierName: po.supplier_name,
        },
      }));
    } catch (error) {
      console.error('Purchase order search error:', error);
      return [];
    }
  }

  /**
   * Sort results by relevance to search query
   */
  private sortByRelevance(results: SearchResult[], query: string): SearchResult[] {
    const queryLower = query.toLowerCase();

    return results.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aSubtitle = a.subtitle.toLowerCase();
      const bSubtitle = b.subtitle.toLowerCase();

      // Exact title match gets highest priority
      if (aTitle === queryLower && bTitle !== queryLower) return -1;
      if (bTitle === queryLower && aTitle !== queryLower) return 1;

      // Title starts with query
      if (aTitle.startsWith(queryLower) && !bTitle.startsWith(queryLower)) return -1;
      if (bTitle.startsWith(queryLower) && !aTitle.startsWith(queryLower)) return 1;

      // Title contains query
      if (aTitle.includes(queryLower) && !bTitle.includes(queryLower)) return -1;
      if (bTitle.includes(queryLower) && !aTitle.includes(queryLower)) return 1;

      // Subtitle contains query
      if (aSubtitle.includes(queryLower) && !bSubtitle.includes(queryLower)) return -1;
      if (bSubtitle.includes(queryLower) && !aSubtitle.includes(queryLower)) return 1;

      // Fallback to alphabetical
      return aTitle.localeCompare(bTitle);
    });
  }

  /**
   * Generate cache key for search results
   */
  private getCacheKey(query: string, filters: SearchFilters): string {
    return `${query}-${JSON.stringify(filters)}`;
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * Get search suggestions based on recent searches and popular terms
   */
  getSearchSuggestions(query: string, recentSearches: string[] = []): string[] {
    const suggestions: string[] = [];

    // Add recent searches that match
    const matchingRecent = recentSearches.filter(search =>
      search.toLowerCase().includes(query.toLowerCase())
    );
    suggestions.push(...matchingRecent.slice(0, 3));

    // Add common search patterns
    const commonPatterns = [
      'invoice',
      'student',
      'supplier',
      'item',
      'staff',
      'payment',
      'purchase order',
    ];

    const matchingPatterns = commonPatterns.filter(
      pattern =>
        pattern.toLowerCase().includes(query.toLowerCase()) && !suggestions.includes(pattern)
    );

    suggestions.push(...matchingPatterns.slice(0, 5 - suggestions.length));

    return suggestions.slice(0, 5);
  }
}

export const searchService = new SearchService();
