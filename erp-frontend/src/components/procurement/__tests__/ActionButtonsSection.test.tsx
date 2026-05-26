import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ActionButtonsSection, ActionButtonsSectionProps } from '../ActionButtonsSection';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Save: ({ size, className }: { size?: number; className?: string }) => (
    <div data-testid="save-icon" data-size={size} className={className}>
      Save
    </div>
  ),
  Send: ({ size, className }: { size?: number; className?: string }) => (
    <div data-testid="send-icon" data-size={size} className={className}>
      Send
    </div>
  ),
  Workflow: ({ size, className }: { size?: number; className?: string }) => (
    <div data-testid="workflow-icon" data-size={size} className={className}>
      Workflow
    </div>
  ),
  Loader2: ({ size, className }: { size?: number; className?: string }) => (
    <div data-testid="loader-icon" data-size={size} className={className}>
      Loading
    </div>
  ),
}));

describe('ActionButtonsSection', () => {
  const mockOnSaveAsDraft = vi.fn();
  const mockOnSubmitForApproval = vi.fn();
  const mockOnCreateWithWorkflow = vi.fn();

  const defaultProps: ActionButtonsSectionProps = {
    formValid: true,
    processing: false,
    submissionType: null,
    onSaveAsDraft: mockOnSaveAsDraft,
    onSubmitForApproval: mockOnSubmitForApproval,
    onCreateWithWorkflow: mockOnCreateWithWorkflow,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all three action buttons', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('action-button-draft')).toBeInTheDocument();
      expect(screen.getByTestId('action-button-manual')).toBeInTheDocument();
      expect(screen.getByTestId('action-button-workflow')).toBeInTheDocument();
    });

    it('renders correct button labels', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByText('Save as Draft')).toBeInTheDocument();
      expect(screen.getByText('Submit for Approval')).toBeInTheDocument();
      expect(screen.getByText('Create with Workflow')).toBeInTheDocument();
    });

    it('renders correct icons for each button', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('save-icon')).toBeInTheDocument();
      expect(screen.getByTestId('send-icon')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();
    });

    it('renders submission options heading', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByText('Submission Options')).toBeInTheDocument();
    });

    it('renders help text', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      const helpSection = screen.getByTestId('help-section');
      expect(helpSection).toBeInTheDocument();
      expect(helpSection).toHaveTextContent('Draft:');
      expect(helpSection).toHaveTextContent('Save without approval');
      expect(helpSection).toHaveTextContent('Manual:');
      expect(helpSection).toHaveTextContent('Traditional approval process');
      expect(helpSection).toHaveTextContent('Workflow:');
      expect(helpSection).toHaveTextContent('Automated routing');
    });
  });

  describe('Button States', () => {
    it('enables all buttons when form is valid and not processing', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('action-button-draft')).not.toBeDisabled();
      expect(screen.getByTestId('action-button-manual')).not.toBeDisabled();
      expect(screen.getByTestId('action-button-workflow')).not.toBeDisabled();
    });

    it('disables manual and workflow buttons when form is invalid', () => {
      render(<ActionButtonsSection {...defaultProps} formValid={false} />);

      expect(screen.getByTestId('action-button-draft')).not.toBeDisabled();
      expect(screen.getByTestId('action-button-manual')).toBeDisabled();
      expect(screen.getByTestId('action-button-workflow')).toBeDisabled();
    });

    it('disables all buttons when processing', () => {
      render(<ActionButtonsSection {...defaultProps} processing={true} />);

      expect(screen.getByTestId('action-button-draft')).toBeDisabled();
      expect(screen.getByTestId('action-button-manual')).toBeDisabled();
      expect(screen.getByTestId('action-button-workflow')).toBeDisabled();
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner for draft button when submissionType is draft', () => {
      render(<ActionButtonsSection {...defaultProps} processing={true} submissionType="draft" />);

      const draftButton = screen.getByTestId('action-button-draft');
      expect(draftButton).toContainElement(screen.getByTestId('loader-icon'));
      expect(draftButton).toHaveAttribute('aria-busy', 'true');
    });

    it('shows loading spinner for manual button when submissionType is manual', () => {
      render(<ActionButtonsSection {...defaultProps} processing={true} submissionType="manual" />);

      const manualButton = screen.getByTestId('action-button-manual');
      expect(manualButton).toContainElement(screen.getByTestId('loader-icon'));
      expect(manualButton).toHaveAttribute('aria-busy', 'true');
    });

    it('shows loading spinner for workflow button when submissionType is workflow', () => {
      render(
        <ActionButtonsSection {...defaultProps} processing={true} submissionType="workflow" />
      );

      const workflowButton = screen.getByTestId('action-button-workflow');
      expect(workflowButton).toContainElement(screen.getByTestId('loader-icon'));
      expect(workflowButton).toHaveAttribute('aria-busy', 'true');
    });

    it('does not show loading spinner when not processing', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      expect(screen.getByTestId('save-icon')).toBeInTheDocument();
      expect(screen.getByTestId('send-icon')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();
    });
  });

  describe('Click Handlers', () => {
    it('calls onSaveAsDraft when draft button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} />);

      await user.click(screen.getByTestId('action-button-draft'));

      expect(mockOnSaveAsDraft).toHaveBeenCalledTimes(1);
    });

    it('calls onSubmitForApproval when manual button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} />);

      await user.click(screen.getByTestId('action-button-manual'));

      expect(mockOnSubmitForApproval).toHaveBeenCalledTimes(1);
    });

    it('calls onCreateWithWorkflow when workflow button is clicked', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} />);

      await user.click(screen.getByTestId('action-button-workflow'));

      expect(mockOnCreateWithWorkflow).toHaveBeenCalledTimes(1);
    });

    it('does not call handlers when buttons are disabled', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} processing={true} />);

      await user.click(screen.getByTestId('action-button-draft'));
      await user.click(screen.getByTestId('action-button-manual'));
      await user.click(screen.getByTestId('action-button-workflow'));

      expect(mockOnSaveAsDraft).not.toHaveBeenCalled();
      expect(mockOnSubmitForApproval).not.toHaveBeenCalled();
      expect(mockOnCreateWithWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('handles Enter key press on draft button', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} />);

      const draftButton = screen.getByTestId('action-button-draft');
      draftButton.focus();
      await user.keyboard('{Enter}');

      expect(mockOnSaveAsDraft).toHaveBeenCalledTimes(1);
    });

    it('handles Space key press on manual button', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} />);

      const manualButton = screen.getByTestId('action-button-manual');
      manualButton.focus();
      await user.keyboard(' ');

      expect(mockOnSubmitForApproval).toHaveBeenCalledTimes(1);
    });

    it('does not handle keyboard events when disabled', async () => {
      const user = userEvent.setup();
      render(<ActionButtonsSection {...defaultProps} processing={true} />);

      const draftButton = screen.getByTestId('action-button-draft');
      draftButton.focus();
      await user.keyboard('{Enter}');

      expect(mockOnSaveAsDraft).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('action-button-draft')).toHaveAttribute(
        'aria-label',
        'Save requisition as draft without submitting for approval'
      );
      expect(screen.getByTestId('action-button-manual')).toHaveAttribute(
        'aria-label',
        'Submit requisition for manual approval process'
      );
      expect(screen.getByTestId('action-button-workflow')).toHaveAttribute(
        'aria-label',
        'Create requisition with automated workflow processing'
      );
    });

    it('has proper ARIA describedby attributes', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('action-button-draft')).toHaveAttribute(
        'aria-describedby',
        'draft-description'
      );
      expect(screen.getByTestId('action-button-manual')).toHaveAttribute(
        'aria-describedby',
        'manual-description'
      );
      expect(screen.getByTestId('action-button-workflow')).toHaveAttribute(
        'aria-describedby',
        'workflow-description'
      );
    });

    it('has proper role and aria-labelledby for the group', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      const group = screen.getByRole('group');
      expect(group).toHaveAttribute('aria-labelledby', 'action-buttons-heading');
    });

    it('sets aria-busy correctly during loading', () => {
      render(<ActionButtonsSection {...defaultProps} processing={true} submissionType="draft" />);

      expect(screen.getByTestId('action-button-draft')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('action-button-manual')).toHaveAttribute('aria-busy', 'false');
      expect(screen.getByTestId('action-button-workflow')).toHaveAttribute('aria-busy', 'false');
    });
  });

  describe('Visual Hierarchy', () => {
    it('applies correct CSS classes for different variants', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      expect(screen.getByTestId('action-button-draft')).toHaveClass(
        'action-button',
        'action-button-secondary'
      );
      expect(screen.getByTestId('action-button-manual')).toHaveClass(
        'action-button',
        'action-button-primary'
      );
      expect(screen.getByTestId('action-button-workflow')).toHaveClass(
        'action-button',
        'action-button-accent'
      );
    });

    it('maintains consistent button heights', () => {
      render(<ActionButtonsSection {...defaultProps} />);

      const buttons = [
        screen.getByTestId('action-button-draft'),
        screen.getByTestId('action-button-manual'),
        screen.getByTestId('action-button-workflow'),
      ];

      buttons.forEach(button => {
        expect(button).toHaveStyle('min-height: 44px');
      });
    });
  });

  describe('Error Handling', () => {
    it('handles async errors in click handlers gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Test error'));
      const user = userEvent.setup();

      render(<ActionButtonsSection {...defaultProps} onSaveAsDraft={errorHandler} />);

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await user.click(screen.getByTestId('action-button-draft'));
      } catch (error) {
        // Expected error, ignore it
      }

      expect(errorHandler).toHaveBeenCalledTimes(1);
      // Component should not crash
      expect(screen.getByTestId('action-button-draft')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
