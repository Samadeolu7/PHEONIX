// src/components/DomainAwareDynamicForm.tsx
/**
 * Wrapper around your existing DynamicForm that applies domain-specific labels.
 * Works with your FormSchema system - no major changes needed.
 */

import React, { useMemo } from 'react';
import { DynamicForm, DynamicFormProps } from './DynamicForm';
import { FormSchema } from '../types/automation.types';
import { useDomain } from '../hooks/useDomain';

interface DomainAwareDynamicFormProps extends Omit<DynamicFormProps, 'schema'> {
  schema: FormSchema;
  entity?: 'client' | 'loan' | 'income'; // Which entity this form is for
}

export const DomainAwareDynamicForm: React.FC<DomainAwareDynamicFormProps> = ({
  schema,
  entity,
  ...props
}) => {
  const { getFieldLabel, isFieldVisible } = useDomain();

  // Transform schema to use domain-specific labels
  const transformedSchema = useMemo((): FormSchema => {
    const schemaAny = schema as any;
    if (!entity || !schemaAny.schema?.fields) {
      return schema;
    }

    // Map fields to domain-specific labels
    const transformedFields = schemaAny.schema.fields
      .map((field: any) => {
        // Check if field should be visible in this domain
        if (!isFieldVisible(entity, field.id)) {
          return null;
        }

        // Get domain-specific label
        const domainLabel = getFieldLabel(entity, field.id);

        return {
          ...field,
          label: domainLabel || field.label, // Use domain label if available
        };
      })
      .filter(Boolean);

    return {
      ...schema,
      schema: {
        ...(schemaAny.schema || {}),
        fields: transformedFields,
      },
    } as any;
  }, [schema, entity, getFieldLabel, isFieldVisible]);

  return <DynamicForm schema={transformedSchema as any} {...props} />;
};

/**
 * Helper to create FormSchema for specific entities with domain awareness
 */
export function createDomainFormSchema(
  entity: 'client' | 'loan' | 'income',
  baseFields: string[],
  _domainType: string = 'microfinance'
): Partial<FormSchema> {
  const { getFieldLabel, isFieldVisible } = useDomain();

  const fields = baseFields
    .filter(fieldName => isFieldVisible(entity, fieldName))
    .map(fieldName => ({
      id: fieldName,
      label: getFieldLabel(entity, fieldName),
      type: inferFieldType(fieldName),
      validation: {
        required: isRequiredField(entity, fieldName),
      },
    }));

  return {
    schema: {
      fields: fields as any,
    },
  } as any;
}

/**
 * Infer field type from field name
 */
function inferFieldType(fieldName: string): any {
  if (fieldName.includes('email')) return 'email';
  if (fieldName.includes('date') || fieldName.includes('_on')) return 'date';
  if (
    fieldName.includes('amount') ||
    fieldName.includes('balance') ||
    fieldName.includes('principal')
  )
    return 'money';
  if (fieldName.includes('rate') || fieldName.includes('percentage')) return 'number';
  if (
    fieldName.includes('status') ||
    fieldName.includes('type') ||
    fieldName.includes('classification')
  )
    return 'select';
  if (fieldName.includes('description') || fieldName.includes('notes')) return 'textarea';
  if (fieldName.includes('phone')) return 'text';
  return 'text';
}

/**
 * Check if field is required based on entity and field name
 */
function isRequiredField(entity: 'client' | 'loan' | 'income', fieldName: string): boolean {
  const requiredFields = {
    client: ['first_name', 'last_name', 'phone_primary', 'date_of_birth'],
    loan: ['principal', 'term_months'],
    income: ['name', 'amount', 'category'],
  };

  return requiredFields[entity]?.includes(fieldName) || false;
}
