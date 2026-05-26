import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastIcon } from '../ToastIcon';
import { ToastType } from '../../../types/toast';

describe('ToastIcon', () => {
  const toastTypes: ToastType[] = ['success', 'error', 'info', 'warning'];

  it.each(toastTypes)('renders %s icon correctly', type => {
    const { container } = render(<ToastIcon type={type} />);

    // Check that an SVG icon is rendered
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    // Check that it has the correct base classes
    expect(svgElement).toHaveClass('w-5', 'h-5', 'flex-shrink-0');

    // Check type-specific color classes
    const expectedColorClass = {
      success: 'text-green-600',
      error: 'text-red-600',
      info: 'text-blue-600',
      warning: 'text-orange-600',
    }[type];

    expect(svgElement).toHaveClass(expectedColorClass);
  });

  it('applies custom className when provided', () => {
    const customClass = 'custom-test-class';
    const { container } = render(<ToastIcon type="success" className={customClass} />);

    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass(customClass);
  });

  it('has aria-hidden attribute for accessibility', () => {
    const { container } = render(<ToastIcon type="info" />);

    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('maintains base classes when custom className is provided', () => {
    const { container } = render(<ToastIcon type="warning" className="extra-class" />);

    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass('w-5', 'h-5', 'flex-shrink-0', 'text-orange-600', 'extra-class');
  });
});
