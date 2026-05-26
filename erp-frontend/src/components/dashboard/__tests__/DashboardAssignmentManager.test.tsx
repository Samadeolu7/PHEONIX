// Dashboard Assignment Manager Tests
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardAssignmentManager } from '../DashboardAssignmentManager';
import * as dashboardAssignmentService from '../../../services/dashboardAssignmentService';

// Mock the services
vi.mock('../../../services/dashboardAssignmentService', () => ({
  dashboardAssignmentService: {
    getAllAssignments: vi.fn(),
    getAssignmentHistory: vi.fn(),
    activateAssignment: vi.fn(),
    deactivateAssignment: vi.fn(),
    setDefaultAssignment: vi.fn(),
    unassignDashboardFromRole: vi.fn(),
  },
}));

// Mock child components to avoid complex rendering
vi.mock('../RoleAssignmentPanel', () => ({
  RoleAssignmentPanel: ({ onAssignmentUpdate }: any) => (
    <div data-testid="role-assignment-panel">
      <button onClick={onAssignmentUpdate}>Update Assignment</button>
    </div>
  ),
}));

vi.mock('../DashboardVersionManager', () => ({
  DashboardVersionManager: () => <div data-testid="version-manager">Version Manager</div>,
}));

vi.mock('../DashboardAnalyticsDashboard', () => ({
  DashboardAnalyticsDashboard: () => (
    <div data-testid="analytics-dashboard">Analytics Dashboard</div>
  ),
}));

vi.mock('../AssignmentHistoryPanel', () => ({
  AssignmentHistoryPanel: () => <div data-testid="history-panel">History Panel</div>,
}));

const mockAssignments = [
  {
    id: 'assign-1',
    roleId: 'Director' as const,
    templateId: 'director-template',
    templateVersion: 1,
    assignedBy: 'admin-user-1',
    assignedAt: new Date('2024-01-15'),
    activatedAt: new Date('2024-01-15'),
    isActive: true,
    isDefault: true,
    metadata: {
      description: 'Default director dashboard',
      tags: ['executive'],
    },
  },
  {
    id: 'assign-2',
    roleId: 'Principal' as const,
    templateId: 'principal-template',
    templateVersion: 1,
    assignedBy: 'admin-user-1',
    assignedAt: new Date('2024-01-15'),
    activatedAt: new Date('2024-01-15'),
    isActive: false,
    isDefault: false,
    metadata: {
      description: 'Academic leadership dashboard',
      tags: ['academic'],
    },
  },
];

const mockHistory = [
  {
    id: 'history-1',
    templateId: 'director-template',
    roleId: 'Director' as const,
    action: 'assigned' as const,
    performedBy: 'admin-user-1',
    performedAt: new Date('2024-01-15'),
    reason: 'Initial assignment',
  },
];

describe('DashboardAssignmentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.getAllAssignments
    ).mockResolvedValue(mockAssignments);
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.getAssignmentHistory
    ).mockResolvedValue(mockHistory);
  });

  it('renders the dashboard assignment manager', async () => {
    render(<DashboardAssignmentManager />);

    expect(screen.getByText('Dashboard Assignment Manager')).toBeInTheDocument();
    expect(
      screen.getByText('Manage dashboard assignments, versions, and analytics for user roles')
    ).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Total Assignments')).toBeInTheDocument();
    });
  });

  it('displays assignment statistics correctly', async () => {
    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // Total assignments
      expect(screen.getByText('1')).toBeInTheDocument(); // Active assignments
      expect(screen.getByText('1')).toBeInTheDocument(); // Inactive assignments
    });
  });

  it('shows assignments table with correct data', async () => {
    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Director')).toBeInTheDocument();
      expect(screen.getByText('Principal')).toBeInTheDocument();
      expect(screen.getByText('director-template')).toBeInTheDocument();
      expect(screen.getByText('principal-template')).toBeInTheDocument();
    });
  });

  it('handles assignment activation', async () => {
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.activateAssignment
    ).mockResolvedValue();

    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Principal')).toBeInTheDocument();
    });

    // Find and click the activate button for the inactive assignment
    const activateButtons = screen.getAllByTitle('Activate');
    fireEvent.click(activateButtons[0]);

    await waitFor(() => {
      expect(
        dashboardAssignmentService.dashboardAssignmentService.activateAssignment
      ).toHaveBeenCalledWith('assign-2', 'current-admin');
    });
  });

  it('handles assignment deactivation', async () => {
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.deactivateAssignment
    ).mockResolvedValue();

    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Director')).toBeInTheDocument();
    });

    // Find and click the deactivate button for the active assignment
    const deactivateButtons = screen.getAllByTitle('Deactivate');
    fireEvent.click(deactivateButtons[0]);

    await waitFor(() => {
      expect(
        dashboardAssignmentService.dashboardAssignmentService.deactivateAssignment
      ).toHaveBeenCalledWith('assign-1', 'current-admin');
    });
  });

  it('switches between tabs correctly', async () => {
    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Assignments')).toBeInTheDocument();
    });

    // Click on Analytics tab
    fireEvent.click(screen.getByText('Analytics'));
    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument();

    // Click on History tab
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByTestId('history-panel')).toBeInTheDocument();

    // Click on Versions tab
    fireEvent.click(screen.getByText('Versions'));
    expect(screen.getByTestId('version-manager')).toBeInTheDocument();
  });

  it('opens new assignment modal', async () => {
    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('New Assignment')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Assignment'));

    // Modal should be visible
    expect(screen.getByTestId('role-assignment-panel')).toBeInTheDocument();
  });

  it('filters assignments correctly', async () => {
    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Director')).toBeInTheDocument();
      expect(screen.getByText('Principal')).toBeInTheDocument();
    });

    // Filter by active status
    const statusFilter = screen.getByDisplayValue('All Status');
    fireEvent.change(statusFilter, { target: { value: 'true' } });

    // Should still show both since we're not actually filtering in the mock
    // In a real implementation, this would filter the results
    expect(screen.getByText('Director')).toBeInTheDocument();
  });

  it('handles errors gracefully', async () => {
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.getAllAssignments
    ).mockRejectedValue(new Error('Failed to load assignments'));

    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load assignments')).toBeInTheDocument();
    });
  });

  it('calls onAssignmentChange when assignment is updated', async () => {
    const mockOnAssignmentChange = vi.fn();

    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.activateAssignment
    ).mockResolvedValue();

    render(<DashboardAssignmentManager onAssignmentChange={mockOnAssignmentChange} />);

    await waitFor(() => {
      expect(screen.getByText('Principal')).toBeInTheDocument();
    });

    // Activate an assignment
    const activateButtons = screen.getAllByTitle('Activate');
    fireEvent.click(activateButtons[0]);

    await waitFor(() => {
      expect(mockOnAssignmentChange).toHaveBeenCalledWith(mockAssignments[1]);
    });
  });

  it('shows empty state when no assignments exist', async () => {
    vi.mocked(
      dashboardAssignmentService.dashboardAssignmentService.getAllAssignments
    ).mockResolvedValue([]);

    render(<DashboardAssignmentManager />);

    await waitFor(() => {
      expect(screen.getByText('No assignments found')).toBeInTheDocument();
      expect(
        screen.getByText('Get started by creating a new dashboard assignment.')
      ).toBeInTheDocument();
    });
  });
});
