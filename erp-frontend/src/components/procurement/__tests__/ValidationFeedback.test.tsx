import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ValidationFeedback,
  FieldValidation,
  SubmissionTypeIndicators,
} from '../ValidationFeedback';
import { ValidationState } from '../../../utils/EnhancedFormValidator';

// Mock validation state for testing
const mockValidationState: ValidationState = {
  isValid: false,
  errors: {
    department_id: 'Department is required',
    'items.0.quantity': 'Quantity must be greater than 0',
  },
  canSubmitAsDraft: true,
  canSubmitForApproval: false,
  canCreateWithWorkflow: false,
  submissionTypeErrors: {
    draft: [],
    manual: ['Department is required', 'At least one item is required'],
    workflow: [
      'Department is required for workflow submissions',
      'Workflow requires detailed justification (minimum 20 characters)',
    ],
  },
};

const validValidationState: ValidationState = {
  isValid: true,
  errors: {},
  canSubmitAsDraft: true,
  canSubmitForApproval: true,
  canCreateWithWorkflow: true,
  submissionTypeErrors: {
    draft: [],
    manual: [],
    workflow: [],
  },
};

describe('ValidationFeedback Components', () => {
  describe('FieldValidation', () => {
    it('should display field error when touched and has error', () => {
      render(
        <FieldValidation fieldName="department_id" error="Department is required" touched={true} />
      );

      expect(screen.getByText('Department is required')).toBeInTheDocument();
      // Check for SVG element instead of role="img"
      expect(screen.getByText('Department is required').previousElementSibling).toBeInTheDocument();
    });

    it('should not display error when not touched', () => {
      render(
        <FieldValidation fieldName="department_id" error="Department is required" touched={false} />
      );

      expect(screen.queryByText('Department is required')).not.toBeInTheDocument();
    });

    it('should display submission type hints when enabled', () => {
      render(
        <FieldValidation
          fieldName="department_id"
          error="Department is required"
          touched={true}
          validationState={mockValidationState}
          showSubmissionTypeHints={true}
        />
      );

      expect(screen.getByText('Department is required')).toBeInTheDocument();
      // Should show submission type specific hints
      expect(screen.getByText(/manual:/i)).toBeInTheDocument();
      expect(screen.getByText(/workflow:/i)).toBeInTheDocument();
    });

    it('should not display submission type hints when disabled', () => {
      render(
        <FieldValidation
          fieldName="department_id"
          error="Department is required"
          touched={true}
          validationState={mockValidationState}
          showSubmissionTypeHints={false}
        />
      );

      expect(screen.getByText('Department is required')).toBeInTheDocument();
      expect(screen.queryByText(/manual:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/workflow:/i)).not.toBeInTheDocument();
    });
  });

  describe('SubmissionTypeIndicators', () => {
    it('should display all submission types with correct availability', () => {
      render(<SubmissionTypeIndicators validationState={mockValidationState} />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();

      // Check descriptions instead of "Available/Not available" text
      expect(screen.getByText('Save without approval')).toBeInTheDocument();
      expect(screen.getByText('Traditional approval process')).toBeInTheDocument();
      expect(screen.getByText('Automated routing')).toBeInTheDocument();
    });

    it('should display compact version when requested', () => {
      render(<SubmissionTypeIndicators validationState={mockValidationState} compact={true} />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();

      // Compact version should not show descriptions
      expect(screen.queryByText('Save without approval')).not.toBeInTheDocument();
    });

    it('should show error counts for unavailable submission types', () => {
      render(<SubmissionTypeIndicators validationState={mockValidationState} />);

      // Should show error counts for manual and workflow
      expect(screen.getAllByText('2 errors')).toHaveLength(2); // Both Manual and Workflow have 2 errors
    });

    it('should display all green when validation state is valid', () => {
      render(<SubmissionTypeIndicators validationState={validValidationState} />);

      // All should show green checkmarks (no error counts)
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();
      expect(screen.queryByText(/error/)).not.toBeInTheDocument();
    });
  });

  describe('ValidationFeedback', () => {
    it('should display field-specific validation feedback', () => {
      render(
        <ValidationFeedback
          validationState={mockValidationState}
          fieldName="department_id"
          variant="inline"
        />
      );

      expect(screen.getByText('Department is required')).toBeInTheDocument();
    });

    it('should display submission type specific errors', () => {
      render(
        <ValidationFeedback
          validationState={mockValidationState}
          submissionType="manual"
          variant="card"
        />
      );

      expect(screen.getByText(/Cannot submit for approval/)).toBeInTheDocument();
      expect(screen.getAllByText('Department is required')).toHaveLength(2); // One in general errors, one in submission errors
      expect(screen.getByText('At least one item is required')).toBeInTheDocument();
    });

    it('should display submission type indicators when requested', () => {
      render(
        <ValidationFeedback
          validationState={mockValidationState}
          showSubmissionTypeIndicators={true}
          variant="card"
        />
      );

      expect(screen.getByText('Submission Options')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();
    });

    it('should not render when no errors and indicators disabled', () => {
      const { container } = render(
        <ValidationFeedback
          validationState={validValidationState}
          showSubmissionTypeIndicators={false}
          variant="inline"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should apply correct variant styles', () => {
      const { rerender } = render(
        <ValidationFeedback
          validationState={mockValidationState}
          variant="card"
          fieldName="department_id"
        />
      );

      expect(
        screen.getByText('Department is required').closest('.validation-feedback')
      ).toHaveClass('validation-feedback-card');

      rerender(
        <ValidationFeedback
          validationState={mockValidationState}
          variant="inline"
          fieldName="department_id"
        />
      );

      expect(
        screen.getByText('Department is required').closest('.validation-feedback')
      ).toHaveClass('validation-feedback-inline');
    });

    it('should handle different sizes correctly', () => {
      const { rerender } = render(
        <ValidationFeedback
          validationState={mockValidationState}
          size="sm"
          fieldName="department_id"
        />
      );

      let feedbackElement = screen
        .getByText('Department is required')
        .closest('.validation-feedback');
      expect(feedbackElement).toHaveStyle({ fontSize: '11px' });

      rerender(
        <ValidationFeedback
          validationState={mockValidationState}
          size="lg"
          fieldName="department_id"
        />
      );

      feedbackElement = screen.getByText('Department is required').closest('.validation-feedback');
      expect(feedbackElement).toHaveStyle({ fontSize: '14px' });
    });
  });

  describe('Integration Tests', () => {
    it('should work together to provide comprehensive validation feedback', () => {
      render(
        <div>
          <ValidationFeedback
            validationState={mockValidationState}
            showSubmissionTypeIndicators={true}
            variant="card"
          />
          <FieldValidation
            fieldName="department_id"
            error="Department is required"
            touched={true}
            validationState={mockValidationState}
            showSubmissionTypeHints={true}
          />
        </div>
      );

      // Should show overall submission indicators
      expect(screen.getByText('Submission Options')).toBeInTheDocument();

      // Should show field-specific error
      expect(screen.getAllByText('Department is required')).toHaveLength(3); // Once in general, once in submission errors, once in field-specific

      // Should show submission type hints
      expect(screen.getByText(/manual:/i)).toBeInTheDocument();
      expect(screen.getByText(/workflow:/i)).toBeInTheDocument();
    });

    it('should handle empty validation state gracefully', () => {
      const emptyValidationState: ValidationState = {
        isValid: true,
        errors: {},
        canSubmitAsDraft: true,
        canSubmitForApproval: true,
        canCreateWithWorkflow: true,
        submissionTypeErrors: {
          draft: [],
          manual: [],
          workflow: [],
        },
      };

      const { container } = render(
        <ValidationFeedback
          validationState={emptyValidationState}
          showSubmissionTypeIndicators={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should update when validation state changes', () => {
      const { rerender } = render(
        <ValidationFeedback
          validationState={mockValidationState}
          showSubmissionTypeIndicators={true}
        />
      );

      // Should show error counts for invalid states
      expect(screen.getAllByText('2 errors')).toHaveLength(2);

      rerender(
        <ValidationFeedback
          validationState={validValidationState}
          showSubmissionTypeIndicators={true}
        />
      );

      // Should not show any error counts when valid
      expect(screen.queryByText(/error/)).not.toBeInTheDocument();
    });
  });
});
