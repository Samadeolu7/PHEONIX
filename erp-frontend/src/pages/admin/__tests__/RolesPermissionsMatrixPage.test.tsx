import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../contexts/AuthContext';
import { RolesPermissionsMatrixPage } from '../RolesPermissionsMatrixPage';

// Mock the auth context to provide Director role
const mockAuthContext = {
  selectedRole: 'Director' as const,
  userWithRole: {
    id: 1,
    username: 'director',
    email: 'director@test.com',
    first_name: 'Test',
    last_name: 'Director',
    tenant_id: 1,
    tenant_name: 'Test Tenant',
    is_owner: true,
    is_staff: true,
    is_system_admin: true,
    is_active_user: true,
    branch_id: 1,
    roles: ['Director'],
    selectedRole: 'Director' as const,
  },
  login: jest.fn(),
  logout: jest.fn(),
  setSelectedRole: jest.fn(),
  isAuthenticated: true,
  isLoading: false,
  error: null,
};

jest.mock('../../../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => mockAuthContext,
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RolesPermissionsMatrixPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the roles permissions matrix page for Directors', async () => {
    render(
      <TestWrapper>
        <RolesPermissionsMatrixPage />
      </TestWrapper>
    );

    // Check if the main title is rendered
    expect(screen.getByText('Roles & Permissions Matrix')).toBeInTheDocument();
    expect(
      screen.getByText('Manage page access permissions for each user role')
    ).toBeInTheDocument();

    // Check if role statistics are displayed
    expect(screen.getByText('Director')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(screen.getByText('Officer')).toBeInTheDocument();

    // Check if the Phoenix Software Access Table is displayed
    expect(screen.getByText('Phoenix Software Access Table')).toBeInTheDocument();

    // Check if functional categories are displayed
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Financial Operations')).toBeInTheDocument();
    expect(screen.getByText('Student Management')).toBeInTheDocument();
    expect(screen.getByText('Reports & Analytics')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('System Administration')).toBeInTheDocument();
  });

  it('shows save and reset buttons for Directors', () => {
    render(
      <TestWrapper>
        <RolesPermissionsMatrixPage />
      </TestWrapper>
    );

    expect(screen.getByText('Reset')).toBeInTheDocument();
    expect(screen.getByText(/Save Changes/)).toBeInTheDocument();
  });

  it('allows toggling permissions when user is Director', async () => {
    render(
      <TestWrapper>
        <RolesPermissionsMatrixPage />
      </TestWrapper>
    );

    // Find a permission toggle button (there should be many)
    const permissionButtons = screen.getAllByRole('button');
    const toggleButtons = permissionButtons.filter(button =>
      button.getAttribute('title')?.includes('access for')
    );

    expect(toggleButtons.length).toBeGreaterThan(0);

    // Click on the first toggle button
    if (toggleButtons.length > 0) {
      fireEvent.click(toggleButtons[0]);

      // Should show pending changes
      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeInTheDocument();
      });
    }
  });

  it('shows legend with permission indicators', () => {
    render(
      <TestWrapper>
        <RolesPermissionsMatrixPage />
      </TestWrapper>
    );

    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Has Access')).toBeInTheDocument();
    expect(screen.getByText('No Access')).toBeInTheDocument();
    expect(screen.getByText('Pending Change')).toBeInTheDocument();
  });

  it('allows expanding and collapsing categories', () => {
    render(
      <TestWrapper>
        <RolesPermissionsMatrixPage />
      </TestWrapper>
    );

    // Find category toggle buttons
    const categoryButtons = screen.getAllByRole('button');
    const userManagementButton = categoryButtons.find(button =>
      button.textContent?.includes('User Management')
    );

    expect(userManagementButton).toBeInTheDocument();

    if (userManagementButton) {
      // Click to collapse
      fireEvent.click(userManagementButton);

      // Click to expand again
      fireEvent.click(userManagementButton);
    }
  });
});

// Test for non-Director users
describe('RolesPermissionsMatrixPage - Non-Director Access', () => {
  const mockNonDirectorContext = {
    ...mockAuthContext,
    selectedRole: 'Officer' as const,
    userWithRole: {
      ...mockAuthContext.userWithRole,
      selectedRole: 'Officer' as const,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock useAuth to return Officer role
    jest.doMock('../../../contexts/AuthContext', () => ({
      AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      useAuth: () => mockNonDirectorContext,
    }));
  });

  it('shows access restricted message for non-Directors', () => {
    // Re-import with mocked context
    const { RolesPermissionsMatrixPage: RestrictedPage } = require('../RolesPermissionsMatrixPage');

    render(
      <TestWrapper>
        <RestrictedPage />
      </TestWrapper>
    );

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(
      screen.getByText('Only Directors can access the Roles & Permissions Matrix.')
    ).toBeInTheDocument();
  });
});
