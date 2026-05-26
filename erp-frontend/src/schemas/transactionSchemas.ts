import { createField } from './functionTypeSchemas';

export const transactionTypeSchemas = {
  loan_disbursement: [
    createField('loanAmount', 'Loan Amount', 'number', true),
    createField('interestRate', 'Interest Rate (%)', 'number', true),
    createField('loanTerm', 'Loan Term (Months)', 'number', true),
    createField('disbursementAccount', 'Disbursement Account', 'select', true),
    createField('liabilityAccount', 'Liability Account', 'select', true),
    createField('incomeAccount', 'Interest Income Account', 'select', true),
  ],
  income_record: [
    createField('amount', 'Amount', 'number', true),
    createField('incomeType', 'Income Type', 'select', true),
    createField('account', 'Income Account', 'select', true),
    createField('description', 'Description', 'textarea', true),
  ],
  liability_record: [
    createField('amount', 'Amount', 'number', true),
    createField('liabilityType', 'Liability Type', 'select', true),
    createField('account', 'Liability Account', 'select', true),
    createField('dueDate', 'Due Date', 'date', true),
  ],
};
