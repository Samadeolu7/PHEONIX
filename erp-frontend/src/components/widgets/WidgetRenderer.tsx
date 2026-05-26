// src/components/widgets/WidgetRenderer.tsx
import React, { useState, useEffect } from 'react';
import WIDGET_TYPE_MAP from './WidgetLibrary';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

interface WidgetConfig {
  type: string;
  title?: string;
  [key: string]: any;
}

interface WidgetRendererProps {
  widget: WidgetConfig;
  modulesData?: any[];
  formsData?: any[];
  isEditing?: boolean;
  onDataRequest?: (widgetId: string) => Promise<unknown>;
}

const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  widget,
  modulesData = [],
  formsData = [],
  isEditing,
  onDataRequest,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    prepareWidgetData();
  }, [widget, modulesData, formsData]);

  const prepareWidgetData = () => {
    // For navigation widgets, auto-populate from modules
    if (widget.widget_type === 'navigation' && modulesData.length > 0) {
      const links = modulesData.flatMap(module =>
        (module.pages || [])
          .filter((page: any) => page.page_type === 'form')
          .map((page: any) => ({
            label: page.title,
            url: page.url_path,
            icon: page.icon || module.icon,
            color: module.color,
            description: page.description,
          }))
      );

      if (!widget.config.links || widget.config.links.length === 0) {
        widget.config.links = links;
      }
    }

    // For list widgets showing forms
    if (widget.widget_type === 'list' && formsData.length > 0) {
      const items = formsData.map(form => ({
        name: form.name,
        description: form.description,
        icon: 'file-text',
      }));

      if (!widget.config.items || widget.config.items.length === 0) {
        widget.config.items = items;
      }
    }

    // Always set config as the initial (static) data so widgets render immediately
    setData(widget.config);

    // For widgets with a real backend integer ID, also fetch live data.
    // Static-only types don't need a backend call — they fully render from config.
    const STATIC_TYPES = ['sidebar', 'quick_links', 'text', 'navigation'];
    if (STATIC_TYPES.includes(widget.widget_type)) return;

    const widgetId = widget.id;
    if (!widgetId || isNaN(Number(widgetId))) return;

    // Fetch live data and non-destructively merge — only overwrite keys that
    // have a genuinely useful value so we never blank out good config data.
    api
      .get(`/widgets/${widgetId}/data/`)
      .then(response => {
        const liveData = response.data?.data || response.data;
        if (liveData && !liveData.error) {
          setData((prev: any) => {
            const merged = { ...prev };
            for (const [key, val] of Object.entries(liveData as Record<string, any>)) {
              // Skip nulls, undefineds and empty arrays — they must not wipe good data
              if (val === null || val === undefined) continue;
              if (Array.isArray(val) && val.length === 0) continue;
              merged[key] = val;
            }
            return merged;
          });
        }
      })
      .catch(() => {
        // Silently fall back to static config data already displayed
      });
  };

  const handleLinkClick = (link: any) => {
    // Use frontendUrl if available, otherwise fall back to url
    const navigationUrl = link.frontendUrl || link.url;

    if (navigationUrl) {
      console.log('🔗 Widget navigation:', {
        label: link.label,
        frontendUrl: link.frontendUrl,
        originalUrl: link.url,
        navigatingTo: navigationUrl,
        usingFrontendUrl: !!link.frontendUrl,
        currentLocation: window.location.href,
      });

      // Ensure we're using relative paths for internal navigation
      const cleanUrl = navigationUrl.startsWith('http')
        ? new URL(navigationUrl).pathname
        : navigationUrl;

      console.log('🔗 Clean URL for navigation:', cleanUrl);
      navigate(cleanUrl);
    }
  };

  const WidgetComponent = WIDGET_TYPE_MAP[widget.widget_type];

  if (!WidgetComponent) {
    return (
      <div
        style={{
          height: '100%',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#6b7280' }}>Unknown widget: {widget.widget_type}</p>
      </div>
    );
  }

  return (
    <WidgetComponent widget={widget} data={data} loading={loading} onLinkClick={handleLinkClick} />
  );
};

export { WidgetRenderer, type WidgetConfig };
export default WidgetRenderer;
