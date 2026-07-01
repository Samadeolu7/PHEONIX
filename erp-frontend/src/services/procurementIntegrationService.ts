// src/services/procurementIntegrationService.ts
import { procurementService } from './procurementService';
import { inventoryService } from './inventoryService';
import { accountService } from './accountService';
import { mulDecimals } from '../utils/decimal';
import {
  GoodsReceivedNote,
  PurchaseReturn,
  InventoryMovement,
  JournalEntry,
  AccountsPayableEntry,
  BudgetTransaction,
  StockUpdate,
  GRNIntegrationStatus,
  ReturnIntegrationStatus,
  BatchProcessingResult,
} from '../types/procurement';

export interface IntegrationPostingData {
  posting_date: string;
  cost_center_id?: number;
  budget_code_id?: number;
  notes?: string;
}

export interface InventoryPostingResult {
  success: boolean;
  movements: InventoryMovement[];
  stock_updates: StockUpdate[];
  errors?: string[];
}

export interface AccountingPostingResult {
  success: boolean;
  journal_entries: JournalEntry[];
  accounts_payable_entries: AccountsPayableEntry[];
  budget_transactions: BudgetTransaction[];
  errors?: string[];
}

export interface IntegrationResult {
  success: boolean;
  inventory_result?: InventoryPostingResult;
  accounting_result?: AccountingPostingResult;
  errors: string[];
  warnings: string[];
}

class ProcurementIntegrationService {
  // ============================================================================
  // GRN INTEGRATION METHODS
  // ============================================================================

