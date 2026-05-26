import * as React from 'react';
import { cn } from '../../lib/utils';

type PopoverContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const PopoverContext = React.createContext<PopoverContextType | null>(null);

export const Popover: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  return <PopoverContext.Provider value={{ open, setOpen }}>{children}</PopoverContext.Provider>;
};

export const PopoverTrigger: React.FC<{ asChild?: boolean; children: React.ReactElement }> = ({
  asChild,
  children,
}) => {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    ctx.setOpen(!ctx.open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e: any) => {
        children.props.onClick?.(e);
        handleClick(e);
      },
    });
  }

  return <button onClick={handleClick}>{children}</button>;
};

export const PopoverContent: React.FC<{
  children?: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const ctx = React.useContext(PopoverContext);
  if (!ctx || !ctx.open) return null;

  return (
    <div className={cn('z-50 rounded-md border bg-background p-2 shadow-sm', className)}>
      {children}
    </div>
  );
};

export default Popover;
