// src/components/incomes/__tests__/AccessControlChecker.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import AccessControlChecker from '../AccessControlChecker';
import { entitlementService } from '../../../services/entitlementService';

// Mock the entitlement service
vi.mock('../../../services/entitlementService', () => ({
  entitlementService: {
    checkServiceAccess: vi.fn(),
  },
}));

const mockEntitlementService = vi.mocked(entitlementService);

describe('AccessControlChecker', () => {
  const defaultProps = {
    entitlementId: 1,
    serviceCode: 'exam_access',
    serviceName: 'Exam Access',
  };

  const mockAccessGranted = {
    can_access: true,
    reason: undefined,
    payment_percentage: 100,
    amount_paid: '250000.00',
    balance: '0.00',
    current_access_level: 'full' as const,
    allowed_services: ['classes', 'library', 'exams'],
    restricted_services: [],
  };

  const mockAccessDenied = {
    can_access: false,
    reason: 'Service requires 80% payment',
    payment_percentage: 50,
    amount_paid: '125000.00',
    balance: '125000.00',
    current_access_level: 'partial' as const,
    allowed_services: ['classes', 'library'],
    restricted_services: ['exams', 'graduation'],
  };

  const mockAccessNone = {
    can_access: false,
    reason: 'Payment required for service access',
    payment_percentage: 0,
    amount_paid: '0.00',
    balance: '250000.00',
    current_access_level: 'none' as const,
    allowed_services: [],
    restricted_services: ['classes', 'library', 'exams', 'graduation'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      mockEntitlementService.checkServiceAccess.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<AccessControlChecker {...defaultProps} />);

      expect(screen.getByText('Checking service access...')).toBeInTheDocument();
      expect(screen.getByRole('generic', { name: /loading/i })).toBeInTheDocument();
    });
  });

  describe('Access Granted State', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessGranted);
    });

    it('should display access granted status', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Exam Access')).toBeInTheDocument();
        expect(screen.getByText('Access Granted')).toBeInTheDocument();
      });

      // Check for green checkmark icon
      const checkIcon =
        screen.getByTestId('check-circle-icon') ||
        document.querySelector('[data-lucide="check-circle"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('should show 100% payment status', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('100.0% paid')).toBeInTheDocument();
        expect(screen.getByText(/Paid: ₦250,000.00/)).toBeInTheDocument();
        expect(screen.getByText(/Balance: ₦0.00/)).toBeInTheDocument();
      });
    });

    it('should display allowed services', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Available Services')).toBeInTheDocument();
        expect(screen.getByText('classes')).toBeInTheDocument();
        expect(screen.getByText('library')).toBeInTheDocument();
        expect(screen.getByText('exams')).toBeInTheDocument();
      });
    });

    it('should not show action buttons when access is granted', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText('Make Payment')).not.toBeInTheDocument();
        expect(screen.queryByText('View Options')).not.toBeInTheDocument();
      });
    });
  });

  describe('Access Denied State', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessDenied);
    });

    it('should display access denied status', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Exam Access')).toBeInTheDocument();
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      // Check for red X icon
      const xIcon =
        screen.getByTestId('x-circle-icon') || document.querySelector('[data-lucide="x-circle"]');
      expect(xIcon).toBeInTheDocument();
    });

    it('should show partial payment status', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('50.0% paid')).toBeInTheDocument();
        expect(screen.getByText(/Paid: ₦125,000.00/)).toBeInTheDocument();
        expect(screen.getByText(/Balance: ₦125,000.00/)).toBeInTheDocument();
      });
    });

    it('should display access restriction reason', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Access Restriction')).toBeInTheDocument();
        expect(screen.getByText('Service requires 80% payment')).toBeInTheDocument();
      });
    });

    it('should display both allowed and restricted services', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Available Services')).toBeInTheDocument();
        expect(screen.getByText('classes')).toBeInTheDocument();
        expect(screen.getByText('library')).toBeInTheDocument();

        expect(screen.getByText('Restricted Services')).toBeInTheDocument();
        expect(screen.getByText('exams')).toBeInTheDocument();
        expect(screen.getByText('graduation')).toBeInTheDocument();
      });
    });

    it('should show action buttons when access is denied', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Make Payment')).toBeInTheDocument();
        expect(screen.getByText('View Options')).toBeInTheDocument();
      });
    });
  });

  describe('No Access State', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessNone);
    });

    it('should show zero payment status', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('0.0% paid')).toBeInTheDocument();
        expect(screen.getByText(/Paid: ₦0.00/)).toBeInTheDocument();
        expect(screen.getByText(/Balance: ₦250,000.00/)).toBeInTheDocument();
      });
    });

    it('should show only restricted services', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Restricted Services')).toBeInTheDocument();
        expect(screen.queryByText('Available Services')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API call fails', async () => {
      const errorMessage = 'Network error occurred';
      mockEntitlementService.checkServiceAccess.mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Access Check Failed')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should show generic error message when no specific error is provided', async () => {
      mockEntitlementService.checkServiceAccess.mockRejectedValue(new Error());

      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to check service access')).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      mockEntitlementService.checkServiceAccess
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockAccessGranted);

      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to check service access')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByRole('button');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Access Granted')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessGranted);
    });

    it('should refresh access status when refresh button is clicked', async () => {
      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Access Granted')).toBeInTheDocument();
      });

      expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(1);

      // Click refresh button
      const refreshButton = screen.getByTitle('Refresh access status');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(2);
      });
    });

    it('should auto-refresh when autoRefresh is enabled', async () => {
      vi.useFakeTimers();

      render(<AccessControlChecker {...defaultProps} autoRefresh={true} refreshInterval={5000} />);

      await waitFor(() => {
        expect(screen.getByText('Access Granted')).toBeInTheDocument();
      });

      expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(1);

      // Fast-forward time
      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });
  });

  describe('Callback Functions', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessDenied);
    });

    it('should call onPaymentRequired when Make Payment button is clicked', async () => {
      const onPaymentRequired = vi.fn();

      render(<AccessControlChecker {...defaultProps} onPaymentRequired={onPaymentRequired} />);

      await waitFor(() => {
        expect(screen.getByText('Make Payment')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Make Payment'));

      expect(onPaymentRequired).toHaveBeenCalledWith(1, '125000.00');
    });

    it('should call onUpgradeRequired when View Options button is clicked', async () => {
      const onUpgradeRequired = vi.fn();

      render(<AccessControlChecker {...defaultProps} onUpgradeRequired={onUpgradeRequired} />);

      await waitFor(() => {
        expect(screen.getByText('View Options')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Options'));

      expect(onUpgradeRequired).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            type: 'payment',
            title: 'Make Payment',
            amount: '125000.00',
          }),
          expect.objectContaining({
            type: 'upgrade_plan',
            title: 'Upgrade Access Level',
          }),
        ])
      );
    });
  });

  describe('Configuration Options', () => {
    beforeEach(() => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessGranted);
    });

    it('should hide details when showDetails is false', async () => {
      render(<AccessControlChecker {...defaultProps} showDetails={false} />);

      await waitFor(() => {
        expect(screen.getByText('Access Granted')).toBeInTheDocument();
      });

      expect(screen.queryByText('Payment Status')).not.toBeInTheDocument();
      expect(screen.queryByText('Service Access')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const customClass = 'custom-access-checker';
      render(<AccessControlChecker {...defaultProps} className={customClass} />);

      const container = document.querySelector(`.${customClass}`);
      expect(container).toBeInTheDocument();
    });
  });

  describe('API Integration', () => {
    it('should call checkServiceAccess with correct parameters', async () => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessGranted);

      render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledWith(1, 'exam_access');
      });
    });

    it('should update when entitlementId or serviceCode changes', async () => {
      mockEntitlementService.checkServiceAccess.mockResolvedValue(mockAccessGranted);

      const { rerender } = render(<AccessControlChecker {...defaultProps} />);

      await waitFor(() => {
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(1);
      });

      // Change entitlementId
      rerender(<AccessControlChecker {...defaultProps} entitlementId={2} />);

      await waitFor(() => {
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenCalledTimes(2);
        expect(mockEntitlementService.checkServiceAccess).toHaveBeenLastCalledWith(
          2,
          'exam_access'
        );
      });
    });
  });
});
