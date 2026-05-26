import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DataConsistencyChecker } from '../DataConsistencyChecker';
import { dataConsistencyService } from '../../../services/dataConsistencyService';

// Mock the service
jest.mock('../../../services/dataConsistencyService');
const mockDataConsistencyService = dataConsistencyService as jest.Mocked<
  typeof dataConsistencyService
>;

describe('DataConsistencyChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders initial state correctly', () => {
    render(<DataConsistencyChecker />);

    expect(screen.getByText('Data Consistency Checker')).toBeInTheDocument();
    expect(
      screen.getByText('Monitor and resolve invoice-receivable synchronization issues')
    ).toBeInTheDocument();
    expect(screen.getByText('Run Data Consistency Check')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run check/i })).toBeInTheDocument();
  });

  it('runs consistency check when button is clicked', async () => {
    const mockReport = {
      id: 'test-report',
      generated_at: new Date().toISOString(),
      total_invoices: 100,
      total_receivables: 98,
      issues_found: 2,
      critical_issues: 1,
      warning_issues: 1,
      info_issues: 0,
      issues: [
        {
          id: 'issue-1',
          type: 'missing_receivable' as const,
          severity: 'critical' as const,
          invoice_id: 123,
          invoice_number: 'INV-001',
          description: 'Test issue',
          suggested_action: 'Fix it',
        },
      ],
      summary: {
        sync_status: 'critical_issues' as const,
        last_check: new Date().toISOString(),
        next_recommended_check: new Date().toISOString(),
      },
    };

    mockDataConsistencyService.runConsistencyCheck.mockResolvedValue(mockReport);

    render(<DataConsistencyChecker />);

    const runButton = screen.getByRole('button', { name: /run check/i });
    fireEvent.click(runButton);

    expect(screen.getByText('Checking...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument(); // Total invoices
      expect(screen.getByText('98')).toBeInTheDocument(); // Total receivables
      expect(screen.getByText('2')).toBeInTheDocument(); // Issues found
    });

    expect(mockDataConsistencyService.runConsistencyCheck).toHaveBeenCalledTimes(1);
  });

  it('displays no issues state when report has no issues', async () => {
    const mockReport = {
      id: 'test-report',
      generated_at: new Date().toISOString(),
      total_invoices: 100,
      total_receivables: 100,
      issues_found: 0,
      critical_issues: 0,
      warning_issues: 0,
      info_issues: 0,
      issues: [],
      summary: {
        sync_status: 'healthy' as const,
        last_check: new Date().toISOString(),
        next_recommended_check: new Date().toISOString(),
      },
    };

    mockDataConsistencyService.runConsistencyCheck.mockResolvedValue(mockReport);

    render(<DataConsistencyChecker />);

    const runButton = screen.getByRole('button', { name: /run check/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText('All Systems Synchronized')).toBeInTheDocument();
      expect(
        screen.getByText(
          'No data consistency issues found. Invoice and receivable records are properly synchronized.'
        )
      ).toBeInTheDocument();
    });
  });

  it('handles errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDataConsistencyService.runConsistencyCheck.mockRejectedValue(new Error('API Error'));

    render(<DataConsistencyChecker />);

    const runButton = screen.getByRole('button', { name: /run check/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /run check/i })).toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error running consistency check:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});
