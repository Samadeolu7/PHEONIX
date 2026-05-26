import React from 'react';
import { WorkflowAction } from '../../types/automation';
import { Account } from '../../types/accounts';
import styled from 'styled-components';

const ConfigSection = styled.div`
  margin-bottom: 1.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  select,
  input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;

    &[aria-invalid='true'] {
      border-color: #dc3545;
    }
  }

  .error-message {
    color: #dc3545;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
`;

interface TransactionConfigPanelProps {
  action: WorkflowAction;
  accounts: Account[];
  onUpdate: (updates: Partial<WorkflowAction>) => void;
}

export const TransactionConfigPanel: React.FC<TransactionConfigPanelProps> = ({
  action,
  accounts,
  onUpdate,
}) => {
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validate = (config: typeof action.transactionConfig) => {
    const newErrors: Record<string, string> = {};

    if (!config?.type) {
      newErrors.type = 'Transaction type is required';
    }

    if (config?.type === 'loan_disbursement') {
      if (!config.accountIds[0]) {
        newErrors.disbursementAccount = 'Disbursement account is required';
      }
      if (!config.accountIds[1]) {
        newErrors.liabilityAccount = 'Liability account is required';
      }
      if (!config.amount && config.amount !== 0) {
        newErrors.amount = 'Amount is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTypeChange = (type: 'loan_disbursement' | 'income_record' | 'liability_record') => {
    const newConfig = {
      type,
      accountIds: [],
      amount: 0,
    };
    validate(newConfig);
    onUpdate({ transactionConfig: newConfig });
  };

  const handleAccountChange = (index: number, accountId: string) => {
    const accountIds = [...(action.transactionConfig?.accountIds || [])];
    accountIds[index] = accountId;
    const newConfig = {
      type: action.transactionConfig?.type || 'loan_disbursement',
      accountIds,
      amount: action.transactionConfig?.amount || 0,
    };
    validate(newConfig);
    onUpdate({ transactionConfig: newConfig });
  };

  const handleAmountChange = (amount: string) => {
    const newConfig = {
      type: action.transactionConfig?.type || 'loan_disbursement',
      accountIds: action.transactionConfig?.accountIds || [],
      amount: amount.startsWith('${') ? amount : Number(amount),
    };
    validate(newConfig);
    onUpdate({ transactionConfig: newConfig });
  };

  const fieldId = (name: string) => `${action.id}-${name}`;

  return (
    <div className="transaction-config" role="group" aria-label="Transaction configuration">
      <ConfigSection>
        <FormGroup>
          <label htmlFor={fieldId('type')}>Transaction Type</label>
          <select
            id={fieldId('type')}
            value={action.transactionConfig?.type || 'loan_disbursement'}
            onChange={e =>
              handleTypeChange(
                e.target.value as 'loan_disbursement' | 'income_record' | 'liability_record'
              )
            }
            aria-label="Select transaction type"
            aria-required="true"
            aria-invalid={errors.type ? true : false}
            aria-describedby={errors.type ? fieldId('type-error') : undefined}
          >
            <option value="loan_disbursement">Loan Disbursement</option>
            <option value="income_record">Income Record</option>
            <option value="liability_record">Liability Record</option>
          </select>
          {errors.type && (
            <div id={fieldId('type-error')} className="error-message" role="alert">
              {errors.type}
            </div>
          )}
        </FormGroup>
      </ConfigSection>

      {action.transactionConfig?.type === 'loan_disbursement' && (
        <ConfigSection>
          <FormGroup>
            <label htmlFor={fieldId('disbursement-account')}>Disbursement Account</label>
            <select
              id={fieldId('disbursement-account')}
              value={action.transactionConfig.accountIds[0] || ''}
              onChange={e => handleAccountChange(0, e.target.value)}
              aria-label="Select disbursement account"
              aria-required="true"
              aria-invalid={errors.disbursementAccount ? true : false}
              aria-describedby={
                errors.disbursementAccount ? fieldId('disbursement-account-error') : undefined
              }
            >
              <option value="">Select Account</option>
              {accounts
                .filter(acc => acc.type === 'ASSET')
                .map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
            </select>
            {errors.disbursementAccount && (
              <div
                id={fieldId('disbursement-account-error')}
                className="error-message"
                role="alert"
              >
                {errors.disbursementAccount}
              </div>
            )}
          </FormGroup>

          <FormGroup>
            <label htmlFor={fieldId('liability-account')}>Liability Account</label>
            <select
              id={fieldId('liability-account')}
              value={action.transactionConfig.accountIds[1] || ''}
              onChange={e => handleAccountChange(1, e.target.value)}
              aria-label="Select liability account"
              aria-required="true"
              aria-invalid={errors.liabilityAccount ? true : false}
              aria-describedby={
                errors.liabilityAccount ? fieldId('liability-account-error') : undefined
              }
            >
              <option value="">Select Account</option>
              {accounts
                .filter(acc => acc.type === 'LIABILITY')
                .map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
            </select>
            {errors.liabilityAccount && (
              <div id={fieldId('liability-account-error')} className="error-message" role="alert">
                {errors.liabilityAccount}
              </div>
            )}
          </FormGroup>

          <FormGroup>
            <label htmlFor={fieldId('amount')}>Amount Field Reference</label>
            <div role="group" aria-labelledby={fieldId('amount-label')}>
              <input
                id={fieldId('amount')}
                type="text"
                value={action.transactionConfig.amount || ''}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="${loanAmount}"
                aria-label="Enter amount or field reference"
                aria-required="true"
                aria-invalid={errors.amount ? true : false}
                aria-describedby={`${fieldId('amount-help')} ${errors.amount ? fieldId('amount-error') : ''}`}
              />
              <small id={fieldId('amount-help')}>
                Use ${'{fieldName}'} to reference form fields
              </small>
            </div>
          </FormGroup>
        </ConfigSection>
      )}

      {/* Similar sections for income_record and liability_record */}
    </div>
  );
};
