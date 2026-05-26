import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RequisitionListPage from '../RequisitionListPage';
import { useToast } from '../../../hooks/useToast';
import { usePurchaseRequisitions, useDepartments } from '../../../hooks/useProcurement';

// Mock the hooks
jest.mock('../../../hooks/useToast');
jest.mock('../../../hooks/useProcurement');
jest.mock('../../../hooks/useAsyncOperation');

const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUsePurchaseRequisitions = usePurchaseRequisitions as jest.MockedFunction<
  typeof usePurchaseRequisitions
>;
const mockUseDepartments = useDepartments as jest.MockedFunction<typeof useDepartments>;

// Mock data
const mockRequisitions = [
  {
    id: 1,
    pr_number: 'PR-2026-001',
    requested_by: 1,
    requested_by_name: 'John Doe',
    department: 'IT Department',
    purpose: 'Office equipment for new employees',
    status: 'submitted',
    required_by_date: '2026-02-15',
    estimated_total: '5000.00',
    items: [
      {
        id: 1,
        description: 'Laptop computer',
        quantity: '10',
        estimated_unit_price: '500.00',
      },
    ],
    created_at: '2026-01-11T10:00:00Z',
    updated_at: '2026-01-11T10:00:00Z',
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    // Manual workflow requisition
    workflow_run_id: null,
    workflow_status: null,
  },
  {
    id: 2,
    pr_number: 'PR-2026-002',
    requested_by: 2,
    requested_by_name: 'Jane Smith',
    department: 'HR Department',
    purpose: 'Training materials',
    status: 'submitted',
    required_by_date: '2026-02-20',
    estimated_total: '2000.00',
    items: [
      {
        id: 2,
        description: 'Training books',
        quantity: '50',
        estimated_unit_price: '40.00',
      },
    ],
    created_at: '2026-01-11T11:00:00Z',
    updated_at: '2026-01-11T11:00:00Z',
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    // Automated workflow requisition
    workflow_run_id: 123,
    workflow_status: 'pending',
  },
  {
    id: 3,
    pr_number: 'PR-2026-003',
    requested_by: 1,
    requested_by_name: 'John Doe',
    department: 'IT Department',
    purpose: 'Server maintenance',
    status: 'approved',
    required_by_date: '2026-02-10',
    estimated_total: '10000.00',
    items: [
      {
        id: 3,
        description: 'Server parts',
        quantity: '5',
        estimated_unit_price: '2000.00',
      },
    ],
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-01-11T12:00:00Z',
    approved_by: 3,
    approved_by_name: 'Manager Smith',
    approved_at: '2026-01-11T12:00:00Z',
    // Automated workflow requisition - approved
    workflow_run_id: 124,
    workflow_status: 'approved',
  },
];

const mockDepartments = [
  { id: 1, name: 'IT Department', code: 'IT' },
  { id: 2, name: 'HR Department', code: 'HR' },
  { id: 3, name: 'Finance Department', code: 'FIN' },
];

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

