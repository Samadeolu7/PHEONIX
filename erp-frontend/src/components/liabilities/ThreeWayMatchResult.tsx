import React from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Dialog, {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

import { Button } from '@/components/ui/Button';

import Textarea from '@/components/ui/Textarea';

import { Input } from '@/components/ui/Input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

import { Alert, AlertDescription } from '@/components/ui/Alert';

import { Label } from '../ui/Label';
import { ThreeWayMatchResult } from '../../types/liabilities';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

// ============================================================================
// THREE WAY MATCH RESULT DISPLAY
// ============================================================================

interface ThreeWayMatchResultDisplayProps {
  result: ThreeWayMatchResult;
}

export const ThreeWayMatchResultDisplay: React.FC<ThreeWayMatchResultDisplayProps> = ({
  result,
}) => {
  const getIcon = () => {
    if (result.valid) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    return <XCircle className="h-5 w-5 text-destructive" />;
  };

  const getVariant = (): 'default' | 'destructive' => {
    return result.valid ? 'default' : 'destructive';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getIcon()}
            <CardTitle className="text-lg">3-Way Match Validation</CardTitle>
          </div>
          <Badge variant={getVariant()}>{result.valid ? 'PASSED' : 'FAILED'}</Badge>
        </div>
        <CardDescription>
          Validation of Purchase Order, Goods Receipt Note, and Invoice
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Match Status Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">PO Match</span>
              {result.po_matches ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            {result.po_amount && (
              <p className="text-sm text-muted-foreground">
                Amount: {formatCurrency(parseFloat(result.po_amount))}
              </p>
            )}
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">GRN Match</span>
              {result.grn_matches ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            {result.grn_amount && (
              <p className="text-sm text-muted-foreground">
                Amount: {formatCurrency(parseFloat(result.grn_amount))}
              </p>
            )}
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Invoice Match</span>
              {result.invoice_matches ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            {result.invoice_amount && (
              <p className="text-sm text-muted-foreground">
                Amount: {formatCurrency(parseFloat(result.invoice_amount))}
              </p>
            )}
          </div>
        </div>

        {/* Variance */}
        {result.variance && parseFloat(result.variance) !== 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Variance Detected:</strong> {formatCurrency(parseFloat(result.variance))}
            </AlertDescription>
          </Alert>
        )}

        {/* Messages */}
        {result.messages && result.messages.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Validation Messages</h4>
            <div className="space-y-1">
              {result.messages.map((message, index) => (
                <Alert key={index} variant={result.valid ? 'default' : 'destructive'}>
                  <AlertDescription className="text-sm">{message}</AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ThreeWayMatchResultDisplay;
