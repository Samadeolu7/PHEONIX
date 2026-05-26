import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'medium',
  fullScreen = false,
}) => {
  const sizeMap = {
    small: { spinner: 16, text: '12px', padding: '16px' },
    medium: { spinner: 24, text: '14px', padding: '24px' },
    large: { spinner: 32, text: '16px', padding: '32px' },
  };

  const sizeConfig = sizeMap[size];

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: sizeConfig.padding,
    color: '#6b7280',
    ...(fullScreen && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 9999,
    }),
  };

  return (
    <div style={containerStyle}>
      <LoadingSpinner size={sizeConfig.spinner} />
      <div
        style={{
          marginTop: '12px',
          fontSize: sizeConfig.text,
          fontWeight: 500,
        }}
      >
        {message}
      </div>
    </div>
  );
};

export default LoadingState;