describe('RequisitionListPage - Dual Workflow Enhancement', () => {
  beforeEach(() => {
    mockUseToast.mockReturnValue({
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
    });

    mockUsePurchaseRequisitions.mockReturnValue({
      data: { results: mockRequisitions, count: 3, next: null, previous: null },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    mockUseDepartments.mockReturnValue({
      data: { results: mockDepartments },
      isLoading: false,
      error: null,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Workflow Status Columns', () => {
    it('should display workflow status indicators for each requisition', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check that WorkflowStatusIndicator components are rendered
      expect(screen.getAllByTestId('workflow-status-indicator')).toHaveLength(3);
    });

    it('should show workflow run ID for automated workflow requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check for workflow run information
      expect(screen.getByText('Workflow Run: #123')).toBeInTheDocument();
      expect(screen.getByText('Workflow Run: #124')).toBeInTheDocument();
    });

    it('should display approval information for approved requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check for approval information
      expect(screen.getByText(/Approved by: Manager Smith/)).toBeInTheDocument();
    });
  });

  describe('Status Filters with Workflow-Specific Statuses', () => {
    it('should include workflow-specific status options in filter dropdown', () => {
      renderWithProviders(<RequisitionListPage />);

      const statusFilter = screen.getByDisplayValue('All Status');
      expect(statusFilter).toBeInTheDocument();

      // Check for workflow-specific status options
      expect(screen.getByText('Pending (Workflow)')).toBeInTheDocument();
      expect(screen.getByText('In Progress (Workflow)')).toBeInTheDocument();
      expect(screen.getByText('Under Review (Workflow)')).toBeInTheDocument();
      expect(screen.getByText('Completed (Workflow)')).toBeInTheDocument();
      expect(screen.getByText('Failed (Workflow)')).toBeInTheDocument();
    });

    it('should filter requisitions by workflow type', () => {
      renderWithProviders(<RequisitionListPage />);

      const workflowTypeFilter = screen.getByDisplayValue('All Types');

      // Filter to show only automated workflow requisitions
      fireEvent.change(workflowTypeFilter, { target: { value: 'workflow' } });

      // Should show only requisitions with workflow_run_id
      expect(screen.getByText('PR-2026-002')).toBeInTheDocument();
      expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      expect(screen.queryByText('PR-2026-001')).not.toBeInTheDocument();
    });

    it('should filter requisitions to show only manual process', () => {
      renderWithProviders(<RequisitionListPage />);

      const workflowTypeFilter = screen.getByDisplayValue('All Types');

      // Filter to show only manual process requisitions
      fireEvent.change(workflowTypeFilter, { target: { value: 'manual' } });

      // Should show only requisitions without workflow_run_id
      expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      expect(screen.queryByText('PR-2026-002')).not.toBeInTheDocument();
      expect(screen.queryByText('PR-2026-003')).not.toBeInTheDocument();
    });
  });

  describe('Visual Indicators for Workflow vs Manual', () => {
    it('should display workflow statistics summary', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check workflow statistics
      expect(screen.getByText('Total Requisitions')).toBeInTheDocument();
      expect(screen.getByText('Automated Workflow')).toBeInTheDocument();
      expect(screen.getByText('Manual Process')).toBeInTheDocument();
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();

      // Check counts
      expect(screen.getByText('3')).toBeInTheDocument(); // Total
      expect(screen.getByText('2')).toBeInTheDocument(); // Automated workflow
      expect(screen.getByText('1')).toBeInTheDocument(); // Manual process
    });

    it('should show different visual indicators for workflow vs manual requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Manual requisition should not have workflow run info
      const manualRequisition = screen.getByText('PR-2026-001').closest('div');
      expect(manualRequisition).not.toHaveTextContent('Workflow Run:');

      // Workflow requisitions should have workflow run info
      const workflowRequisition = screen.getByText('PR-2026-002').closest('div');
      expect(workflowRequisition).toHaveTextContent('Workflow Run: #123');
    });
  });

  describe('Workflow-Aware Action Buttons', () => {
    it('should show manual approval buttons for manual workflow requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Manual requisition (PR-2026-001) should have approve/reject buttons
      const manualCard = screen.getByText('PR-2026-001').closest('div');
      expect(manualCard).toHaveTextContent('Approve');
      expect(manualCard).toHaveTextContent('Reject');
    });

    it('should show workflow-specific action buttons for automated workflow requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Workflow requisition (PR-2026-002) should have "View in Approval Inbox" button
      const workflowCard = screen.getByText('PR-2026-002').closest('div');
      expect(workflowCard).toHaveTextContent('View in Approval Inbox');

      // Should not have manual approve/reject buttons
      expect(workflowCard).not.toHaveTextContent('Approve');
      expect(workflowCard).not.toHaveTextContent('Reject');
    });

    it('should show convert to PO button for approved requisitions regardless of workflow type', () => {
      renderWithProviders(<RequisitionListPage />);

      // Approved requisition (PR-2026-003) should have convert to PO button
      const approvedCard = screen.getByText('PR-2026-003').closest('div');
      expect(approvedCard).toHaveTextContent('Convert to PO');
    });

    it('should show workflow run information for workflow requisitions', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check for workflow run badges
      expect(screen.getByText('Run #123')).toBeInTheDocument();
      expect(screen.getByText('Run #124')).toBeInTheDocument();
    });
  });

  describe('Enhanced Requisition Information Display', () => {
    it('should display workflow status information', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check for workflow status display
      expect(screen.getByText(/Workflow Status: Pending/)).toBeInTheDocument();
      expect(screen.getByText(/Workflow Status: Approved/)).toBeInTheDocument();
    });

    it('should display correct field mappings for requisition data', () => {
      renderWithProviders(<RequisitionListPage />);

      // Check that purpose is displayed instead of title
      expect(screen.getByText('Office equipment for new employees')).toBeInTheDocument();
      expect(screen.getByText('Training materials')).toBeInTheDocument();
      expect(screen.getByText('Server maintenance')).toBeInTheDocument();

      // Check that required_by_date is displayed
      expect(screen.getByText(/Required By:/)).toBeInTheDocument();

      // Check that estimated_total is displayed correctly
      expect(screen.getByText('₦5,000')).toBeInTheDocument();
      expect(screen.getByText('₦2,000')).toBeInTheDocument();
      expect(screen.getByText('₦10,000')).toBeInTheDocument();
    });
  });

  describe('Filtering and Search Functionality', () => {
    it('should update statistics when filters are applied', async () => {
      renderWithProviders(<RequisitionListPage />);

      const workflowTypeFilter = screen.getByDisplayValue('All Types');

      // Filter to show only workflow requisitions
      fireEvent.change(workflowTypeFilter, { target: { value: 'workflow' } });

      await waitFor(() => {
        // Statistics should update to reflect filtered results
        const totalCount = screen
          .getByText('Total Requisitions')
          .parentElement?.querySelector('div');
        expect(totalCount).toHaveTextContent('2'); // Only workflow requisitions
      });
    });

    it('should maintain filter state when switching between filter options', () => {
      renderWithProviders(<RequisitionListPage />);

      const workflowTypeFilter = screen.getByDisplayValue('All Types');
      const statusFilter = screen.getByDisplayValue('All Status');

      // Apply workflow type filter
      fireEvent.change(workflowTypeFilter, { target: { value: 'workflow' } });
      expect(workflowTypeFilter).toHaveValue('workflow');

      // Apply status filter
      fireEvent.change(statusFilter, { target: { value: 'submitted' } });
      expect(statusFilter).toHaveValue('submitted');
      expect(workflowTypeFilter).toHaveValue('workflow'); // Should maintain previous filter
    });
  });
});
