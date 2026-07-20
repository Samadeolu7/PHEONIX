import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RequisitionDetailPage from '../RequisitionDetailPage';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock the hooks
vi.mock('../../../hooks/useProcurement', () => ({
  usePurchaseRequisition: vi.fn(),
  useSubmitRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useApproveRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRejectRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useConvertRequisitionToPOWithDetails: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeletePurchaseRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCompareQuotes: vi.fn(() => ({ data: null, isLoading: false })),
  useConvertQuoteToPO: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useVerifyRequisitionInvoice: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  procurementKeys: {
    requisitions: () => [],
    requisitionsDetail: (id) => ['procurement', 'requisitions', 'detail', id],
    purchaseOrders: () => [],
  },
  quotesKeys: {
    quotes: () => [],
    quotesComparison: (id) => ['procurement', 'quotes', 'comparison', id],
  },
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
  };
});

const mockManualRequisition: PurchaseRequisition = {
  id: 1,
  pr_number: 'PR-2026-001',
  requested_by: 1,
  requested_by_name: 'John Doe',
  department: 'IT Department',
  required_by_date: '2026-02-15',
  purpose: 'Office equipment for new employees',
  status: 'submitted',
  approved_by: null,
  approved_by_name: null,
  approved_at: null,
  estimated_total: '50000.00',
  items: [
    {
      id: 1,
      description: 'Laptop computer',
      quantity: '10',
      estimated_unit_price: '5000.00',
      item_name: 'Dell Laptop',
      item_sku: 'DELL-001',
      total_price: '50000.00',
    },
  ],
  created_at: '2026-01-11T10:00:00Z',
  updated_at: '2026-01-11T10:30:00Z',
};

const mockWorkflowRequisition: PurchaseRequisition = {
  ...mockManualRequisition,
  id: 2,
  pr_number: 'PR-2026-002',
  status: 'approved',
  workflow_run_id: 123456,
  workflow_status: 'approved',
  updated_at: '2026-01-11T11:00:00Z',
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RequisitionDetailPage Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Manual Process Display', () => {
    it('should display manual workflow status for manual requisitions', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: mockManualRequisition,
        isLoading: false,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      // Check that manual workflow status is displayed
      expect(screen.getByText('Manual Approval Process')).toBeInTheDocument();
      expect(screen.getByText('Submitted for manual approval')).toBeInTheDocument();
      expect(screen.getByText('Manual Approval')).toBeInTheDocument();

      // Should not show workflow-specific elements
      expect(screen.queryByText('Workflow Run ID')).not.toBeInTheDocument();
      expect(screen.queryByText('View in Approval Inbox')).not.toBeInTheDocument();
    });
  });

  describe('Automated Workflow Display', () => {
    it('should display automated workflow status for workflow requisitions', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: mockWorkflowRequisition,
        isLoading: false,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      // Check that automated workflow status is displayed
      expect(screen.getAllByText('Automated Workflow')).toHaveLength(2); // Title and process type
      expect(screen.getByText('Approved through automated workflow system')).toBeInTheDocument();

      // Should show workflow-specific elements
      expect(screen.getByText('Workflow Run ID')).toBeInTheDocument();
      expect(screen.getByText('WF-123456')).toBeInTheDocument();
      expect(screen.getByText('View in Approval Inbox')).toBeInTheDocument();

      // Check approval inbox link
      const approvalLink = screen.getByText('View in Approval Inbox');
      expect(approvalLink.closest('a')).toHaveAttribute(
        'href',
        '/approvals/inbox?workflow_run_id=123456'
      );
    });

    it('should display workflow progress indicator', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: mockWorkflowRequisition,
        isLoading: false,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      // Check workflow progress elements
      expect(screen.getByText('Workflow Progress')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(2); // Status badge and progress
    });
  });

  describe('Status Indicators', () => {
    it('should show correct status colors and icons', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: mockWorkflowRequisition,
        isLoading: false,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      // Check that status badges exist and are properly rendered
      const statusBadges = screen.getAllByText('Approved');
      expect(statusBadges.length).toBeGreaterThanOrEqual(1);

      // Check that the main status badge has proper styling attributes
      const mainStatusBadge = statusBadges[0].closest('div');
      expect(mainStatusBadge).toHaveAttribute('style');
    });
  });

  describe('Requisition Information Display', () => {
    it('should display all requisition information alongside workflow status', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: mockWorkflowRequisition,
        isLoading: false,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      // Check that basic requisition info is still displayed
      expect(screen.getByText('PR-2026-002')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('IT Department')).toBeInTheDocument();
      expect(screen.getByText('Office equipment for new employees')).toBeInTheDocument();

      // Check that workflow status is also displayed
      expect(screen.getAllByText('Automated Workflow')).toHaveLength(2);
      expect(screen.getByText('WF-123456')).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    it('should handle loading state', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      renderWithProviders(<RequisitionDetailPage />);

      expect(screen.getByText('Loading requisition details...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      const { usePurchaseRequisition } = await import('../../../hooks/useProcurement');
      vi.mocked(usePurchaseRequisition).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to load'),
      });

      renderWithProviders(<RequisitionDetailPage />);

      expect(screen.getByText('Error Loading Requisition')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to load requisition details. Please try again.')
      ).toBeInTheDocument();
    });
  });
});
