import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import styled from 'styled-components';
import {
  Send,
  Upload,
  AlertCircle,
  CheckCircle,
  Calendar,
  DollarSign,
  CreditCard,
} from 'lucide-react';
import { subscriptionService, PaymentSubmission } from '../../services/subscriptionService';

const PageContainer = styled.div`
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #64748b;
`;

const Card = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const InfoBanner = styled.div<{ type: 'info' | 'warning' | 'error' | 'success' }>`
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  display: flex;
  align-items: start;
  gap: 12px;
  background: ${props => {
    switch (props.type) {
      case 'info':
        return '#eff6ff';
      case 'warning':
        return '#fef3c7';
      case 'error':
        return '#fef2f2';
      case 'success':
        return '#ecfdf5';
    }
  }};
  border-left: 4px solid
    ${props => {
      switch (props.type) {
        case 'info':
          return '#3b82f6';
        case 'warning':
          return '#f59e0b';
        case 'error':
          return '#ef4444';
        case 'success':
          return '#10b981';
      }
    }};
`;

const BannerIcon = styled.div<{ type: 'info' | 'warning' | 'error' | 'success' }>`
  color: ${props => {
    switch (props.type) {
      case 'info':
        return '#3b82f6';
      case 'warning':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      case 'success':
        return '#10b981';
    }
  }};
  flex-shrink: 0;
`;

const BannerContent = styled.div``;

const BannerTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: #1a1a2e;
  margin-bottom: 4px;
`;

const BannerText = styled.div`
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Required = styled.span`
  color: #ef4444;
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }

  &:disabled {
    background: #f8fafc;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const TextArea = styled.textarea`
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  min-height: 120px;
  resize: vertical;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const HelpText = styled.div`
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #ef4444;
  margin-top: 4px;
`;

const FileUploadArea = styled.div`
  border: 2px dashed #e2e8f0;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #667eea;
    background: #f8fafc;
  }
`;

const UploadIcon = styled.div`
  margin-bottom: 12px;
  color: #667eea;
  display: flex;
  justify-content: center;
`;

const UploadText = styled.div`
  font-size: 14px;
  color: #1a1a2e;
  font-weight: 600;
  margin-bottom: 4px;
`;

const UploadSubtext = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const FileName = styled.div`
  font-size: 14px;
  color: #667eea;
  margin-top: 12px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;

  ${props =>
    props.variant === 'primary'
      ? `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #5a67d8 0%, #6a3f8f 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    &:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
  `
      : `
    background: #f1f5f9;
    color: #64748b;

    &:hover {
      background: #e2e8f0;
    }
  `}
`;

interface PaymentSubmissionPageProps {
  paymentProof?: any; // For resubmission after rejection
}

