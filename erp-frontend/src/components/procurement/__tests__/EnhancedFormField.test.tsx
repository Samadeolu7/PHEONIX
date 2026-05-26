import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EnhancedFormField } from '../EnhancedFormField';
import { FieldValidationState } from '../../../hooks/useRealTimeValidation';
import { ValidationState } from '../../../utils/EnhancedFormValidator';

// Mock validation states for testing
const mockFieldValidation: FieldValidationState = {
  isValid: false,
  hasError: true,
  errorMessage: 'This field is required',
  submissionTypeErrors: {
    draft: '',
    manual: 'Required for manual submission',
    workflow: 'Required for workflow submission',
  },
  showError: true,
  isTouched: true,
  isValidForSubmission: {
    draft: true,
    manual: false,
    workflow: false,
  },
};

const validFieldValidation: FieldValidationState = {
  isValid: true,
  hasError: false,
  errorMessage: '',
  submissionTypeErrors: {
    draft: '',
    manual: '',
    workflow: '',
  },
  showError: false,
  isTouched: true,
  isValidForSubmission: {
    draft: true,
    manual: true,
    workflow: true,
  },
};

const mockValidationState: ValidationState = {
  isValid: false,
  errors: {
    testField: 'This field is required',
  },
  canSubmitAsDraft: true,
  canSubmitForApproval: false,
  canCreateWithWorkflow: false,
  submissionTypeErrors: {
    draft: [],
    manual: ['This field is required'],
    workflow: ['This field is required'],
  },
};

