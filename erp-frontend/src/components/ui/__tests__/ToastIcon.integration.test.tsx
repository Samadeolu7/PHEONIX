import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastIcon } from '../ToastIcon';
import { ToastType, DEFAULT_TOAST_CONFIG } from '../../../types/toast';

describe('ToastIcon Integration', () => {
  it('integrates correctly with toast type system', () => {
    // Test that ToastIcon works with all defined toast types
    const toastTypes: ToastType[] = ['success', 'error', 'info', 'warning'];

    toastTypes.forEach(type => {
      const { container } = render(<ToastIcon type={type} />);
      const svgElement = container.querySelector('svg');

      expect(svgElement).toBeInTheDocument();
      expect(svgElement).toHaveClass('w-5', 'h-5', 'flex-shrink-0');
    });
  });

  it('uses consistent sizing that works with toast layout', () => {
    const { container } = render(<ToastIcon type="success" />);
    const svgElement = container.querySelector('svg');

    // Verify the icon has flex-shrink-0 to prevent layout issues
    expect(svgElement).toHaveClass('flex-shrink-0');

    // Verify consistent sizing
    expect(svgElement).toHaveClass('w-5', 'h-5');
  });

  it('supports custom sizing for different toast contexts', () => {
    const { container } = render(<ToastIcon type="error" className="w-6 h-6" />);
    const svgElement = container.querySelector('svg');

    // Should maintain base classes while allowing size overrides
    expect(svgElement).toHaveClass('flex-shrink-0', 'text-red-600', 'w-6', 'h-6');
  });

  it('has proper accessibility attributes for toast context', () => {
    const { container } = render(<ToastIcon type="warning" />);
    const svgElement = container.querySelector('svg');

    // Icons should be hidden from screen readers since toast content provides context
    expect(svgElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('works with all toast configuration types', () => {
    // Verify it works with types that have different durations
    const typesWithDurations = Object.keys(DEFAULT_TOAST_CONFIG.duration) as ToastType[];

    typesWithDurations.forEach(type => {
      const { container } = render(<ToastIcon type={type} />);
      const svgElement = container.querySelector('svg');

      expect(svgElement).toBeInTheDocument();

      // Verify type-specific colors are applied
      const expectedColors = {
        success: 'text-green-600',
        error: 'text-red-600',
        info: 'text-blue-600',
        warning: 'text-orange-600',
      };

      expect(svgElement).toHaveClass(expectedColors[type]);
    });
  });
});
