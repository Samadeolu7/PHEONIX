import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HRIndexPage from '../pages/hr/HRIndexPage';
import ClockInOutWidget from '../components/hr/ClockInOutWidget';

// Mock the hooks
jest.mock('../hooks/useBonusDeductionRequests', () => ({
  usePendingBonusDeductionCount: () => ({ count: 5 }),
}));

jest.mock('../hooks/useClock', () => ({
  useCurrentAttendanceStatus: () => ({ data: null, isLoading: false }),
  useClockIn: () => ({ mutate: jest.fn(), isPending: false }),
  useClockOut: () => ({ mutate: jest.fn(), isPending: false }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Mobile HR Responsiveness', () => {
  beforeEach(() => {
    // Mock window.matchMedia for responsive tests
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  describe('HR Index Page Mobile Layout', () => {
    it('should render mobile-responsive stats grid', () => {
      render(
        <TestWrapper>
          <HRIndexPage />
        </TestWrapper>
      );

      // Check if the page renders without errors
      expect(screen.getByText('HR & Payroll Management')).toBeInTheDocument();
      expect(screen.getByText('Total Staff')).toBeInTheDocument();
      expect(screen.getByText('Pending Requests')).toBeInTheDocument();
    });

    it('should display pending requests badge', () => {
      render(
        <TestWrapper>
          <HRIndexPage />
        </TestWrapper>
      );

      // Should show the pending count from the mock
      expect(screen.getByText('5 pending')).toBeInTheDocument();
    });

    it('should render mobile-friendly module cards', () => {
      render(
        <TestWrapper>
          <HRIndexPage />
        </TestWrapper>
      );

      // Check for key HR modules
      expect(screen.getByText('HR Configuration')).toBeInTheDocument();
      expect(screen.getByText('Bonus & Deduction Requests')).toBeInTheDocument();
      expect(screen.getByText('Attendance Tracking')).toBeInTheDocument();
    });
  });

  describe('Clock In/Out Widget Mobile Layout', () => {
    it('should render mobile-optimized clock widget', () => {
      render(
        <TestWrapper>
          <ClockInOutWidget staffId={1} staffName="John Doe" />
        </TestWrapper>
      );

      expect(screen.getByText('Time Clock')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Currently Clocked Out')).toBeInTheDocument();
    });

    it('should have touch-friendly clock in button', () => {
      render(
        <TestWrapper>
          <ClockInOutWidget staffId={1} staffName="John Doe" />
        </TestWrapper>
      );

      const clockInButton = screen.getByRole('button', { name: /clock in/i });
      expect(clockInButton).toBeInTheDocument();
      expect(clockInButton).toHaveClass('w-full');
    });
  });

  describe('Mobile CSS Classes', () => {
    it('should apply mobile-responsive grid classes', () => {
      render(
        <TestWrapper>
          <HRIndexPage />
        </TestWrapper>
      );

      // Check if responsive grid classes are applied
      const statsGrid = screen.getByText('Total Staff').closest('.grid');
      expect(statsGrid).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
    });
  });

  describe('Touch Interactions', () => {
    it('should have minimum touch target sizes', () => {
      render(
        <TestWrapper>
          <ClockInOutWidget staffId={1} staffName="John Doe" />
        </TestWrapper>
      );

      const clockInButton = screen.getByRole('button', { name: /clock in/i });
      const styles = window.getComputedStyle(clockInButton);

      // Check if minimum height is set for touch targets
      expect(clockInButton.style.minHeight).toBe('48px');
    });
  });

  describe('Responsive Text and Spacing', () => {
    it('should use responsive text sizing', () => {
      render(
        <TestWrapper>
          <HRIndexPage />
        </TestWrapper>
      );

      const heading = screen.getByText('HR & Payroll Management');
      expect(heading).toHaveClass('text-xl', 'sm:text-2xl');
    });
  });
});
