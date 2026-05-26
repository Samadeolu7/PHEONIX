// src/__tests__/testUtils.tsx
import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ToastContext } from '../contexts/ToastContext';

// Mock user for testing
const mockUser = {
  id: 1,
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
};

// Mock auth context value
const mockAuthContextValue = {
  user: mockUser,
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  loading: false,
  error: null,
};

// Mock toast context value
const mockToastContextValue = {
  toasts: [],
  addToast: vi.fn(),
  removeToast: vi.fn(),
  clearToasts: vi.fn(),
};

interface AllTheProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
  queryClient?: QueryClient;
}

const AllTheProviders = ({
  children,
  initialEntries = ['/'],
  queryClient,
}: AllTheProvidersProps) => {
  const client =
    queryClient ||
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });

  const Router =
    initialEntries.length > 1 || initialEntries[0] !== '/' ? MemoryRouter : BrowserRouter;

  const routerProps = Router === MemoryRouter ? { initialEntries } : {};

  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={mockAuthContextValue}>
        <ToastContext.Provider value={mockToastContextValue}>
          <Router {...routerProps}>{children}</Router>
        </ToastContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  queryClient?: QueryClient;
}

const customRender = (ui: ReactElement, options: CustomRenderOptions = {}) => {
  const { initialEntries, queryClient, ...renderOptions } = options;

  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders initialEntries={initialEntries} queryClient={queryClient}>
        {children}
      </AllTheProviders>
    ),
    ...renderOptions,
  });
};

// Mock API responses
export const mockApiResponses = {
  suppliers: {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'Test Supplier 1',
        supplier_code: 'SUP-001',
        contact_person: 'John Doe',
        email: 'john@supplier1.com',
        phone: '+1234567890',
        address: '123 Main St',
        tax_id: 'TAX123',
        payment_terms: 'net_30' as const,
        credit_limit: '10000.00',
        is_active: true,
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'Test Supplier 2',
        supplier_code: 'SUP-002',
        contact_person: 'Jane Smith',
        email: 'jane@supplier2.com',
        phone: '+0987654321',
        address: '456 Oak Ave',
        tax_id: 'TAX456',
        payment_terms: 'net_15' as const,
        credit_limit: '5000.00',
        is_active: true,
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  },
  inventoryItems: {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        sku: 'ITEM-001',
        name: 'Test Item 1',
        barcode: '123456789',
        description: 'Test item description',
        category: 1,
        unit_of_measure: 'pcs',
        cost_price: '10.00',
        selling_price: '15.00',
        minimum_selling_price: '12.00',
        valuation_method: 'fifo' as const,
        reorder_level: '10.00',
        reorder_quantity: '100.00',
        is_active: true,
        is_sellable: true,
        is_purchasable: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        sku: 'ITEM-002',
        name: 'Test Item 2',
        barcode: '987654321',
        description: 'Another test item',
        category: 2,
        unit_of_measure: 'kg',
        cost_price: '25.00',
        selling_price: '40.00',
        minimum_selling_price: '35.00',
        valuation_method: 'average' as const,
        reorder_level: '5.00',
        reorder_quantity: '50.00',
        is_active: true,
        is_sellable: true,
        is_purchasable: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  },
  departments: {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'IT Department',
        code: 'IT',
      },
      {
        id: 2,
        name: 'HR Department',
        code: 'HR',
      },
    ],
  },
  inventoryLocations: {
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        id: 1,
        name: 'Main Warehouse',
        code: 'WH-001',
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  },
};

// Export everything
export * from '@testing-library/react';
export { customRender as render };
export { mockUser, mockAuthContextValue, mockToastContextValue };
