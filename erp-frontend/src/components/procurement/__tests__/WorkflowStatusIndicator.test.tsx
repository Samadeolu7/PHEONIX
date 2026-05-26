import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkflowStatusIndicator from '../WorkflowStatusIndicator';

describe('WorkflowStatusIndicator', () => {
  describe('Manual Process Indicator', () => {
    it('should display manual process indicator', () => {
      render(<WorkflowStatusIndicator status="submitted" />);

      expect(screen.getByText('Submitted')).toBeInTheDocument();
      // Should not show workflow run ID for manual process
      expect(screen.queryByText(/#\d+/)).not.toBeInTheDocument();
    });

    it('should display correct status colors for manual process', () => {
      const { rerender } = render(<WorkflowStatusIndicator status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="approved" />);
      expect(screen.getByText('Approved')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="rejected" />);
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
  });

  describe('Workflow Process Indicator', () => {
    it('should display workflow process indicator with run ID', () => {
      render(
        <WorkflowStatusIndicator
          status="approved"
          workflowRunId={123456}
          workflowStatus="approved"
        />
      );

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('#123456')).toBeInTheDocument();
    });

    it('should use workflow status over regular status when provided', () => {
      render(
        <WorkflowStatusIndicator
          status="submitted"
          workflowRunId={123456}
          workflowStatus="in_progress"
        />
      );

      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render small size correctly', () => {
      render(<WorkflowStatusIndicator status="approved" workflowRunId={123456} size="small" />);

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();
      // Small size should not show workflow run ID
      expect(screen.queryByText('#123456')).not.toBeInTheDocument();
    });

    it('should render medium size correctly', () => {
      render(<WorkflowStatusIndicator status="approved" workflowRunId={123456} size="medium" />);

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('#123456')).toBeInTheDocument();
    });

    it('should render large size correctly', () => {
      render(<WorkflowStatusIndicator status="approved" workflowRunId={123456} size="large" />);

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('#123456')).toBeInTheDocument();
    });
  });

  describe('Label Display', () => {
    it('should show label when showLabel is true', () => {
      render(<WorkflowStatusIndicator status="approved" showLabel={true} />);

      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('should hide label when showLabel is false', () => {
      render(<WorkflowStatusIndicator status="approved" showLabel={false} />);

      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    });
  });

  describe('Status Label Formatting', () => {
    it('should format status labels correctly', () => {
      const { rerender } = render(<WorkflowStatusIndicator status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="submitted" />);
      expect(screen.getByText('Submitted')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="in_progress" />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="under_review" />);
      expect(screen.getByText('Under Review')).toBeInTheDocument();

      rerender(<WorkflowStatusIndicator status="po_created" />);
      expect(screen.getByText('PO Created')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <WorkflowStatusIndicator status="approved" className="custom-indicator" />
      );

      expect(
        container.querySelector('.workflow-status-indicator.custom-indicator')
      ).toBeInTheDocument();
    });
  });

  describe('Process Type Detection', () => {
    it('should detect manual process when no workflow run ID', () => {
      render(<WorkflowStatusIndicator status="submitted" size="small" />);

      expect(screen.getByText('Manual')).toBeInTheDocument();
    });

    it('should detect workflow process when workflow run ID is provided', () => {
      render(<WorkflowStatusIndicator status="submitted" workflowRunId={123456} size="small" />);

      expect(screen.getByText('Workflow')).toBeInTheDocument();
    });

    it('should not detect workflow process when workflow run ID is 0', () => {
      render(<WorkflowStatusIndicator status="submitted" workflowRunId={0} size="small" />);

      expect(screen.getByText('Manual')).toBeInTheDocument();
    });
  });
});
