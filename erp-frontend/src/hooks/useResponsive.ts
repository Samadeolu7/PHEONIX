import { useState, useEffect, useMemo } from 'react';

interface BreakpointConfig {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
}

const defaultBreakpoints: BreakpointConfig = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

type BreakpointKey = keyof BreakpointConfig;

interface UseResponsiveReturn {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
  breakpoint: BreakpointKey;
  isBreakpoint: (bp: BreakpointKey) => boolean;
  isAboveBreakpoint: (bp: BreakpointKey) => boolean;
  isBelowBreakpoint: (bp: BreakpointKey) => boolean;
  orientation: 'portrait' | 'landscape';
  aspectRatio: number;
  isTouch: boolean;
  pixelRatio: number;
}

export const useResponsive = (breakpoints: Partial<BreakpointConfig> = {}): UseResponsiveReturn => {
  const bp = { ...defaultBreakpoints, ...breakpoints };

  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  const [isTouch, setIsTouch] = useState(false);
  const [pixelRatio, setPixelRatio] = useState(1);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      // Debounce resize events for better performance
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100);
    };

    const handleOrientationChange = () => {
      // Handle orientation change with a delay to get correct dimensions
      setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100);
    };

    // Detect touch capability
    const detectTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };

    // Detect pixel ratio
    const detectPixelRatio = () => {
      setPixelRatio(window.devicePixelRatio || 1);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Set initial values
    handleResize();
    detectTouch();
    detectPixelRatio();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      clearTimeout(timeoutId);
    };
  }, []);

  const getCurrentBreakpoint = (): BreakpointKey => {
    const { width } = dimensions;

    if (width >= bp['2xl']) return '2xl';
    if (width >= bp.xl) return 'xl';
    if (width >= bp.lg) return 'lg';
    if (width >= bp.md) return 'md';
    if (width >= bp.sm) return 'sm';
    return 'xs';
  };

  const isBreakpoint = (breakpoint: BreakpointKey): boolean => {
    return getCurrentBreakpoint() === breakpoint;
  };

  const isAboveBreakpoint = (breakpoint: BreakpointKey): boolean => {
    return dimensions.width >= bp[breakpoint];
  };

  const isBelowBreakpoint = (breakpoint: BreakpointKey): boolean => {
    return dimensions.width < bp[breakpoint];
  };

  const orientation = dimensions.width > dimensions.height ? 'landscape' : 'portrait';
  const aspectRatio = dimensions.width / dimensions.height;

  return {
    width: dimensions.width,
    height: dimensions.height,
    isMobile: dimensions.width < bp.md,
    isTablet: dimensions.width >= bp.md && dimensions.width < bp.lg,
    isDesktop: dimensions.width >= bp.lg && dimensions.width < bp.xl,
    isLargeDesktop: dimensions.width >= bp.xl,
    breakpoint: getCurrentBreakpoint(),
    isBreakpoint,
    isAboveBreakpoint,
    isBelowBreakpoint,
    orientation,
    aspectRatio,
    isTouch,
    pixelRatio,
  };
};

// Hook for responsive values with better performance
export const useResponsiveValue = <T>(
  values: Partial<Record<BreakpointKey, T>>,
  defaultValue: T
): T => {
  const { breakpoint, width } = useResponsive();

  return useMemo(() => {
    // Find the appropriate value based on current breakpoint
    const breakpointOrder: BreakpointKey[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

    for (const bp of breakpointOrder) {
      if (width >= defaultBreakpoints[bp] && values[bp] !== undefined) {
        return values[bp]!;
      }
    }

    return defaultValue;
  }, [values, defaultValue, width]);
};

// Hook for responsive grid columns with better performance
export const useResponsiveGrid = (
  columns: Partial<Record<BreakpointKey, number>> = {}
): { gridTemplateColumns: string; gap: string; itemMinWidth: string } => {
  const defaultColumns = {
    xs: 1,
    sm: 2,
    md: 2,
    lg: 3,
    xl: 4,
    '2xl': 4,
    ...columns,
  };

  const currentColumns = useResponsiveValue(defaultColumns, 1);
  const { isMobile, isTablet } = useResponsive();

  return useMemo(
    () => ({
      gridTemplateColumns: `repeat(${currentColumns}, 1fr)`,
      gap: isMobile ? '12px' : isTablet ? '16px' : '20px',
      itemMinWidth: isMobile ? '280px' : '320px',
    }),
    [currentColumns, isMobile, isTablet]
  );
};

// Hook for responsive spacing
export const useResponsiveSpacing = () => {
  const { isMobile, isTablet } = useResponsive();

  return useMemo(
    () => ({
      xs: isMobile ? '4px' : '6px',
      sm: isMobile ? '8px' : '12px',
      md: isMobile ? '12px' : isTablet ? '16px' : '20px',
      lg: isMobile ? '16px' : isTablet ? '20px' : '24px',
      xl: isMobile ? '20px' : isTablet ? '24px' : '32px',
      xxl: isMobile ? '24px' : isTablet ? '32px' : '48px',
    }),
    [isMobile, isTablet]
  );
};

// Hook for responsive typography
export const useResponsiveTypography = () => {
  const { isMobile, isTablet } = useResponsive();

  return useMemo(
    () => ({
      h1: {
        fontSize: isMobile ? '24px' : isTablet ? '28px' : '32px',
        lineHeight: isMobile ? '32px' : isTablet ? '36px' : '40px',
        fontWeight: 'bold',
      },
      h2: {
        fontSize: isMobile ? '20px' : isTablet ? '22px' : '24px',
        lineHeight: isMobile ? '28px' : isTablet ? '30px' : '32px',
        fontWeight: '600',
      },
      h3: {
        fontSize: isMobile ? '18px' : isTablet ? '20px' : '20px',
        lineHeight: isMobile ? '24px' : isTablet ? '28px' : '28px',
        fontWeight: '600',
      },
      body: {
        fontSize: isMobile ? '14px' : '16px',
        lineHeight: isMobile ? '20px' : '24px',
        fontWeight: 'normal',
      },
      caption: {
        fontSize: isMobile ? '12px' : '14px',
        lineHeight: isMobile ? '16px' : '20px',
        fontWeight: 'normal',
      },
    }),
    [isMobile, isTablet]
  );
};

// Hook for responsive container widths
export const useResponsiveContainer = () => {
  const { width, isMobile, isTablet } = useResponsive();

  return useMemo(() => {
    if (isMobile) return { maxWidth: '100%', padding: '16px' };
    if (isTablet) return { maxWidth: '768px', padding: '20px' };
    if (width < 1280) return { maxWidth: '1024px', padding: '24px' };
    return { maxWidth: '1280px', padding: '32px' };
  }, [width, isMobile, isTablet]);
};

export default useResponsive;
