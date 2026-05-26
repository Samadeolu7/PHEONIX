import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkflowStatusDisplay from '../WorkflowStatusDisplay';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock requisition data
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
  items: [],
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

describe('WorkflowStatusDisplay', () => {
  describe('Manual Process Display', () => {
    it('should display manual approval process information', () => {
      render(<WorkflowStatusDisplay requisition={mockManualRequisition} />);

      expect(screen.getByText('Manual Approval Process')).toBeInTheDocument();
      expect(screen.getByText('Submitted for manual approval')).toBeInTheDocument();
      expect(screen.getByText('Process Type')).toBeInTheDocument();
      expect(screen.getByText('Manual Approval')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
    });

    it('should not display workflow run ID for manual process', () => {
      render(<WorkflowStatusDisplay requisition={mockManualRequisition} />);

      expect(screen.queryByText('Workflow Run ID')).not.toBeInTheDocument();
      expect(screen.queryByText('View in Approval Inbox')).not.toBeInTheDocument();
    });

    it('should display last updated time', () => {
      render(<WorkflowStatusDisplay requisition={mockManualRequisition} />);

      expect(screen.getByText('Last Updated')).toBeInTheDocument();
      expect(screen.getByText(/Jan 11, 2026/)).toBeInTheDocument();
    });
  });

  describe('Automated Workflow Display', () => {
    it('should display automated workflow process information', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      expect(screen.getAllByText('Automated Workflow')).toHaveLength(2); // Title and process type
      expect(screen.getByText('Approved through automated workflow system')).toBeInTheDocument();
      expect(screen.getByText('Process Type')).toBeInTheDocument();
      expect(screen.getAllByText('Approved')).toHaveLength(2); // Status badge and progress
    });

    it('should display workflow run ID', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      expect(screen.getByText('Workflow Run ID')).toBeInTheDocument();
      expect(screen.getByText('WF-123456')).toBeInTheDocument();
    });

    it('should display approval inbox link', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      const approvalLink = screen.getByText('View in Approval Inbox');
      expect(approvalLink).toBeInTheDocument();
      expect(approvalLink.closest('a')).toHaveAttribute(
        'href',
        '/approvals/inbox?workflow_run_id=123456'
      );
    });

    it('should display workflow progress indicator', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      expect(screen.getByText('Workflow Progress')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getAllByText('Approved')).toHaveLength(2); // One in status badge, one in progress
    });
  });

  describe('Status Colors and Icons', () => {
    it('should display correct color for approved status', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      const statusBadges = screen.getAllByText('Approved');
      const mainStatusBadge = statusBadges[0].closest('div');
      expect(mainStatusBadge).toHaveStyle({ color: 'rgb(16, 185, 129)' });
    });

    it('should display correct color for submitted status', () => {
      render(<WorkflowStatusDisplay requisition={mockManualRequisition} />);

      const statusBadge = screen.getByText('Submitted').closest('div');
      expect(statusBadge).toHaveStyle({ color: 'rgb(245, 158, 11)' });
    });
  });

  describe('Different Status Types', () => {
    it('should handle draft status correctly', () => {
      const draftRequisition = { ...mockManualRequisition, status: 'draft' as const };
      render(<WorkflowStatusDisplay requisition={draftRequisition} />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Requisition is saved as draft')).toBeInTheDocument();
    });

    it('should handle rejected status correctly', () => {
      const rejectedRequisition = { ...mockManualRequisition, status: 'rejected' as const };
      render(<WorkflowStatusDisplay requisition={rejectedRequisition} />);

      expect(screen.getByText('Rejected')).toBeInTheDocument();
      expect(screen.getByText('Rejected during manual review')).toBeInTheDocument();
    });

    it('should handle po_created status correctly', () => {
      const poCreatedRequisition = { ...mockManualRequisition, status: 'po_created' as const };
      render(<WorkflowStatusDisplay requisition={poCreatedRequisition} />);

      expect(screen.getByText('Po created')).toBeInTheDocument();
      expect(screen.getByText('Purchase order created successfully')).toBeInTheDocument();
    });
  });

  describe('Workflow Progress Steps', () => {
    it('should show correct progress for submitted workflow', () => {
      const submittedWorkflow = {
        ...mockWorkflowRequisition,
        status: 'submitted' as const,
        workflow_status: 'submitted',
      };
      render(<WorkflowStatusDisplay requisition={submittedWorkflow} />);

      // Check that submitted step is active (should have checkmark or be highlighted)
      const progressSection = screen.getByText('Workflow Progress').closest('div');
      expect(progressSection).toBeInTheDocument();
    });

    it('should show correct progress for approved workflow', () => {
      render(<WorkflowStatusDisplay requisition={mockWorkflowRequisition} />);

      // Check that approved step is completed (should have checkmark)
      const progressSection = screen.getByText('Workflow Progress').closest('div');
      expect(progressSection).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <WorkflowStatusDisplay requisition={mockManualRequisition} className="custom-class" />
      );

      expect(container.querySelector('.workflow-status-display.custom-class')).toBeInTheDocument();
    });
  });
});
