import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
  animation?: 'pulse' | 'wave' | 'none';
}

const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '4px',
  className = '',
  variant = 'rectangular',
  animation = 'wave',
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'circular':
        return {
          borderRadius: '50%',
          width: height, // Make it square for perfect circle
        };
      case 'text':
        return {
          borderRadius: '4px',
          height: '1em',
          marginBottom: '0.5em',
        };
      default:
        return {
          borderRadius,
        };
    }
  };

  const getAnimationStyles = () => {
    switch (animation) {
      case 'pulse':
        return {
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        };
      case 'wave':
        return {
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-wave 1.5s infinite',
        };
      case 'none':
        return {
          background: '#f0f0f0',
        };
      default:
        return {
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-wave 1.5s infinite',
        };
    }
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        display: 'inline-block',
        ...getVariantStyles(),
        ...getAnimationStyles(),
      }}
    />
  );
};

// Skeleton components for different use cases
export const CardSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: compact ? '16px' : '24px',
      marginBottom: '16px',
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: compact ? '12px' : '16px',
      }}
    >
      <div style={{ flex: 1 }}>
        <Skeleton width="200px" height={compact ? '20px' : '24px'} borderRadius="6px" />
        <div style={{ marginTop: '8px' }}>
          <Skeleton width="150px" height="16px" borderRadius="4px" />
        </div>
        <div style={{ marginTop: '4px' }}>
          <Skeleton width="180px" height="16px" borderRadius="4px" />
        </div>
        {!compact && (
          <div style={{ marginTop: '4px' }}>
            <Skeleton width="120px" height="16px" borderRadius="4px" />
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <Skeleton width="100px" height={compact ? '28px' : '32px'} borderRadius="6px" />
        <div style={{ marginTop: '4px' }}>
          <Skeleton width="60px" height="14px" borderRadius="4px" />
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
      <Skeleton width="60px" height={compact ? '28px' : '32px'} borderRadius="6px" />
      <Skeleton width="80px" height={compact ? '28px' : '32px'} borderRadius="6px" />
      <Skeleton width="70px" height={compact ? '28px' : '32px'} borderRadius="6px" />
    </div>
  </div>
);

export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 6 }) => (
  <tr>
    {Array.from({ length: columns }).map((_, index) => (
      <td key={index} style={{ padding: '12px' }}>
        {index === columns - 1 ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width="32px" height="32px" borderRadius="6px" />
            <Skeleton width="32px" height="32px" borderRadius="6px" />
          </div>
        ) : index === columns - 2 ? (
          <Skeleton width="80px" height="24px" borderRadius="12px" />
        ) : (
          <Skeleton width={`${80 + index * 20}px`} height="16px" />
        )}
      </td>
    ))}
  </tr>
);

export const FormSkeleton: React.FC<{ fields?: number }> = ({ fields = 4 }) => (
  <div
    style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '24px',
    }}
  >
    <Skeleton width="200px" height="24px" borderRadius="6px" />
    <div
      style={{
        marginTop: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
      }}
    >
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index}>
          <Skeleton width={`${60 + (index % 3) * 20}px`} height="16px" borderRadius="4px" />
          <div style={{ marginTop: '8px' }}>
            <Skeleton width="100%" height="44px" borderRadius="8px" />
          </div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: '20px' }}>
      <Skeleton width="120px" height="16px" borderRadius="4px" />
      <div style={{ marginTop: '8px' }}>
        <Skeleton width="100%" height="80px" borderRadius="8px" />
      </div>
    </div>
  </div>
);

export const ListSkeleton: React.FC<{ items?: number; compact?: boolean }> = ({
  items = 5,
  compact = false,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '16px' }}>
    {Array.from({ length: items }).map((_, index) => (
      <CardSkeleton key={index} compact={compact} />
    ))}
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '24px',
    }}
  >
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Skeleton variant="circular" width="48px" height="48px" />
          <div style={{ flex: 1 }}>
            <Skeleton width="120px" height="20px" borderRadius="4px" />
            <div style={{ marginTop: '4px' }}>
              <Skeleton width="80px" height="16px" borderRadius="4px" />
            </div>
          </div>
        </div>
        <Skeleton width="100%" height="120px" borderRadius="8px" />
      </div>
    ))}
  </div>
);

export const StatCardSkeleton: React.FC = () => (
  <div
    style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    }}
  >
    <Skeleton variant="circular" width="56px" height="56px" />
    <div style={{ flex: 1 }}>
      <Skeleton width="100px" height="16px" borderRadius="4px" />
      <div style={{ marginTop: '8px' }}>
        <Skeleton width="80px" height="28px" borderRadius="6px" />
      </div>
      <div style={{ marginTop: '4px' }}>
        <Skeleton width="60px" height="14px" borderRadius="4px" />
      </div>
    </div>
  </div>
);

export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 300 }) => (
  <div
    style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '24px',
    }}
  >
    <div style={{ marginBottom: '20px' }}>
      <Skeleton width="150px" height="20px" borderRadius="4px" />
      <div style={{ marginTop: '4px' }}>
        <Skeleton width="200px" height="14px" borderRadius="4px" />
      </div>
    </div>
    <Skeleton width="100%" height={`${height}px`} borderRadius="8px" />
  </div>
);

export const ProfileSkeleton: React.FC = () => (
  <div
    style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
    }}
  >
    <Skeleton variant="circular" width="80px" height="80px" />
    <div style={{ flex: 1 }}>
      <Skeleton width="200px" height="24px" borderRadius="6px" />
      <div style={{ marginTop: '8px' }}>
        <Skeleton width="150px" height="16px" borderRadius="4px" />
      </div>
      <div style={{ marginTop: '4px' }}>
        <Skeleton width="180px" height="16px" borderRadius="4px" />
      </div>
      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        <Skeleton width="80px" height="32px" borderRadius="6px" />
        <Skeleton width="100px" height="32px" borderRadius="6px" />
      </div>
    </div>
  </div>
);

// Add animation styles for skeleton components
const animationStyles = `
  @keyframes skeleton-wave {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  @keyframes skeleton-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .skeleton {
    position: relative;
    overflow: hidden;
  }

  .skeleton::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.6),
      transparent
    );
    animation: skeleton-shimmer 2s infinite;
  }

  @keyframes skeleton-shimmer {
    100% {
      transform: translateX(100%);
    }
  }
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('skeleton-animation-styles')) {
  const style = document.createElement('style');
  style.id = 'skeleton-animation-styles';
  style.textContent = animationStyles;
  document.head.appendChild(style);
}

export default Skeleton;