  /**
   * Post GRN to inventory system - creates inventory movements and updates stock levels
   */
  async postGRNToInventory(
    grnId: number,
    postingData: IntegrationPostingData
  ): Promise<InventoryPostingResult> {
    try {
      // Get GRN details
      const grn = await procurementService.getGRN(grnId);

      const movements: InventoryMovement[] = [];
      const stock_updates: StockUpdate[] = [];
      const errors: string[] = [];

      // Process each GRN item
      for (const grnItem of grn.items) {
        if (grnItem.quantity_accepted > 0) {
          try {
            // Create inventory movement for accepted quantity
            const movement = await procurementService.createInventoryMovement({
              item_id: grnItem.po_item.item_id,
              location_id: grn.delivery_information.received_by_id, // Assuming location mapping
              movement_type: 'receipt',
              quantity: grnItem.quantity_accepted.toString(),
              unit_cost: grnItem.unit_cost,
              total_cost: mulDecimals(grnItem.quantity_accepted, grnItem.unit_cost).toFixed(2),
              reference_number: grn.grn_number,
              reference_type: 'grn',
              reference_id: grnId,
              batch_number: grnItem.batch_tracking.batch_number,
              serial_number: grnItem.batch_tracking.serial_number,
              expiry_date: grnItem.batch_tracking.expiry_date,
              movement_date: postingData.posting_date,
              notes: postingData.notes || `GRN Receipt - ${grn.grn_number}`,
            });

            movements.push(movement);

            // Update stock levels
            const stockUpdate = await procurementService.updateStockLevels({
              item_id: grnItem.po_item.item_id,
              location_id: grn.delivery_information.received_by_id,
              quantity_change: grnItem.quantity_accepted.toString(),
              unit_cost: grnItem.unit_cost,
              reference_type: 'grn',
              reference_id: grnId,
              movement_date: postingData.posting_date,
            });

            stock_updates.push(stockUpdate);
          } catch (error) {
            errors.push(
              `Failed to process item ${grnItem.po_item.item.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        movements,
        stock_updates,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        movements: [],
        stock_updates: [],
        errors: [error instanceof Error ? error.message : 'Failed to post GRN to inventory'],
      };
    }
  }

  /**
   * Post GRN to accounting system - creates journal entries and accounts payable
   */
  async postGRNToAccounting(
    grnId: number,
    postingData: IntegrationPostingData
  ): Promise<AccountingPostingResult> {
    try {
      // Get GRN details
      const grn = await procurementService.getGRN(grnId);

      const journal_entries: JournalEntry[] = [];
      const accounts_payable_entries: AccountsPayableEntry[] = [];
      const budget_transactions: BudgetTransaction[] = [];
      const errors: string[] = [];

      // Calculate total accepted value
      const totalAcceptedValue = grn.items.reduce(
        (sum, item) => sum + item.quantity_accepted * parseFloat(item.unit_cost),
        0
      );

      if (totalAcceptedValue > 0) {
        try {
          // Create journal entry for inventory receipt
          const journalEntry = await procurementService.createJournalEntry({
            entry_date: postingData.posting_date,
            description: `Goods Receipt - ${grn.grn_number}`,
            reference_type: 'grn',
            reference_id: grnId,
            reference_number: grn.grn_number,
            line_items: [
              {
                account_id: '1300', // Inventory Asset Account
                description: `Inventory Receipt - ${grn.grn_number}`,
                debit_amount: totalAcceptedValue.toString(),
                cost_center_id: postingData.cost_center_id,
                budget_code_id: postingData.budget_code_id,
              },
              {
                account_id: '2100', // Accounts Payable
                description: `Supplier Liability - ${grn.purchase_order.supplier.name}`,
                credit_amount: totalAcceptedValue.toString(),
                cost_center_id: postingData.cost_center_id,
              },
            ],
          });

          journal_entries.push(journalEntry);

          // Create accounts payable entry
          const apEntry = await procurementService.createAccountsPayableEntry({
            supplier_id: grn.purchase_order.supplier_id,
            invoice_number: grn.delivery_information.delivery_note_number,
            invoice_date: grn.received_date,
            due_date: this.calculateDueDate(
              grn.received_date,
              grn.purchase_order.payment_terms || 'net_30'
            ),
            amount: totalAcceptedValue.toString(),
            tax_amount: '0.00', // Calculate tax if needed
            total_amount: totalAcceptedValue.toString(),
            reference_type: 'grn',
            reference_id: grnId,
            reference_number: grn.grn_number,
            payment_terms: grn.purchase_order.payment_terms || 'net_30',
            notes: postingData.notes,
          });

          accounts_payable_entries.push(apEntry);

          // Create budget transaction if budget code is specified
          if (postingData.budget_code_id) {
            const budgetTransaction = await procurementService.createBudgetTransaction({
              budget_code_id: postingData.budget_code_id,
              transaction_date: postingData.posting_date,
              reference_type: 'grn',
              reference_id: grnId,
              reference_number: grn.grn_number,
              description: `Goods Receipt - ${grn.grn_number}`,
              amount: totalAcceptedValue.toString(),
              transaction_type: 'utilization',
            });

            budget_transactions.push(budgetTransaction);

            // Update budget utilization
            await procurementService.updateBudgetUtilization(postingData.budget_code_id, {
              utilized_amount: totalAcceptedValue.toString(),
              transaction_date: postingData.posting_date,
            });
          }
        } catch (error) {
          errors.push(
            `Failed to create accounting entries: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      return {
        success: errors.length === 0,
        journal_entries,
        accounts_payable_entries,
        budget_transactions,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        journal_entries: [],
        accounts_payable_entries: [],
        budget_transactions: [],
        errors: [error instanceof Error ? error.message : 'Failed to post GRN to accounting'],
      };
    }
  }

  /**
   * Post GRN to both inventory and accounting systems
   */
  async postGRNToBothSystems(
    grnId: number,
    postingData: IntegrationPostingData
  ): Promise<IntegrationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Post to inventory first
    const inventoryResult = await this.postGRNToInventory(grnId, postingData);
    if (!inventoryResult.success && inventoryResult.errors) {
      errors.push(...inventoryResult.errors);
    }

    // Post to accounting
    const accountingResult = await this.postGRNToAccounting(grnId, postingData);
    if (!accountingResult.success && accountingResult.errors) {
      errors.push(...accountingResult.errors);
    }

    // Update GRN status if both successful
    if (inventoryResult.success && accountingResult.success) {
      try {
        await procurementService.updateGRN(grnId, {
          status: 'posted' as any,
          posted_to_inventory: true,
          posted_to_accounting: true,
          inventory_posting_date: postingData.posting_date,
          accounting_posting_date: postingData.posting_date,
        });
      } catch (error) {
        warnings.push('Failed to update GRN status after successful posting');
      }
    }

    return {
      success: inventoryResult.success && accountingResult.success,
      inventory_result: inventoryResult,
      accounting_result: accountingResult,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // PURCHASE RETURN INTEGRATION METHODS
  // ============================================================================

  /**
   * Post purchase return to inventory system - reverses inventory movements
   */
  async postReturnToInventory(
    returnId: number,
    postingData: IntegrationPostingData
  ): Promise<InventoryPostingResult> {
    try {
      // Get return details
      const purchaseReturn = await procurementService.getPurchaseReturn(returnId);

      const movements: InventoryMovement[] = [];
      const stock_updates: StockUpdate[] = [];
      const errors: string[] = [];

      // Process each return item
      for (const returnItem of purchaseReturn.items) {
        if (returnItem.quantity_returned > 0) {
          try {
            // Create inventory movement for returned quantity (negative)
            const movement = await procurementService.createInventoryMovement({
              item_id: returnItem.grn_item.item_id,
              location_id: returnItem.grn_item.item_id, // Get from GRN location
              movement_type: 'return',
              quantity: (-returnItem.quantity_returned).toString(), // Negative quantity
              unit_cost: returnItem.return_cost,
              total_cost: (
                -returnItem.quantity_returned * parseFloat(returnItem.return_cost)
              ).toString(),
              reference_number: purchaseReturn.return_number,
              reference_type: 'return',
              reference_id: returnId,
              movement_date: postingData.posting_date,
              notes: postingData.notes || `Purchase Return - ${purchaseReturn.return_number}`,
            });

            movements.push(movement);

            // Update stock levels (decrease)
            const stockUpdate = await procurementService.updateStockLevels({
              item_id: returnItem.grn_item.item_id,
              location_id: returnItem.grn_item.item_id,
              quantity_change: (-returnItem.quantity_returned).toString(),
              unit_cost: returnItem.return_cost,
              reference_type: 'return',
              reference_id: returnId,
              movement_date: postingData.posting_date,
            });

            stock_updates.push(stockUpdate);
          } catch (error) {
            errors.push(
              `Failed to process return item ${returnItem.grn_item.item.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        movements,
        stock_updates,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        movements: [],
        stock_updates: [],
        errors: [error instanceof Error ? error.message : 'Failed to post return to inventory'],
      };
    }
  }

  /**
   * Post purchase return to accounting system - creates credit entries
   */
  async postReturnToAccounting(
    returnId: number,
    postingData: IntegrationPostingData
  ): Promise<AccountingPostingResult> {
    try {
      // Get return details
      const purchaseReturn = await procurementService.getPurchaseReturn(returnId);

      const journal_entries: JournalEntry[] = [];
      const accounts_payable_entries: AccountsPayableEntry[] = [];
      const budget_transactions: BudgetTransaction[] = [];
      const errors: string[] = [];

      // Calculate total return value
      const totalReturnValue = parseFloat(purchaseReturn.total_return_value);

      if (totalReturnValue > 0) {
        try {
          // Create journal entry for return
          const journalEntry = await procurementService.createJournalEntry({
            entry_date: postingData.posting_date,
            description: `Purchase Return - ${purchaseReturn.return_number}`,
            reference_type: 'return',
            reference_id: returnId,
            reference_number: purchaseReturn.return_number,
            line_items: [
              {
                account_id: '2100', // Accounts Payable (debit to reduce liability)
                description: `Return Credit - ${purchaseReturn.supplier_name}`,
                debit_amount: totalReturnValue.toString(),
                cost_center_id: postingData.cost_center_id,
              },
              {
                account_id: '1300', // Inventory Asset Account (credit to reduce asset)
                description: `Inventory Return - ${purchaseReturn.return_number}`,
                credit_amount: totalReturnValue.toString(),
                cost_center_id: postingData.cost_center_id,
                budget_code_id: postingData.budget_code_id,
              },
            ],
          });

          journal_entries.push(journalEntry);

          // Update existing accounts payable entry or create credit
          if (purchaseReturn.credit_note_number) {
            const apEntry = await procurementService.createAccountsPayableEntry({
              supplier_id: purchaseReturn.supplier,
              invoice_number: purchaseReturn.credit_note_number,
              invoice_date: purchaseReturn.return_date,
              due_date: purchaseReturn.return_date, // Credit notes are immediate
              amount: (-totalReturnValue).toString(), // Negative amount for credit
              tax_amount: '0.00',
              total_amount: (-totalReturnValue).toString(),
              reference_type: 'return',
              reference_id: returnId,
              reference_number: purchaseReturn.return_number,
              payment_terms: 'immediate',
              notes: postingData.notes,
            });

            accounts_payable_entries.push(apEntry);
          }

          // Create budget transaction reversal if budget code is specified
          if (postingData.budget_code_id) {
            const budgetTransaction = await procurementService.createBudgetTransaction({
              budget_code_id: postingData.budget_code_id,
              transaction_date: postingData.posting_date,
              reference_type: 'return',
              reference_id: returnId,
              reference_number: purchaseReturn.return_number,
              description: `Purchase Return - ${purchaseReturn.return_number}`,
              amount: totalReturnValue.toString(),
              transaction_type: 'reversal',
            });

            budget_transactions.push(budgetTransaction);

            // Update budget utilization (reduce utilized amount)
            await procurementService.updateBudgetUtilization(postingData.budget_code_id, {
              utilized_amount: (-totalReturnValue).toString(),
              transaction_date: postingData.posting_date,
            });
          }
        } catch (error) {
          errors.push(
            `Failed to create accounting entries: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      return {
        success: errors.length === 0,
        journal_entries,
        accounts_payable_entries,
        budget_transactions,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        journal_entries: [],
        accounts_payable_entries: [],
        budget_transactions: [],
        errors: [error instanceof Error ? error.message : 'Failed to post return to accounting'],
      };
    }
  }

  /**
   * Post purchase return to both inventory and accounting systems
   */
  async postReturnToBothSystems(
    returnId: number,
    postingData: IntegrationPostingData
  ): Promise<IntegrationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Post to inventory first
    const inventoryResult = await this.postReturnToInventory(returnId, postingData);
    if (!inventoryResult.success && inventoryResult.errors) {
      errors.push(...inventoryResult.errors);
    }

    // Post to accounting
    const accountingResult = await this.postReturnToAccounting(returnId, postingData);
    if (!accountingResult.success && accountingResult.errors) {
      errors.push(...accountingResult.errors);
    }

    // Update return status if both successful
    if (inventoryResult.success && accountingResult.success) {
      try {
        await procurementService.updatePurchaseReturn(returnId, {
          status: 'completed' as any,
        });
      } catch (error) {
        warnings.push('Failed to update return status after successful posting');
      }
    }

    return {
      success: inventoryResult.success && accountingResult.success,
      inventory_result: inventoryResult,
      accounting_result: accountingResult,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // BATCH PROCESSING METHODS
  // ============================================================================

  /**
   * Batch process multiple GRNs to both systems
   */
  async batchProcessGRNs(
    grnIds: number[],
    postingData: IntegrationPostingData
  ): Promise<BatchProcessingResult> {
    const successful: number[] = [];
    const failed_items: { id: number; error_message: string; error_code?: string }[] = [];
    let totalValueProcessed = 0;
    let inventoryUpdates = 0;
    let accountingEntries = 0;
    let budgetTransactions = 0;

    for (const grnId of grnIds) {
      try {
        const result = await this.postGRNToBothSystems(grnId, postingData);

        if (result.success) {
          successful.push(grnId);

          // Count processing results
          if (result.inventory_result) {
            inventoryUpdates += result.inventory_result.movements.length;
            totalValueProcessed += result.inventory_result.movements.reduce(
              (sum, m) => sum + parseFloat(m.total_cost),
              0
            );
          }

          if (result.accounting_result) {
            accountingEntries += result.accounting_result.journal_entries.length;
            budgetTransactions += result.accounting_result.budget_transactions.length;
          }
        } else {
          failed_items.push({
            id: grnId,
            error_message: result.errors.join('; '),
            error_code: 'INTEGRATION_FAILED',
          });
        }
      } catch (error) {
        failed_items.push({
          id: grnId,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          error_code: 'PROCESSING_ERROR',
        });
      }
    }

    return {
      total_processed: grnIds.length,
      successful: successful.length,
      failed: failed_items.length,
      success_ids: successful,
      failed_items,
      processing_summary: {
        inventory_updates: inventoryUpdates,
        accounting_entries: accountingEntries,
        budget_transactions: budgetTransactions,
        total_value_processed: totalValueProcessed.toString(),
      },
    };
  }

  /**
   * Batch process multiple returns to both systems
   */
  async batchProcessReturns(
    returnIds: number[],
    postingData: IntegrationPostingData
  ): Promise<BatchProcessingResult> {
    const successful: number[] = [];
    const failed_items: { id: number; error_message: string; error_code?: string }[] = [];
    let totalValueProcessed = 0;
    let inventoryUpdates = 0;
    let accountingEntries = 0;
    let budgetTransactions = 0;

    for (const returnId of returnIds) {
      try {
        const result = await this.postReturnToBothSystems(returnId, postingData);

        if (result.success) {
          successful.push(returnId);

          // Count processing results
          if (result.inventory_result) {
            inventoryUpdates += result.inventory_result.movements.length;
            totalValueProcessed += Math.abs(
              result.inventory_result.movements.reduce(
                (sum, m) => sum + parseFloat(m.total_cost),
                0
              )
            );
          }

          if (result.accounting_result) {
            accountingEntries += result.accounting_result.journal_entries.length;
            budgetTransactions += result.accounting_result.budget_transactions.length;
          }
        } else {
          failed_items.push({
            id: returnId,
            error_message: result.errors.join('; '),
            error_code: 'INTEGRATION_FAILED',
          });
        }
      } catch (error) {
        failed_items.push({
          id: returnId,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          error_code: 'PROCESSING_ERROR',
        });
      }
    }

    return {
      total_processed: returnIds.length,
      successful: successful.length,
      failed: failed_items.length,
      success_ids: successful,
      failed_items,
      processing_summary: {
        inventory_updates: inventoryUpdates,
        accounting_entries: accountingEntries,
        budget_transactions: budgetTransactions,
        total_value_processed: totalValueProcessed.toString(),
      },
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Calculate due date based on payment terms
   */
  private calculateDueDate(invoiceDate: string, paymentTerms: string): string {
    const date = new Date(invoiceDate);

    switch (paymentTerms) {
      case 'cash':
        return invoiceDate; // Same day
      case 'net_15':
        date.setDate(date.getDate() + 15);
        break;
      case 'net_30':
        date.setDate(date.getDate() + 30);
        break;
      case 'net_60':
        date.setDate(date.getDate() + 60);
        break;
      case 'net_90':
        date.setDate(date.getDate() + 90);
        break;
      default:
        date.setDate(date.getDate() + 30); // Default to 30 days
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Get integration status for a GRN
   */
  async getGRNIntegrationStatus(grnId: number): Promise<GRNIntegrationStatus> {
    return await procurementService.getGRNIntegrationStatus(grnId);
  }

  /**
   * Get integration status for a purchase return
   */
  async getReturnIntegrationStatus(returnId: number): Promise<ReturnIntegrationStatus> {
    return await procurementService.getReturnIntegrationStatus(returnId);
  }

  /**
   * Get pending integrations
   */
  async getPendingIntegrations(params?: {
    type?: 'grn' | 'return';
    system?: 'inventory' | 'accounting' | 'both';
    page?: number;
  }) {
    return await procurementService.getPendingIntegrations(params);
  }
}

export const procurementIntegrationService = new ProcurementIntegrationService();
