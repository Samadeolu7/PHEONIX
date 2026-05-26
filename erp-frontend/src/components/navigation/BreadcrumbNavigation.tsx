// BreadcrumbNavigation component for showing current location
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbItem } from '../../types/navigation';

interface BreadcrumbNavigationProps {
  items: BreadcrumbItem[];
  maxItems?: number;
  showHome?: boolean;
  className?: string;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  items,
  maxItems = 5,
  showHome = true,
  className = '',
}) => {
  // Add home breadcrumb if requested and not already present
  const breadcrumbItems =
    showHome && items.length > 0 && items[0].path !== '/'
      ? [{ label: 'Home', path: '/', isActive: false }, ...items]
      : items;

  // Truncate items if they exceed maxItems
  const displayItems =
    breadcrumbItems.length > maxItems
      ? [
          ...breadcrumbItems.slice(0, 1),
          { label: '...', path: undefined, isActive: false },
          ...breadcrumbItems.slice(-(maxItems - 2)),
        ]
      : breadcrumbItems;

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isEllipsis = item.label === '...';

          return (
            <li key={`${item.label}-${index}`} className="flex items-center">
              {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 mx-1" />}

              {isEllipsis ? (
                <span className="text-gray-500 px-2">...</span>
              ) : isLast || !item.path ? (
                <span
                  className={`font-medium ${isLast ? 'text-gray-900' : 'text-gray-500'}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label === 'Home' && showHome ? <Home className="h-4 w-4" /> : item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="text-gray-500 hover:text-gray-700 transition-colors duration-150"
                >
                  {item.label === 'Home' && showHome ? <Home className="h-4 w-4" /> : item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// Hook for generating breadcrumbs from current route
export const useBreadcrumbs = () => {
  const generateBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];

    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      // Convert segment to readable label
      const label = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      breadcrumbs.push({
        label,
        path: currentPath,
        isActive: isLast,
      });
    });

    return breadcrumbs;
  };

  return { generateBreadcrumbs };
};
