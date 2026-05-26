import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          iconColor: '#ef4444',
          iconBg: '#fef2f2',
          confirmBg: '#ef4444',
          confirmHoverBg: '#dc2626',
        };
      case 'warning':
        return {
          iconColor: '#f59e0b',
          iconBg: '#fef3c7',
          confirmBg: '#f59e0b',
          confirmHoverBg: '#d97706',
        };
      case 'info':
        return {
          iconColor: '#3b82f6',
          iconBg: '#dbeafe',
          confirmBg: '#3b82f6',
          confirmHoverBg: '#2563eb',
        };
      default:
        return {
          iconColor: '#ef4444',
          iconBg: '#fef2f2',
          confirmBg: '#ef4444',
          confirmHoverBg: '#dc2626',
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '4px',
            border: 'none',
            background: 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
            color: '#6b7280',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: typeStyles.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <AlertTriangle size={24} style={{ color: typeStyles.iconColor }} />
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#1f2937',
            textAlign: 'center',
          }}
        >
          {title}
        </h3>

        {/* Message */}
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '14px',
            color: '#6b7280',
            textAlign: 'center',
            lineHeight: '1.5',
          }}
        >
          {message}
        </p>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              color: '#374151',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              background: isLoading ? '#9ca3af' : typeStyles.confirmBg,
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = typeStyles.confirmHoverBg;
              }
            }}
            onMouseLeave={e => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = typeStyles.confirmBg;
              }
            }}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
