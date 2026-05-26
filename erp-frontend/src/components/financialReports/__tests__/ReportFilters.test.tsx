import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportFilters from '../ReportFilters';
import { ReportFilters as ReportFiltersType } from '../../../types/financialReports';

describe('ReportFilters', () => {
  const mockOnFiltersChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders trial balance filters correctly', () => {
    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detail level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/include zero balances/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/as of date/i)).not.toBeInTheDocument();
  });

  it('renders profit & loss filters correctly', () => {
    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detail level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/comparative analysis/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/include zero balances/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/as of date/i)).not.toBeInTheDocument();
  });

  it('renders balance sheet filters correctly', () => {
    render(<ReportFilters reportType="balance-sheet" onFiltersChange={mockOnFiltersChange} />);

    expect(screen.getByLabelText(/as of date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detail level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/comparative analysis/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/start date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/end date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/include zero balances/i)).not.toBeInTheDocument();
  });

  it('shows required indicator for profit & loss start date', () => {
    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    const startDateLabel = screen.getByText(/start date/i);
    expect(startDateLabel).toHaveTextContent('*');
  });

  it('calls onFiltersChange when filters are updated', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    const detailLevelSelect = screen.getByLabelText(/detail level/i);
    await user.selectOptions(detailLevelSelect, 'detailed');

    await waitFor(
      () => {
        expect(mockOnFiltersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            detailLevel: 'detailed',
          })
        );
      },
      { timeout: 500 }
    );
  });

  it('debounces filter changes', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    const startDateInput = screen.getByLabelText(/start date/i);

    // Make multiple rapid changes
    await user.type(startDateInput, '2024-01-01');
    await user.clear(startDateInput);
    await user.type(startDateInput, '2024-01-15');

    // Should only call once after debounce delay
    await waitFor(
      () => {
        expect(mockOnFiltersChange).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 }
    );
  });

  it('shows comparative date field when comparative is enabled', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    expect(screen.queryByLabelText(/prior period start/i)).not.toBeInTheDocument();

    const comparativeCheckbox = screen.getByLabelText(/comparative analysis/i);
    await user.click(comparativeCheckbox);

    expect(screen.getByLabelText(/prior period start/i)).toBeInTheDocument();
  });

  it('resets filters when reset button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ReportFilters
        reportType="trial-balance"
        onFiltersChange={mockOnFiltersChange}
        initialFilters={{ detailLevel: 'detailed' }}
      />
    );

    const resetButton = screen.getByRole('button', { name: /reset filters/i });
    await user.click(resetButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({});
  });

  it('applies quick presets correctly', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    const currentYearButton = screen.getByRole('button', { name: /current year/i });
    await user.click(currentYearButton);

    const currentYear = new Date().getFullYear();
    const expectedStartDate = `${currentYear}-01-01`;
    const expectedEndDate = new Date().toISOString().split('T')[0];

    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        })
      );
    });
  });

  it('applies last month preset correctly', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    const lastMonthButton = screen.getByRole('button', { name: /last month/i });
    await user.click(lastMonthButton);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const expectedStartDate = lastMonth.toISOString().split('T')[0];
    const expectedEndDate = lastMonthEnd.toISOString().split('T')[0];

    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        })
      );
    });
  });

  it('applies last year preset correctly', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    const lastYearButton = screen.getByRole('button', { name: /last year/i });
    await user.click(lastYearButton);

    const lastYear = new Date().getFullYear() - 1;
    const expectedStartDate = `${lastYear}-01-01`;
    const expectedEndDate = `${lastYear}-12-31`;

    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        })
      );
    });
  });

  it('applies today preset for balance sheet', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="balance-sheet" onFiltersChange={mockOnFiltersChange} />);

    const todayButton = screen.getByRole('button', { name: /today/i });
    await user.click(todayButton);

    const expectedDate = new Date().toISOString().split('T')[0];

    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          asOfDate: expectedDate,
        })
      );
    });
  });

  it('disables inputs when loading', () => {
    render(
      <ReportFilters
        reportType="trial-balance"
        onFiltersChange={mockOnFiltersChange}
        loading={true}
      />
    );

    expect(screen.getByLabelText(/start date/i)).toBeDisabled();
    expect(screen.getByLabelText(/end date/i)).toBeDisabled();
    expect(screen.getByLabelText(/detail level/i)).toBeDisabled();
    expect(screen.getByLabelText(/include zero balances/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeDisabled();
  });

  it('populates initial filters correctly', () => {
    const initialFilters: ReportFiltersType = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      detailLevel: 'detailed',
      includeZeroBalances: true,
    };

    render(
      <ReportFilters
        reportType="trial-balance"
        onFiltersChange={mockOnFiltersChange}
        initialFilters={initialFilters}
      />
    );

    expect(screen.getByDisplayValue('2024-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-01-31')).toBeInTheDocument();
    expect(screen.getByDisplayValue('detailed')).toBeInTheDocument();
    expect(screen.getByLabelText(/include zero balances/i)).toBeChecked();
  });

  it('validates required fields for profit & loss', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    const startDateInput = screen.getByLabelText(/start date/i);
    expect(startDateInput).toHaveAttribute('required');
  });

  it('has proper accessibility attributes', () => {
    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    // Check for proper form role
    expect(screen.getByRole('form')).toBeInTheDocument();

    // Check for proper fieldset
    expect(screen.getByRole('group', { name: /quick presets/i })).toBeInTheDocument();

    // Check for proper labels
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detail level/i)).toBeInTheDocument();

    // Check for help text
    expect(screen.getByText(/choose the level of account detail/i)).toBeInTheDocument();
  });

  it('shows validation errors for invalid inputs', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="profit-loss" onFiltersChange={mockOnFiltersChange} />);

    const startDateInput = screen.getByLabelText(/start date/i);

    // Clear the required field
    await user.clear(startDateInput);
    await user.tab(); // Trigger validation

    await waitFor(() => {
      expect(screen.getByText(/start date is required/i)).toBeInTheDocument();
    });
  });

  it('handles keyboard navigation properly', async () => {
    const user = userEvent.setup();

    render(<ReportFilters reportType="trial-balance" onFiltersChange={mockOnFiltersChange} />);

    const startDateInput = screen.getByLabelText(/start date/i);
    const endDateInput = screen.getByLabelText(/end date/i);

    await user.click(startDateInput);
    await user.tab();

    expect(endDateInput).toHaveFocus();
  });
});
