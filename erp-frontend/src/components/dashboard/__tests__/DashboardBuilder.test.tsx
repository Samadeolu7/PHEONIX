import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardBuilder } from '../DashboardBuilder';
import { DashboardTemplate } from '../../../types/dashboardTemplates';
import { UserRole } from '../../../types/roles';

// Mock the hooks
vi.mock('../../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: {
      theme: 'light',
      layout: 'grid',
    },
  }),
}));

// Mock react-grid-layout
vi.mock('react-grid-layout', () => ({
  Responsive: ({ children }: any) => <div data-testid="responsive-grid">{children}</div>,
  WidthProvider: (Component: any) => Component,
}));

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: vi.fn(),
}));

const mockTemplate: DashboardTemplate = {
  id: 'test-template',
  name: 'Test Dashboard',
  description: 'Test dashboard template',
  role: 'administrator' as UserRole,
  showWelcomeBanner: true,
  showQuickStats: true,
  showModuleCards: true,
  showActivityFeed: false,
  showAlerts: false,
  primaryModules: [],
  secondaryModules: [],
  statsCards: [],
  quickActions: [],
  widgets: [
    {
      id: 'test-widget',
      type: 'stats',
      title: 'Test Widget',
      size: 'medium',
      position: { x: 0, y: 0, w: 4, h: 3 },
      config: {
        color: 'blue',
        format: 'number',
      },
      visible: true,
    },
  ],
  layout: 'grid',
  maxModulesPerRow: 3,
  showModuleStats: true,
  theme: {
    primaryColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
  },
};

describe('DashboardBuilder', () => {
  const mockOnSave = vi.fn();
  const mockOnPreview = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard builder interface', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    expect(screen.getByText('Dashboard Builder - Test Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Add Widget')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('displays existing widgets', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    expect(screen.getByTestId('responsive-grid')).toBeInTheDocument();
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
  });

  it('opens widget library when add widget is clicked', async () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    const addWidgetButton = screen.getByText('Add Widget');
    fireEvent.click(addWidgetButton);

    await waitFor(() => {
      expect(screen.getByText('Widget Library')).toBeInTheDocument();
    });
  });

  it('calls onSave when save button is clicked', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-template',
        name: 'Test Dashboard',
      })
    );
  });

  it('calls onPreview when preview button is clicked', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    const previewButton = screen.getByText('Preview');
    fireEvent.click(previewButton);

    expect(mockOnPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-template',
        name: 'Test Dashboard',
      })
    );
  });

  it('shows undo/redo buttons', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    expect(screen.getByTitle('Undo')).toBeInTheDocument();
    expect(screen.getByTitle('Redo')).toBeInTheDocument();
  });

  it('shows breakpoint selector', () => {
    render(
      <DashboardBuilder template={mockTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    expect(screen.getByTitle('Desktop')).toBeInTheDocument();
    expect(screen.getByTitle('Tablet')).toBeInTheDocument();
    expect(screen.getByTitle('Mobile')).toBeInTheDocument();
  });

  it('shows empty state when no widgets exist', () => {
    const emptyTemplate = {
      ...mockTemplate,
      widgets: [],
    };

    render(
      <DashboardBuilder template={emptyTemplate} onSave={mockOnSave} onPreview={mockOnPreview} />
    );

    expect(screen.getByText('No widgets added yet')).toBeInTheDocument();
    expect(screen.getByText('Add Your First Widget')).toBeInTheDocument();
  });
});
