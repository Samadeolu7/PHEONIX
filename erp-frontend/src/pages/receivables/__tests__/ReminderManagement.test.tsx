// src/pages/receivables/__tests__/ReminderManagement.test.tsx
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReminderManagement from '../ReminderManagement';
import { receivablesService } from '../../../services/receivablesService';
import { useToast } from '../../../hooks/useToast';

// Mock the services and hooks
vi.mock('../../../services/receivablesService');
vi.mock('../../../hooks/useToast');

const mockReceivablesService = receivablesService as any;
const mockUseToast = useToast as any;

// Mock data
const mockOverdueReceivables = [
  {
    id: 1,
    client_name: 'John Doe',
    reference_number: 'INV-20240201-001',
    balance: '150000',
    days_overdue: 15,
    last_reminder_sent: '2024-01-15',
    client: 1,
    receivable_type: 'invoice' as const,
    content_type: 1,
    content_type_name: 'Invoice',
    object_id: 1,
    original_amount: '150000',
    due_date: '2024-01-15',
    status: 'overdue' as const,
    aging_bucket: '1-30' as const,
    accrued_interest: '0',
    owner: 1,
    branch: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    client_name: 'Jane Smith',
    reference_number: 'INV-20240115-002',
    balance: '250000',
    days_overdue: 30,
    last_reminder_sent: null,
    client: 2,
    receivable_type: 'invoice' as const,
    content_type: 1,
    content_type_name: 'Invoice',
    object_id: 2,
    original_amount: '250000',
    due_date: '2024-01-01',
    status: 'overdue' as const,
    aging_bucket: '31-60' as const,
    accrued_interest: '0',
    owner: 1,
    branch: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ReminderManagement', () => {
  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);

    // Mock successful API responses
    mockReceivablesService.getReceivables.mockResolvedValue({
      results: mockOverdueReceivables,
      count: 2,
      next: null,
      previous: null,
    });

    mockReceivablesService.sendReminder.mockResolvedValue({
      id: 1,
      reminder_sent: true,
      last_reminder_sent: '2024-02-01',
      reminder_count: 1,
    } as any);
  });

  it('renders the reminder management page correctly', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    // Check if the main heading is present
    expect(screen.getByText('Reminder Management')).toBeInTheDocument();
    expect(
      screen.getByText('Configure automated reminders and manage reminder templates')
    ).toBeInTheDocument();

    // Check if tabs are present
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Send Reminders')).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('displays reminder settings by default', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Automated Reminder Settings')).toBeInTheDocument();
      expect(
        screen.getByText('Configure when and how reminders are automatically sent')
      ).toBeInTheDocument();
    });

    // Check for mock reminder settings
    expect(screen.getByText('First Reminder - 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Second Reminder - 30 Days')).toBeInTheDocument();
    expect(screen.getByText('Final Notice - 60 Days')).toBeInTheDocument();
  });

  it('switches to templates tab correctly', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Click on Templates tab
    fireEvent.click(screen.getByText('Templates'));

    await waitFor(() => {
      expect(screen.getByText('Reminder Templates')).toBeInTheDocument();
      expect(
        screen.getByText('Manage email templates for different reminder types')
      ).toBeInTheDocument();
    });

    // Check for mock templates
    expect(screen.getByText('First Reminder')).toBeInTheDocument();
    expect(screen.getByText('Second Reminder')).toBeInTheDocument();
    expect(screen.getByText('Final Notice')).toBeInTheDocument();
  });

  it('switches to history tab correctly', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Click on History tab
    fireEvent.click(screen.getByText('History'));

    await waitFor(() => {
      expect(screen.getByText('Reminder History')).toBeInTheDocument();
      expect(
        screen.getByText('Track all sent reminders and their delivery status')
      ).toBeInTheDocument();
    });

    // Check for table headers
    expect(screen.getByText('Receivable')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByText('Sent To')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('loads overdue receivables in send reminders tab', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Click on Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      expect(screen.getByText('Manual Reminder Sending')).toBeInTheDocument();
      expect(
        screen.getByText('Send reminders manually to selected overdue receivables')
      ).toBeInTheDocument();
    });

    // Wait for receivables to load
    await waitFor(() => {
      expect(mockReceivablesService.getReceivables).toHaveBeenCalledWith({
        status: 'overdue',
        ordering: '-days_overdue,-balance',
      });
    });

    // Check if overdue receivables are displayed
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('INV-20240201-001')).toBeInTheDocument();
      expect(screen.getByText('INV-20240115-002')).toBeInTheDocument();
    });
  });

  it('sends individual reminder successfully', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Switch to Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Find and click the Send button for the first receivable
    const sendButtons = screen.getAllByText('Send');
    fireEvent.click(sendButtons[0]);

    await waitFor(() => {
      expect(mockReceivablesService.sendReminder).toHaveBeenCalledWith(1, {
        reminder_type: 'email',
        template: 'first_reminder',
        custom_message: expect.any(String),
      });
      expect(mockToast.success).toHaveBeenCalledWith('Reminder sent successfully');
    });
  });

  it('handles bulk reminder sending', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Switch to Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Select all receivables
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    // Click bulk send button
    await waitFor(() => {
      const bulkSendButton = screen.getByText(/Send \d+ Reminders/);
      expect(bulkSendButton).toBeInTheDocument();
      fireEvent.click(bulkSendButton);
    });

    await waitFor(() => {
      expect(mockReceivablesService.sendReminder).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith('Sent 2 reminders successfully');
    });
  });

  it('handles API errors gracefully', async () => {
    mockReceivablesService.getReceivables.mockRejectedValue(new Error('API Error'));

    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load reminder data');
    });
  });

  it('handles send reminder errors', async () => {
    mockReceivablesService.sendReminder.mockRejectedValue(new Error('Send failed'));

    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Switch to Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Try to send reminder
    const sendButtons = screen.getAllByText('Send');
    fireEvent.click(sendButtons[0]);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to send reminder');
    });
  });

  it('navigates back to receivables correctly', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    const backButton = screen.getByText('Back to Receivables');
    expect(backButton).toBeInTheDocument();

    // Note: We can't test actual navigation in this test setup,
    // but we can verify the button exists and has the correct text
  });

  it('displays currency amounts correctly', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Switch to Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      // Check if currency formatting is applied (UGX format)
      expect(screen.getByText(/UGX\s*150,000/)).toBeInTheDocument();
      expect(screen.getByText(/UGX\s*250,000/)).toBeInTheDocument();
    });
  });

  it('shows correct aging badges', async () => {
    render(
      <TestWrapper>
        <ReminderManagement />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Switch to Send Reminders tab
    fireEvent.click(screen.getByText('Send Reminders'));

    await waitFor(() => {
      expect(screen.getByText('15 days')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
    });
  });
});
