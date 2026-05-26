// src/components/workflow/ValidationErrors.tsx
import React from 'react';
import styled from '@emotion/styled';

interface ValidationErrorsProps {
  errors: string[];
}

const ErrorContainer = styled.div`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
`;

const ErrorHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: #dc2626;
  font-weight: 600;

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const ErrorList = styled.ul`
  margin: 0;
  padding-left: 1.25rem;
  color: #b91c1c;
`;

const ErrorItem = styled.li`
  margin-bottom: 0.25rem;
  font-size: 0.875rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const ValidationErrors: React.FC<ValidationErrorsProps> = ({ errors }) => {
  if (errors.length === 0) {
    return null;
  }

  return (
    <ErrorContainer>
      <ErrorHeader>
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        Please fix the following errors:
      </ErrorHeader>
      <ErrorList>
        {errors.map((error, index) => (
          <ErrorItem key={index}>{error}</ErrorItem>
        ))}
      </ErrorList>
    </ErrorContainer>
  );
};
