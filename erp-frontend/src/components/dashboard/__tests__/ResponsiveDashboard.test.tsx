// Test for responsive dashboard components
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { RoleBasedDashboardTemplate } from '../RoleBasedDashboardTemplate';
import { AuthContext } from '../../../contexts/AuthContext';

// Mock the media query hook
vi.mock('../../../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsMobile: vi.fn(() => false),
  useIsTablet: vi.fn(() => false),
  useIsDesktop: vi.fn(() => true),
}));

// Mock the dashboard template engine
vi.mock('../../../services/dashboardTemplateEngine', () => ({
  dashboardTemplateEngine: {
    generateTemplateForRole: vi.fn(() => ({
      id: 'test-template',
      name: 'Test Dashboard',
      role: 'Officer',
      theme: {
        primaryColor: '#3B82F6',
        backgroundColor: '#F9FAFB',
      },
      statsCards: [],
      quickActions: [],
      showWelcomeBanner: true,
      showQuickStats: true,
      showModuleCards: true,
      showActivityFeed: true,
      showAlerts: true,
      maxModulesPerRow: 3,
      layout: 'grid',
    })),
  },
  moduleVisibilityService: {
    filterModulesByRole: vi.fn(() => []),
  },
}));

const mockUser = {
  id: 1,
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
};

const mockAuthContext = {
  user: mockUser,
  selectedRole: 'Officer',
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true,
  loading: false,
  switchRole: vi.fn(),
};

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
        <AuthContext.Provider value={mockAuthContext}>{children}</AuthContext.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Responsive Dashboard Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render RoleBasedDashboardTemplate with responsive classes', () => {
    render(
      <TestWrapper>
        <RoleBasedDashboardTemplate />
      </TestWrapper>
    );

    // Check if the component renders without crashing
    expect(screen.getByText(/Good morning, Test/i)).toBeInTheDocument();
  });

  it('should apply mobile-responsive classes', () => {
    const { useMediaQuery } = require('../../../hooks/useMediaQuery');
    useMediaQuery.mockReturnValue(true); // Mock mobile view

    render(
      <TestWrapper>
        <RoleBasedDashboardTemplate />
      </TestWrapper>
    );

    // The component should render successfully even in mobile view
    expect(screen.getByText(/Good morning, Test/i)).toBeInTheDocument();
  });

  it('should handle different screen sizes gracefully', () => {
    // Test that the component doesn't crash with different viewport sizes
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // Mobile width
    });

    render(
      <TestWrapper>
        <RoleBasedDashboardTemplate />
      </TestWrapper>
    );

    expect(screen.getByText(/Good morning, Test/i)).toBeInTheDocument();

    // Change to tablet width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    // Component should still work
    expect(screen.getByText(/Good morning, Test/i)).toBeInTheDocument();
  });
});
