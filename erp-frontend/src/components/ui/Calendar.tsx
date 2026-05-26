import * as React from 'react';

type CalendarProps = {
  mode?: 'single' | 'range';
  selected?: Date | null;
  onSelect?: (d: Date | null) => void;
  initialFocus?: boolean;
};

export const Calendar: React.FC<CalendarProps> = ({ selected, onSelect }) => {
  const formatValue = (d?: Date | null) => {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <input
      type="date"
      value={formatValue(selected)}
      onChange={e => {
        const v = e.target.value;
        if (!v) {
          onSelect?.(null);
          return;
        }
        onSelect?.(new Date(v + 'T00:00:00'));
      }}
      className="p-2"
    />
  );
};

export default Calendar;