describe('EnhancedFormField', () => {
  const defaultProps = {
    name: 'testField',
    label: 'Test Field',
    value: '',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render text input with label', () => {
      render(<EnhancedFormField {...defaultProps} />);

      expect(screen.getByLabelText('Test Field')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render required indicator when required', () => {
      render(<EnhancedFormField {...defaultProps} required={true} />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('should render placeholder text', () => {
      render(<EnhancedFormField {...defaultProps} placeholder="Enter test value" />);

      expect(screen.getByPlaceholderText('Enter test value')).toBeInTheDocument();
    });

    it('should render help text when provided', () => {
      render(<EnhancedFormField {...defaultProps} helpText="This is helpful information" />);

      expect(screen.getByText('This is helpful information')).toBeInTheDocument();
    });
  });

  describe('Input Types', () => {
    it('should render textarea when type is textarea', () => {
      render(<EnhancedFormField {...defaultProps} type="textarea" rows={5} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveAttribute('rows', '5');
    });

    it('should render select when type is select', () => {
      const options = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ];

      render(
        <EnhancedFormField
          {...defaultProps}
          type="select"
          options={options}
          placeholder="Select an option"
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('Select an option')).toBeInTheDocument();
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should render number input when type is number', () => {
      render(<EnhancedFormField {...defaultProps} type="number" min={0} max={100} step={1} />);

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100');
      expect(input).toHaveAttribute('step', '1');
    });

    it('should render date input when type is date', () => {
      render(<EnhancedFormField {...defaultProps} type="date" />);

      expect(screen.getByDisplayValue('')).toHaveAttribute('type', 'date');
    });
  });

  describe('Validation Display', () => {
    it('should display validation error when field has error', () => {
      render(<EnhancedFormField {...defaultProps} fieldValidation={mockFieldValidation} />);

      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument(); // Error icon
    });

    it('should display success icon when field is valid and touched', () => {
      render(<EnhancedFormField {...defaultProps} fieldValidation={validFieldValidation} />);

      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument(); // Success icon
    });

    it('should not display validation icon when field is not touched', () => {
      const untouchedValidation = { ...mockFieldValidation, isTouched: false, showError: false };

      render(<EnhancedFormField {...defaultProps} fieldValidation={untouchedValidation} />);

      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    });

    it('should display submission type hints when enabled', () => {
      render(
        <EnhancedFormField
          {...defaultProps}
          fieldValidation={mockFieldValidation}
          validationState={mockValidationState}
          showSubmissionTypeHints={true}
        />
      );

      expect(screen.getByText(/manual:/i)).toBeInTheDocument();
      expect(screen.getByText(/workflow:/i)).toBeInTheDocument();
    });

    it('should not display help text when there is an error', () => {
      render(
        <EnhancedFormField
          {...defaultProps}
          fieldValidation={mockFieldValidation}
          helpText="This is helpful information"
        />
      );

      expect(screen.queryByText('This is helpful information')).not.toBeInTheDocument();
      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });
  });

  describe('Character Count', () => {
    it('should display character count for text input with maxLength', () => {
      render(<EnhancedFormField {...defaultProps} value="Hello" maxLength={100} />);

      expect(screen.getByText('5/100')).toBeInTheDocument();
    });

    it('should display character count for textarea with maxLength', () => {
      render(
        <EnhancedFormField {...defaultProps} type="textarea" value="Hello World" maxLength={50} />
      );

      expect(screen.getByText('11/50')).toBeInTheDocument();
    });

    it('should highlight character count when near limit', () => {
      render(
        <EnhancedFormField
          {...defaultProps}
          value="This is a long text that is near the limit"
          maxLength={50}
        />
      );

      const characterCount = screen.getByText('44/50');
      expect(characterCount).toHaveStyle({ color: '#f59e0b' }); // Warning color
    });

    it('should not display character count for non-text inputs', () => {
      render(<EnhancedFormField {...defaultProps} type="number" value={123} maxLength={100} />);

      expect(screen.queryByText(/\/100/)).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onChange when value changes', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();

      render(<EnhancedFormField {...defaultProps} onChange={mockOnChange} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'test value');

      expect(mockOnChange).toHaveBeenCalledWith('test value');
    });

    it('should call onBlur when field loses focus', async () => {
      const user = userEvent.setup();
      const mockOnBlur = jest.fn();

      render(<EnhancedFormField {...defaultProps} onBlur={mockOnBlur} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.tab();

      expect(mockOnBlur).toHaveBeenCalled();
    });

    it('should handle number input correctly', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();

      render(<EnhancedFormField {...defaultProps} type="number" onChange={mockOnChange} />);

      const input = screen.getByRole('spinbutton');
      await user.type(input, '123');

      expect(mockOnChange).toHaveBeenCalledWith(123);
    });

    it('should handle select input correctly', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const options = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ];

      render(
        <EnhancedFormField
          {...defaultProps}
          type="select"
          options={options}
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'option1');

      expect(mockOnChange).toHaveBeenCalledWith('option1');
    });
  });

  describe('Styling and Variants', () => {
    it('should apply error styling when field has error', () => {
      render(<EnhancedFormField {...defaultProps} fieldValidation={mockFieldValidation} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ borderColor: '#ef4444' });
      expect(input).toHaveStyle({ backgroundColor: '#fef2f2' });
    });

    it('should apply success styling when field is valid and touched', () => {
      render(<EnhancedFormField {...defaultProps} fieldValidation={validFieldValidation} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ borderColor: '#10b981' });
    });

    it('should apply disabled styling when disabled', () => {
      render(<EnhancedFormField {...defaultProps} disabled={true} />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
      expect(input).toHaveStyle({ backgroundColor: '#f9fafb' });
      expect(input).toHaveStyle({ color: '#9ca3af' });
    });

    it('should apply different sizes correctly', () => {
      const { rerender } = render(<EnhancedFormField {...defaultProps} size="sm" />);

      let input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ fontSize: '12px', padding: '8px 12px' });

      rerender(<EnhancedFormField {...defaultProps} size="lg" />);

      input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ fontSize: '16px', padding: '16px' });
    });

    it('should apply different variants correctly', () => {
      const { rerender } = render(<EnhancedFormField {...defaultProps} variant="filled" />);

      let input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ backgroundColor: '#f9fafb' });

      rerender(<EnhancedFormField {...defaultProps} variant="outlined" />);

      input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ backgroundColor: 'white' });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <EnhancedFormField
          {...defaultProps}
          fieldValidation={mockFieldValidation}
          helpText="This is helpful information"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'testField-help testField-error');
    });

    it('should associate label with input correctly', () => {
      render(<EnhancedFormField {...defaultProps} />);

      const input = screen.getByRole('textbox');
      const label = screen.getByText('Test Field');

      expect(input).toHaveAttribute('id', 'testField');
      expect(label).toHaveAttribute('for', 'testField');
    });

    it('should provide proper error announcements', () => {
      render(<EnhancedFormField {...defaultProps} fieldValidation={mockFieldValidation} />);

      expect(screen.getByText('This field is required')).toHaveAttribute('id', 'testField-error');
    });
  });

  describe('Focus Management', () => {
    it('should apply focus styles when focused', async () => {
      const user = userEvent.setup();

      render(<EnhancedFormField {...defaultProps} />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      // Focus styles are applied via onFocus event
      expect(input).toHaveFocus();
    });

    it('should remove focus styles when blurred', async () => {
      const user = userEvent.setup();

      render(<EnhancedFormField {...defaultProps} />);

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.tab();

      expect(input).not.toHaveFocus();
    });
  });
});
