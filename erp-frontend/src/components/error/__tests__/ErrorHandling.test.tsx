import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GlobalErrorBoundary from '../GlobalErrorBoundary';
import ComponentErrorBoundary from '../ComponentErrorBoundary';
import { GracefulDegradation, DegradedFeature } from '../GracefulDegradation';
import { LoadingSpinner, MetricCardWithLoading } from '../../ui/LoadingStates';
import { ErrorAndLoadingProvider } from '../../../contexts/ErrorAndLoadingContext';

// Mock component that throws an error
const ErrorComponent: React.FC<{ shouldError: boolean }> = ({ shouldError }) => {
  if (shouldError) {
    throw new Error('Test error');
  }
  return <div data-testid="success">Success</div>;
};

// Mock icon component
const MockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <div className={className} data-testid="mock-icon">
    Icon
  </div>
);

describe('Error Handling Components', () => {
  describe('GlobalErrorBoundary', () => {
    it('should catch and display errors with recovery options', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <GlobalErrorBoundary>
          <ErrorComponent shouldError={true} />
        </GlobalErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Reload Page')).toBeInTheDocument();
      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Sign Out & Try Again')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should render children when no error occurs', () => {
      render(
        <GlobalErrorBoundary>
          <ErrorComponent shouldError={false} />
        </GlobalErrorBoundary>
      );

      expect(screen.getByTestId('success')).toBeInTheDocument();
    });
  });

  describe('ComponentErrorBoundary', () => {
    it('should catch component errors and show retry option', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ComponentErrorBoundary componentName="Test Component" showRetry={true}>
          <ErrorComponent shouldError={true} />
        </ComponentErrorBoundary>
      );

      expect(screen.getByText('Test Component Error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should use custom fallback when provided', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ComponentErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
          <ErrorComponent shouldError={true} />
        </ComponentErrorBoundary>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('GracefulDegradation', () => {
    it('should show children when online', () => {
      render(
        <GracefulDegradation isOnline={true}>
          <div data-testid="online-content">Online Content</div>
        </GracefulDegradation>
      );

      expect(screen.getByTestId('online-content')).toBeInTheDocument();
    });

    it('should show offline message when offline', () => {
      render(
        <GracefulDegradation isOnline={false}>
          <div data-testid="online-content">Online Content</div>
        </GracefulDegradation>
      );

      expect(screen.getByText("You're currently offline")).toBeInTheDocument();
      expect(screen.queryByTestId('online-content')).not.toBeInTheDocument();
    });

    it('should show custom fallback when offline', () => {
      render(
        <GracefulDegradation
          isOnline={false}
          showOfflineMessage={false}
          fallback={<div data-testid="custom-offline">Custom Offline</div>}
        >
          <div data-testid="online-content">Online Content</div>
        </GracefulDegradation>
      );

      expect(screen.getByTestId('custom-offline')).toBeInTheDocument();
      expect(screen.queryByTestId('online-content')).not.toBeInTheDocument();
    });
  });

  describe('DegradedFeature', () => {
    it('should show feature when available', () => {
      render(
        <DegradedFeature isAvailable={true}>
          <div data-testid="feature-content">Feature Content</div>
        </DegradedFeature>
      );

      expect(screen.getByTestId('feature-content')).toBeInTheDocument();
    });

    it('should show unavailable message when not available', () => {
      render(
        <DegradedFeature isAvailable={false} reason="Feature is down for maintenance">
          <div data-testid="feature-content">Feature Content</div>
        </DegradedFeature>
      );

      expect(screen.getByText('Feature Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Feature is down for maintenance')).toBeInTheDocument();
      expect(screen.queryByTestId('feature-content')).not.toBeInTheDocument();
    });
  });

  describe('Loading Components', () => {
    it('should render loading spinner with correct size', () => {
      const { container } = render(<LoadingSpinner size="lg" className="test-spinner" />);

      const spinner = container.querySelector('.test-spinner');
      expect(spinner).toHaveClass('w-8', 'h-8', 'animate-spin');
    });

    it('should render metric card with loading state', () => {
      render(<MetricCardWithLoading title="Test Metric" icon={MockIcon} isLoading={true} />);

      // Should show skeleton when loading (skeleton doesn't show title text)
      const skeletonElements = screen.getAllByRole('generic');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it('should render metric card with error state', () => {
      const retryFn = vi.fn();

      render(
        <MetricCardWithLoading
          title="Test Metric"
          icon={MockIcon}
          error="Failed to load"
          onRetry={retryFn}
        />
      );

      expect(screen.getByText('Failed to load')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Retry'));
      expect(retryFn).toHaveBeenCalled();
    });

    it('should render metric card with success state', () => {
      render(
        <MetricCardWithLoading
          title="Revenue"
          value="₦2,450,000"
          change={{ value: 12.5, type: 'increase' }}
          icon={MockIcon}
          isLoading={false}
        />
      );

      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('₦2,450,000')).toBeInTheDocument();
      expect(screen.getByText('+12.5%')).toBeInTheDocument();
    });
  });

  describe('ErrorAndLoadingProvider', () => {
    it('should provide error and loading context', () => {
      const TestComponent = () => {
        return <div data-testid="provider-test">Provider Test</div>;
      };

      render(
        <ErrorAndLoadingProvider>
          <TestComponent />
        </ErrorAndLoadingProvider>
      );

      expect(screen.getByTestId('provider-test')).toBeInTheDocument();
    });
  });
});

describe('Error Handling Integration', () => {
  it('should handle nested error boundaries correctly', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <GlobalErrorBoundary>
        <ComponentErrorBoundary componentName="Nested Component">
          <ErrorComponent shouldError={true} />
        </ComponentErrorBoundary>
      </GlobalErrorBoundary>
    );

    // Component error boundary should catch the error first
    expect(screen.getByText('Nested Component Error')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('should work with graceful degradation and error boundaries', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <GracefulDegradation isOnline={true}>
        <ComponentErrorBoundary componentName="Online Component">
          <ErrorComponent shouldError={true} />
        </ComponentErrorBoundary>
      </GracefulDegradation>
    );

    expect(screen.getByText('Online Component Error')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
