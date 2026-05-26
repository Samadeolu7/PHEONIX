import * as React from 'react';
import { cn } from '../../lib/utils';

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
};

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => {
    const base = 'shrink-0 bg-border';
    const classes = orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px] inline-block';

    return <div ref={ref} className={cn(base, classes, className)} {...props} />;
  }
);

Separator.displayName = 'Separator';

export default Separator;
