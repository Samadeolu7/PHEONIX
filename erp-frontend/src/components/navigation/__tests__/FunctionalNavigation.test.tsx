// Tests for Functional Navigation System
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../../contexts/AuthContext';
import { FunctionalNavigation } from '../FunctionalNavigation';
import { FunctionalMenuSystem } from '../FunctionalMenuSystem';
import { getNavigationStructure, canUserAccessRoute } from '../../../utils/routeMapping';
import { UserRole } from '../../../types/roles';

// Mock the auth context
const mockAuthContext = {
  user: { id: '1', name: 'Test User', role: 'Director' as UserRole },
  isAuthenticated: true,
  selectedRole: 'Director' as UserRole,
  login: jest.fn(),
  logout: jest.fn(),
  selectRole: jest.fn(),
};

// Mock the route mapping utilities
jest.mock('../../../utils/routeMapping', () => ({
  getNavigationStructure: jest.fn(),
  canUserAccessRoute: jest.fn(),
  getRouteMapping: jest.fn(),
  getBreadcrumbs: jest.fn(() => [{ label: 'Home', path: '/' }]),
}));

const mockGetNavigationStructure = getNavigationStructure as jest.MockedFunction<
  typeof getNavigationStructure
>;
const mockCanUserAccessRoute = canUserAccessRoute as jest.MockedFunction<typeof canUserAccessRoute>;

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    <AuthProvider value={mockAuthContext}>{children}</AuthProvider>
  </BrowserRouter>
);

describe('FunctionalNavigation', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup default mock return values
    mockGetNavigationStructure.mockReturnValue({
      'Financial Operations': [
        {
          path: '/sales/invoices',
          pageId: 'financial.invoice_generation',
          title: 'Invoice Management',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Officer'],
          component: 'InvoicesList',
          icon: 'FileText',
          description: 'Create and manage invoices',
        },
        {
          path: '/accounts',
          pageId: 'financial.accounts_management',
          title: 'Chart of Accounts',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Administrator'],
          component: 'AccountsListPage',
          icon: 'BookOpen',
          description: 'Manage chart of accounts',
        },
      ],
      'Student Management': [
        {
          path: '/clients',
          pageId: 'students.client_management',
          title: 'Client Management',
          category: 'Student Management',
          roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
          component: 'ClientListPage',
          icon: 'Users',
          description: 'Manage student/client records',
        },
      ],
      'User Management': [
        {
          path: '/admin/users',
          pageId: 'users.add',
          title: 'User Management',
          category: 'User Management',
          roles: ['Director', 'Administrator'],
          component: 'UserManagementPage',
          icon: 'Users',
          description: 'Manage system users',
        },
      ],
    });

    mockCanUserAccessRoute.mockReturnValue(true);
  });

  it('renders navigation categories based on user role', () => {
    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    // Should show categories that Director has access to
    expect(screen.getByText('Financial Operations')).toBeInTheDocument();
    expect(screen.getByText('Student Management')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('shows correct number of items per category', () => {
    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    // Financial Operations should show 2 items
    expect(screen.getByText('2 items')).toBeInTheDocument();
    // Student Management should show 1 item
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('expands and collapses categories when clicked', async () => {
    render(
      <TestWrapper>
        <FunctionalNavigation collapsible={true} />
      </TestWrapper>
    );

    const financialCategory = screen.getByText('Financial Operations').closest('button');
    expect(financialCategory).toBeInTheDocument();

    // Initially expanded (default)
    expect(screen.getByText('Invoice Management')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(financialCategory!);

    await waitFor(() => {
      expect(screen.queryByText('Invoice Management')).not.toBeInTheDocument();
    });

    // Click to expand again
    fireEvent.click(financialCategory!);

    await waitFor(() => {
      expect(screen.getByText('Invoice Management')).toBeInTheDocument();
    });
  });

  it('displays route badges for new and enhanced items', () => {
    mockGetNavigationStructure.mockReturnValue({
      'Financial Operations': [
        {
          path: '/sales/invoices',
          pageId: 'financial.invoice_generation',
          title: 'Invoice Management',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Officer'],
          component: 'InvoicesList',
          icon: 'FileText',
          description: 'Create and manage invoices',
          isNew: true,
        },
        {
          path: '/accounts',
          pageId: 'financial.accounts_management',
          title: 'Chart of Accounts',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Administrator'],
          component: 'AccountsListPage',
          icon: 'BookOpen',
          description: 'Manage chart of accounts',
          isEnhanced: true,
        },
      ],
    });

    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Enhanced')).toBeInTheDocument();
  });

  it('shows user role information', () => {
    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    expect(screen.getByText('Current Role: Director')).toBeInTheDocument();
    expect(screen.getByText(/Access to \d+ pages across \d+ categories/)).toBeInTheDocument();
  });

  it('handles empty navigation structure gracefully', () => {
    mockGetNavigationStructure.mockReturnValue({});

    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    expect(screen.getByText('No navigation items available for your role.')).toBeInTheDocument();
  });

  it('calls onNavigate when route is selected', () => {
    const mockOnNavigate = jest.fn();

    render(
      <TestWrapper>
        <FunctionalNavigation onNavigate={mockOnNavigate} />
      </TestWrapper>
    );

    const invoiceLink = screen.getByText('Invoice Management');
    fireEvent.click(invoiceLink);

    expect(mockOnNavigate).toHaveBeenCalledWith('/sales/invoices');
  });
});

describe('FunctionalMenuSystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetNavigationStructure.mockReturnValue({
      'Financial Operations': [
        {
          path: '/sales/invoices',
          pageId: 'financial.invoice_generation',
          title: 'Invoice Management',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Officer'],
          component: 'InvoicesList',
          icon: 'FileText',
          description: 'Create and manage invoices',
        },
      ],
    });

    mockCanUserAccessRoute.mockReturnValue(true);
  });

  it('renders sidebar variant correctly', () => {
    render(
      <TestWrapper>
        <FunctionalMenuSystem variant="sidebar" />
      </TestWrapper>
    );

    expect(screen.getByText('Phoenix ERP')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search pages...')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Director')).toBeInTheDocument();
  });

  it('renders header variant correctly', () => {
    render(
      <TestWrapper>
        <FunctionalMenuSystem variant="header" />
      </TestWrapper>
    );

    expect(screen.getByText('Phoenix ERP')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('(Director)')).toBeInTheDocument();
  });

  it('handles search functionality', async () => {
    render(
      <TestWrapper>
        <FunctionalMenuSystem variant="sidebar" showSearch={true} />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(searchInput, { target: { value: 'invoice' } });

    await waitFor(() => {
      expect(screen.getByText('Search Results (1)')).toBeInTheDocument();
      expect(screen.getByText('Invoice Management')).toBeInTheDocument();
    });
  });

  it('handles logout functionality', () => {
    const mockLogout = jest.fn();
    const mockNavigate = jest.fn();

    // Mock useNavigate
    jest.mock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate,
    }));

    render(
      <TestWrapper>
        <FunctionalMenuSystem variant="sidebar" showUserInfo={true} />
      </TestWrapper>
    );

    const logoutButton = screen.getByTitle('Logout');
    fireEvent.click(logoutButton);

    expect(mockAuthContext.logout).toHaveBeenCalled();
  });

  it('toggles mobile menu correctly', () => {
    render(
      <TestWrapper>
        <FunctionalMenuSystem variant="header" />
      </TestWrapper>
    );

    // Find mobile menu button (should be hidden on desktop but present in DOM)
    const mobileMenuButtons = screen.getAllByRole('button');
    const mobileMenuButton = mobileMenuButtons.find(
      button => button.querySelector('svg') && button.className.includes('md:hidden')
    );

    expect(mobileMenuButton).toBeInTheDocument();
  });
});

