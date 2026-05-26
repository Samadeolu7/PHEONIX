import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface SelectContextValue {
  value?: string;
  setValue: (v: string) => void;
  placeholder?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  open: boolean;
  setOpen: (o: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  children,
  value: controlledValue,
  defaultValue,
  onValueChange,
  disabled = false,
  ...props
}) => {
  const [value, setValue] = useState<string | undefined>(controlledValue ?? defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (controlledValue !== undefined) setValue(controlledValue);
  }, [controlledValue]);

  const setValueAndNotify = (v: string) => {
    if (controlledValue === undefined) setValue(v);
    onValueChange?.(v);
  };

  return (
    <SelectContext.Provider
      value={{
        value,
        setValue: setValueAndNotify,
        placeholder: undefined,
        onValueChange,
        disabled,
        open,
        setOpen,
      }}
    >
      <div {...props} className={cn('relative inline-block', props.className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

export const SelectTrigger: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className,
  ...props
}) => {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;

  const { disabled, open, setOpen } = ctx;

  return (
    <button
      type="button"
      onClick={() => !disabled && setOpen(!open)}
      className={cn(
        'inline-flex items-center justify-between w-full rounded-md border px-3 py-2 bg-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const SelectValue: React.FC<{ placeholder?: string; className?: string }> = ({
  placeholder,
  className,
}) => {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;
  const { value } = ctx;
  return <span className={cn('truncate', className)}>{value ?? placeholder}</span>;
};

export const SelectContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => {
  const ctx = React.useContext(SelectContext);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) ctx?.setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [ctx]);

  if (!ctx) return null;
  if (!ctx.open) return null;

  return (
    <div
      ref={ref}
      className={cn('absolute z-50 mt-1 w-full rounded-md border bg-white shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
};

export const SelectItem: React.FC<{
  value: string;
  children?: React.ReactNode;
  className?: string;
}> = ({ value, children, className }) => {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;

  const handleClick = () => {
    ctx.setValue(value);
    ctx.setOpen(false);
  };

  return (
    <div
      role="option"
      onClick={handleClick}
      className={cn('cursor-pointer px-3 py-2 hover:bg-gray-100', className)}
    >
      {children}
    </div>
  );
};

export default Select;
