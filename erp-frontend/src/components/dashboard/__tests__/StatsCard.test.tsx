import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BarChart3 } from 'lucide-react';
import { StatsCard } from '../StatsCard';

describe('StatsCard Component', () => {
  const defaultProps = {
    id: 'test-card',
    title: 'Test Metric',
    value: 1000,
    icon: BarChart3,
    color: 'blue' as const,
    theme: 'light' as const,
  };

  it('renders without crashing', () => {
    render(<StatsCard {...defaultProps} />);
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
  });

  it('handles gradient theme correctly', () => {
    render(<StatsCard {...defaultProps} theme="gradient" />);
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
  });

  it('handles invalid theme gracefully', () => {
    // @ts-ignore - Testing invalid theme
    render(<StatsCard {...defaultProps} theme="invalid" />);
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
  });

  it('displays formatted currency values', () => {
    render(<StatsCard {...defaultProps} value={2500000} format="currency" />);
    expect(screen.getByText(/₦/)).toBeInTheDocument();
  });

  it('displays percentage values', () => {
    render(<StatsCard {...defaultProps} value={85} format="percentage" suffix="%" />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<StatsCard {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
  });

  it('handles change indicators', () => {
    render(
      <StatsCard
        {...defaultProps}
        change={{
          value: 12.5,
          type: 'increase',
          period: 'last month',
        }}
      />
    );
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });
});
