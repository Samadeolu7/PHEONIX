import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width = 'w-full', height = 'h-4', variant = 'text', ...props }, ref) => {
    const base = 'animate-pulse bg-gray-200 dark:bg-slate-700';
    const shapeClass =
      variant === 'circle' ? `rounded-full ${width} ${height}` : `rounded-md ${width} ${height}`;

    return <div ref={ref} role="status" className={cn(base, shapeClass, className)} {...props} />;
  }
);

Skeleton.displayName = 'Skeleton';

export default Skeleton;
