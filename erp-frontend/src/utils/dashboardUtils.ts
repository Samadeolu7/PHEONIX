import { HierarchyButton, ModulePage } from '../types';

/**
 * Generates frontend URL based on page type and the appropriate identifier
 * @param page - The module page object containing page_type, code, and page_config
 * @returns Frontend URL string
 */
export const generateFrontendUrl = (page: ModulePage): string => {
  const pageType = page.page_type.toLowerCase();

  switch (pageType) {
    case 'custom':
      // System-link pages have the direct frontend URL stored in page_config.frontend_url
      // or can be used directly as url_path (already the frontend route).
      return page.page_config?.frontend_url || page.url_path || `/${page.code}`;
    case 'report': {
      // For reports, use report_code from page_config if available, otherwise fall back to code
      const reportCode = page.page_config?.report_code || page.code;
      return `/report/${reportCode}`;
    }
    case 'form': {
      // For forms, use form_schema_id from page_config if available, otherwise fall back to code
      const formSchemaId = page.page_config?.form_schema_id || page.code;
      return `/forms/${formSchemaId}`;
    }
    default:
      return `/${pageType}/${page.code}`;
  }
};

/**
 * Finds module page by URL path
 * @param urlPath - The backend URL path to match
 * @param modulePages - Array of module pages
 * @returns Matching module page or null
 */
export const findModulePageByUrl = (
  urlPath: string,
  modulePages: ModulePage[]
): ModulePage | null => {
  return modulePages.find(page => page.url_path === urlPath) || null;
};

/**
 * Processes sidebar buttons to add frontendUrl based on module pages data
 * @param buttons - Array of hierarchy buttons
 * @param modulePages - Array of module pages
 * @returns Processed buttons with frontendUrl added
 */
export const processSidebarButtons = (
  buttons: HierarchyButton[],
  modulePages: ModulePage[]
): HierarchyButton[] => {
  return buttons.map(button => {
    const processedButton: HierarchyButton = { ...button };

    // Process current button
    if (button.url) {
      const matchingPage = findModulePageByUrl(button.url, modulePages);
      if (matchingPage) {
        processedButton.frontendUrl = generateFrontendUrl(matchingPage);
      }
    }

    // Recursively process children
    if (button.children && button.children.length > 0) {
      processedButton.children = processSidebarButtons(button.children, modulePages);
    }

    return processedButton;
  });
};

/**
 * Processes quick links to add frontendUrl based on module pages data
 * @param links - Array of quick links
 * @param modulePages - Array of module pages
 * @returns Processed links with frontendUrl added
 */
export const processQuickLinks = (links: any[], modulePages: ModulePage[]): any[] => {
  return links.map(link => {
    const processedLink = { ...link };

    if (link.url) {
      const matchingPage = findModulePageByUrl(link.url, modulePages);
      if (matchingPage) {
        processedLink.frontendUrl = generateFrontendUrl(matchingPage);
      }
    }

    return processedLink;
  });
};

/**
 * Generic function to process any widget configuration that contains links/URLs
 * @param config - Widget configuration object
 * @param modulePages - Array of module pages
 * @returns Processed configuration with frontendUrl added to relevant items
 */
export const processWidgetConfig = (config: any, modulePages: ModulePage[]): any => {
  const processedConfig = { ...config };

  // Handle sidebar widget
  if (config.buttons) {
    processedConfig.buttons = processSidebarButtons(config.buttons, modulePages);
  }

  // Handle quick links widget
  if (config.links) {
    processedConfig.links = processQuickLinks(config.links, modulePages);
  }

  // Handle any other widget types with URL arrays
  if (config.items && Array.isArray(config.items)) {
    processedConfig.items = config.items.map((item: any) => {
      if (item.url) {
        const matchingPage = findModulePageByUrl(item.url, modulePages);
        if (matchingPage) {
          return {
            ...item,
            frontendUrl: generateFrontendUrl(matchingPage),
          };
        }
      }
      return item;
    });
  }

  return processedConfig;
};