const PaymentSubmissionPage: React.FC<PaymentSubmissionPageProps> = ({ paymentProof }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { data: unpaidInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['unpaid-invoices'],
    queryFn: () => subscriptionService.getUnpaidInvoices(),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentSubmission>({
    defaultValues: paymentProof
      ? {
          invoice: paymentProof.invoice,
          amount: paymentProof.amount,
          payment_date: paymentProof.payment_date,
          payment_method: paymentProof.payment_method,
          reference_number: paymentProof.reference_number,
          bank_name: paymentProof.bank_name,
          notes: paymentProof.notes,
        }
      : {},
  });

  const selectedInvoiceId = watch('invoice');
  const selectedInvoice = unpaidInvoices?.find(inv => inv.id === Number(selectedInvoiceId));

  // Auto-fill amount when invoice selected
  React.useEffect(() => {
    if (selectedInvoice) {
      setValue('amount', selectedInvoice.amount);
    }
  }, [selectedInvoice, setValue]);

  const submitMutation = useMutation({
    mutationFn: (data: PaymentSubmission) => subscriptionService.submitPayment(data),
    onSuccess: async data => {
      // If requires proof (resubmission), upload it
      if (data.requires_proof && receiptFile) {
        await subscriptionService.uploadProof(data.id, receiptFile);
      }

      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid-invoices'] });
      navigate('/subscription/dashboard', {
        state: { message: 'Payment submitted successfully! Awaiting admin confirmation.' },
      });
    },
  });

  const onSubmit = (data: PaymentSubmission) => {
    submitMutation.mutate(data);
  };

  const requiresProof = paymentProof?.requires_proof || false;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  return (
    <PageContainer>
      <Header>
        <Title>Submit Payment</Title>
        <Subtitle>Submit your subscription payment details for confirmation</Subtitle>
      </Header>

      <Card>
        {requiresProof ? (
          <InfoBanner type="warning">
            <BannerIcon type="warning">
              <AlertCircle size={20} />
            </BannerIcon>
            <BannerContent>
              <BannerTitle>Payment Proof Required</BannerTitle>
              <BannerText>
                Your previous payment submission was rejected: "{paymentProof?.rejection_reason}".
                Please upload a receipt or screenshot as proof of payment along with corrected
                details.
              </BannerText>
            </BannerContent>
          </InfoBanner>
        ) : (
          <InfoBanner type="info">
            <BannerIcon type="info">
              <AlertCircle size={20} />
            </BannerIcon>
            <BannerContent>
              <BannerTitle>No Receipt Needed</BannerTitle>
              <BannerText>
                Simply provide your payment details with a clear transaction description. Receipt
                upload is only required if your submission is rejected. Make sure to include your
                transaction reference number and detailed notes to help us verify your payment
                quickly.
              </BannerText>
            </BannerContent>
          </InfoBanner>
        )}

        <Form onSubmit={handleSubmit(onSubmit)}>
          <FormGroup>
            <Label>
              <CreditCard size={16} />
              Select Invoice <Required>*</Required>
            </Label>
            <Select {...register('invoice', { required: 'Please select an invoice' })}>
              <option value="">Choose an unpaid invoice</option>
              {unpaidInvoices?.map(invoice => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} - {formatCurrency(invoice.amount)} (Due:{' '}
                  {new Date(invoice.due_date).toLocaleDateString()})
                </option>
              ))}
            </Select>
            {errors.invoice && <ErrorText>{errors.invoice.message}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label>
              <DollarSign size={16} />
              Amount <Required>*</Required>
            </Label>
            <Input
              type="number"
              step="0.01"
              {...register('amount', {
                required: 'Amount is required',
                min: { value: 0.01, message: 'Amount must be greater than 0' },
              })}
              disabled={!!selectedInvoice}
            />
            {errors.amount && <ErrorText>{errors.amount.message}</ErrorText>}
            <HelpText>Amount is auto-filled from selected invoice</HelpText>
          </FormGroup>

          <FormGroup>
            <Label>
              <Calendar size={16} />
              Payment Date <Required>*</Required>
            </Label>
            <Input
              type="date"
              {...register('payment_date', { required: 'Payment date is required' })}
              max={new Date().toISOString().split('T')[0]}
            />
            {errors.payment_date && <ErrorText>{errors.payment_date.message}</ErrorText>}
            <HelpText>Date when you made the payment</HelpText>
          </FormGroup>

          <FormGroup>
            <Label>
              Payment Method <Required>*</Required>
            </Label>
            <Select {...register('payment_method', { required: 'Payment method is required' })}>
              <option value="">Choose payment method</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="card">Card Payment</option>
              <option value="cash">Cash Deposit</option>
              <option value="cheque">Cheque</option>
            </Select>
            {errors.payment_method && <ErrorText>{errors.payment_method.message}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label>
              Transaction Reference <Required>*</Required>
            </Label>
            <Input
              type="text"
              placeholder="e.g., TXN-ABC123456"
              {...register('reference_number', { required: 'Reference number is required' })}
            />
            {errors.reference_number && <ErrorText>{errors.reference_number.message}</ErrorText>}
            <HelpText>Your transaction reference/confirmation number from the bank</HelpText>
          </FormGroup>

          <FormGroup>
            <Label>Bank Name</Label>
            <Input
              type="text"
              placeholder="e.g., First Bank of Nigeria"
              {...register('bank_name')}
            />
            <HelpText>Optional - Name of bank used for payment</HelpText>
          </FormGroup>

          <FormGroup>
            <Label>
              Payment Description <Required>*</Required>
            </Label>
            <TextArea
              placeholder={`Please include detailed transaction information such as:
- Account number you paid from
- Exact time of transaction
- Branch/location (if applicable)
- Any additional verification details`}
              {...register('notes', {
                required: 'Please provide detailed payment description',
                minLength: {
                  value: 20,
                  message: 'Please provide more details (at least 20 characters)',
                },
              })}
            />
            {errors.notes && <ErrorText>{errors.notes.message}</ErrorText>}
            <HelpText>
              <strong>Important:</strong> Include enough details for easy verification (account
              number, time, branch, etc.)
            </HelpText>
          </FormGroup>

          {requiresProof && (
            <FormGroup>
              <Label>
                <Upload size={16} />
                Upload Receipt <Required>*</Required>
              </Label>
              <FileUploadArea onClick={() => document.getElementById('receipt-upload')?.click()}>
                <input
                  id="receipt-upload"
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) setReceiptFile(file);
                  }}
                />
                <UploadIcon>
                  <Upload size={32} />
                </UploadIcon>
                <UploadText>{receiptFile ? 'Change Receipt' : 'Upload Receipt'}</UploadText>
                <UploadSubtext>Click to browse (Image or PDF, max 5MB)</UploadSubtext>
                {receiptFile && <FileName>{receiptFile.name}</FileName>}
              </FileUploadArea>
              <HelpText>Required because your previous submission was rejected</HelpText>
            </FormGroup>
          )}

          <ButtonGroup>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitMutation.isPending || (requiresProof && !receiptFile)}
            >
              {submitMutation.isPending ? (
                'Submitting...'
              ) : (
                <>
                  <Send size={16} />
                  Submit Payment
                </>
              )}
            </Button>
          </ButtonGroup>
        </Form>
      </Card>
    </PageContainer>
  );
};

export default PaymentSubmissionPage;
