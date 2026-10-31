import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface Props {
  title: string;
  children: React.ReactNode;
}

/** Small ⓘ button that opens a short explanation of how a figure was worked out. */
export const InfoButton: React.FC<Props> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How "${title}" is worked out`}
        title="How is this worked out?"
        className="inline-flex items-center text-gray-400 hover:text-blue-600 align-middle"
      >
        <Info className="w-4 h-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-3 text-sm text-gray-700">{children}</div>
      </Modal>
    </>
  );
};

/** Two-column "label … amount" line used inside explanations. */
export const InfoLine: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }> = ({
  label, value, strong, muted,
}) => (
  <div className={`flex justify-between gap-4 ${strong ? 'font-semibold text-gray-900 border-t pt-1' : ''} ${muted ? 'text-gray-500' : ''}`}>
    <span>{label}</span>
    <span className="whitespace-nowrap">{value}</span>
  </div>
);

export default InfoButton;
