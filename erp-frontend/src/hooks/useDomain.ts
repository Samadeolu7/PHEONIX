// src/hooks/useDomain.ts
/**
 * Hook for accessing domain-specific configuration and labels.
 * Works with your existing TenantContext.
 */

import { useMemo } from 'react';
import { useTenant } from '../contexts/TenantContext';
import {
  DomainType,
  DomainConfig,
  getDomainConfig,
  getFieldLabel as getFieldLabelUtil,
  isFieldVisible as isFieldVisibleUtil,
  getEntityName as getEntityNameUtil,
  getEntityNamePlural as getEntityNamePluralUtil,
  getDocumentTypeLabel as getDocumentTypeLabelUtil,
  getRelationshipTypeLabel as getRelationshipTypeLabelUtil,
} from '../config/domainConfig';

export interface UseDomainReturn {
  domainType: DomainType;
  config: DomainConfig;

  // Helper functions
  getFieldLabel: (entity: 'client' | 'loan' | 'income', fieldName: string) => string;
  isFieldVisible: (entity: 'client' | 'loan' | 'income', fieldName: string) => boolean;
  getEntityName: (entity: 'client' | 'loan' | 'income') => string;
  getEntityNamePlural: (entity: 'client' | 'loan' | 'income') => string;
  getDocumentTypeLabel: (documentType: string) => string;
  getRelationshipTypeLabel: (relationshipType: string) => string;

  // Quick access to common labels
  clientLabel: string;
  clientsLabel: string;
  loanLabel: string;
  loansLabel: string;
  incomeLabel: string;
  incomesLabel: string;
}

/**
 * Main hook for domain-aware labeling
 */
export function useDomain(): UseDomainReturn {
  const { tenant } = useTenant();

  // Get domain type from tenant settings, default to microfinance
  const domainType: DomainType = useMemo(() => {
    if (tenant?.settings?.domain_type) {
      return tenant.settings.domain_type as DomainType;
    }
    return 'microfinance';
  }, [tenant]);

  // Get config
  const config = useMemo(() => getDomainConfig(domainType), [domainType]);

  // Create helper functions bound to current domain
  const helpers = useMemo(
    () => ({
      getFieldLabel: (entity: 'client' | 'loan' | 'income', fieldName: string) =>
        getFieldLabelUtil(domainType, entity, fieldName),

      isFieldVisible: (entity: 'client' | 'loan' | 'income', fieldName: string) =>
        isFieldVisibleUtil(domainType, entity, fieldName),

      getEntityName: (entity: 'client' | 'loan' | 'income') =>
        getEntityNameUtil(domainType, entity),

      getEntityNamePlural: (entity: 'client' | 'loan' | 'income') =>
        getEntityNamePluralUtil(domainType, entity),

      getDocumentTypeLabel: (documentType: string) =>
        getDocumentTypeLabelUtil(domainType, documentType),

      getRelationshipTypeLabel: (relationshipType: string) =>
        getRelationshipTypeLabelUtil(domainType, relationshipType),

      // Quick access labels
      clientLabel: getEntityNameUtil(domainType, 'client'),
      clientsLabel: getEntityNamePluralUtil(domainType, 'client'),
      loanLabel: getEntityNameUtil(domainType, 'loan'),
      loansLabel: getEntityNamePluralUtil(domainType, 'loan'),
      incomeLabel: getEntityNameUtil(domainType, 'income'),
      incomesLabel: getEntityNamePluralUtil(domainType, 'income'),
    }),
    [domainType]
  );

  return {
    domainType,
    config,
    ...helpers,
  };
}

/**
 * Hook to get filtered fields for a form or table
 * Returns only visible fields with domain-specific labels
 */
export function useDomainFields(entity: 'client' | 'loan' | 'income', allFields: string[]) {
  const { domainType, getFieldLabel, isFieldVisible } = useDomain();

  return useMemo(() => {
    return allFields
      .filter(fieldName => isFieldVisible(fieldName))
      .map(fieldName => ({
        name: fieldName,
        label: getFieldLabel(entity, fieldName),
      }));
  }, [entity, allFields, domainType]);
}

/**
 * Hook to transform data with domain-specific labels
 * Useful for displaying data in tables/cards
 */
export function useDomainData<T extends Record<string, any>>(
  entity: 'client' | 'loan' | 'income',
  data: T
): Record<string, any> {
  const { getFieldLabel, isFieldVisible } = useDomain();

  return useMemo(() => {
    const transformed: Record<string, any> = {};

    Object.keys(data).forEach(fieldName => {
      if (isFieldVisible(entity, fieldName)) {
        const label = getFieldLabel(entity, fieldName);
        if (label) {
          transformed[label] = data[fieldName];
        }
      }
    });

    return transformed;
  }, [entity, data]);
}
