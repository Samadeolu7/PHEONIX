import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  AnimatedContainer,
  StaggeredAnimation,
  HoverAnimation,
  LoadingAnimation,
} from '../Animations';

describe('Animations Components', () => {
  describe('AnimatedContainer', () => {
    it('renders children correctly', () => {
      render(
        <AnimatedContainer animation="fadeIn">
          <div data-testid="test-content">Test Content</div>
        </AnimatedContainer>
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
    });

    it('applies correct animation classes', () => {
      const { container } = render(
        <AnimatedContainer animation="slideInFromRight" className="custom-class">
          <div>Content</div>
        </AnimatedContainer>
      );

      const animatedDiv = container.firstChild as HTMLElement;
      expect(animatedDiv).toHaveClass('custom-class');
      expect(animatedDiv).toHaveClass('transition-all');
    });
  });

  describe('StaggeredAnimation', () => {
    it('renders multiple children with staggered delays', () => {
      const children = [
        <div key="1" data-testid="child-1">
          Child 1
        </div>,
        <div key="2" data-testid="child-2">
          Child 2
        </div>,
        <div key="3" data-testid="child-3">
          Child 3
        </div>,
      ];

      render(<StaggeredAnimation staggerDelay={0.1}>{children}</StaggeredAnimation>);

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });
  });

  describe('HoverAnimation', () => {
    it('renders children with hover effects', () => {
      render(
        <HoverAnimation scale={1.05} lift={true}>
          <button data-testid="hover-button">Hover Me</button>
        </HoverAnimation>
      );

      expect(screen.getByTestId('hover-button')).toBeInTheDocument();
    });
  });

  describe('LoadingAnimation', () => {
    it('renders spinner animation by default', () => {
      const { container } = render(<LoadingAnimation />);

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('renders dots animation when specified', () => {
      const { container } = render(<LoadingAnimation type="dots" />);

      const dots = container.querySelectorAll('.animate-pulse');
      expect(dots).toHaveLength(3);
    });

    it('renders skeleton animation when specified', () => {
      const { container } = render(<LoadingAnimation type="skeleton" />);

      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeInTheDocument();
    });
  });
});