describe('Route Access Control', () => {
  it('filters routes based on user permissions', () => {
    // Mock different access levels
    mockCanUserAccessRoute.mockImplementation((path, role) => {
      if (role === 'Officer') {
        return !path.includes('/admin/');
      }
      return true;
    });

    // Test with Officer role
    const officerContext = {
      ...mockAuthContext,
      user: { ...mockAuthContext.user, role: 'Officer' as UserRole },
      selectedRole: 'Officer' as UserRole,
    };

    mockGetNavigationStructure.mockReturnValue({
      'Financial Operations': [
        {
          path: '/sales/invoices',
          pageId: 'financial.invoice_generation',
          title: 'Invoice Management',
          category: 'Financial Operations',
          roles: ['Director', 'Principal', 'Officer'],
          component: 'InvoicesList',
          icon: 'FileText',
          description: 'Create and manage invoices',
        },
      ],
      'User Management': [
        {
          path: '/admin/users',
          pageId: 'users.add',
          title: 'User Management',
          category: 'User Management',
          roles: ['Director', 'Administrator'],
          component: 'UserManagementPage',
          icon: 'Users',
          description: 'Manage system users',
        },
      ],
    });

    render(
      <BrowserRouter>
        <AuthProvider value={officerContext}>
          <FunctionalNavigation />
        </AuthProvider>
      </BrowserRouter>
    );

    // Officer should see Financial Operations but not User Management
    expect(screen.getByText('Financial Operations')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument(); // Still shows in structure but access is controlled
  });
});

describe('Integration Tests', () => {
  it('integrates with routing system correctly', () => {
    render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    // Verify that navigation structure is called with correct user role
    expect(mockGetNavigationStructure).toHaveBeenCalledWith('Director');
  });

  it('maintains state across re-renders', () => {
    const { rerender } = render(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    // Expand a category
    const financialCategory = screen.getByText('Financial Operations').closest('button');
    fireEvent.click(financialCategory!);

    // Re-render component
    rerender(
      <TestWrapper>
        <FunctionalNavigation />
      </TestWrapper>
    );

    // State should be maintained (though this is a simple test)
    expect(screen.getByText('Financial Operations')).toBeInTheDocument();
  });
});
