# automations/workflow_definitions/inventory_workflows.py
"""
Workflow definitions for inventory, purchasing, and expense scenarios

These would be created as WorkflowTemplate records in the database
"""

# ================================================================
# SCENARIO 1: Buy Inventory Item
# ================================================================

BUY_INVENTORY_WORKFLOW = {
    "name": "Purchase Inventory Item",
    "code": "purchase_inventory",
    "description": "Buy item, record expense, increase inventory",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "inventory.purchase_received"
    },
    "workflow_definition": {
        "steps": [
            {
                "id": "validate_grn",
                "name": "Validate Goods Received Note",
                "type": "condition",
                "config": {
                    "conditions": [
                        {
                            "field": "form.quantity_received",
                            "operator": ">",
                            "value": 0
                        },
                        {
                            "field": "form.unit_cost",
                            "operator": ">",
                            "value": 0
                        }
                    ],
                    "logic": "AND"
                },
                "on_true": "update_inventory_stock",
                "on_false": "send_error_notification"
            },
            {
                "id": "update_inventory_stock",
                "name": "Update Inventory Stock Levels",
                "type": "update",
                "config": {
                    "entity": "InventoryStock",
                    "id": "${form.inventory_stock_id}",
                    "fields": {
                        "quantity_on_hand": "${calculated.new_quantity}",
                        "average_cost": "${calculated.new_average_cost}"
                    }
                },
                "next": "create_stock_movement"
            },
            {
                "id": "create_stock_movement",
                "name": "Record Stock Movement",
                "type": "update",
                "config": {
                    "entity": "StockMovement",
                    "operation": "create",
                    "fields": {
                        "item_id": "${form.item_id}",
                        "movement_type": "purchase",
                        "to_location_id": "${form.location_id}",
                        "quantity": "${form.quantity_received}",
                        "unit_cost": "${form.unit_cost}",
                        "reference_number": "${form.grn_number}"
                    }
                },
                "next": "create_purchase_transaction"
            },
            {
                "id": "create_purchase_transaction",
                "name": "Create Accounting Entry",
                "type": "transaction",
                "config": {
                    "transaction_type": "double_entry",
                    "series_code": "PUR",
                    "date": "${form.received_date}",
                    "description": "Purchase: ${form.item_name} x ${form.quantity_received}",
                    "entries": [
                        {
                            "account_id": "${item.category.inventory_account_id}",
                            "side": "DR",
                            "amount": "${calculated.total_cost}",
                            "description": "Inventory received"
                        },
                        {
                            "account_id": "${form.payment_account_id}",
                            "side": "CR",
                            "amount": "${calculated.total_cost}",
                            "description": "Payment for purchase"
                        }
                    ]
                },
                "next": "send_purchase_notification"
            },
            {
                "id": "send_purchase_notification",
                "name": "Send Purchase Confirmation",
                "type": "notification",
                "config": {
                    "template_code": "inventory_purchased",
                    "recipient_source": "user",
                    "channels": ["in_app", "email"],
                    "context_mapping": {
                        "item_name": "${form.item_name}",
                        "quantity": "${form.quantity_received}",
                        "total_cost": "${calculated.total_cost}",
                        "transaction_ref": "${step_create_purchase_transaction.reference_number}"
                    }
                },
                "next": None
            },
            {
                "id": "send_error_notification",
                "name": "Send Error Notification",
                "type": "notification",
                "config": {
                    "template_code": "workflow_error",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "error_message": "Invalid GRN data"
                    }
                },
                "next": None
            }
        ],
        "initial_step": "validate_grn"
    }
}

# ================================================================
# SCENARIO 2: Sell Inventory Item
# ================================================================

SELL_INVENTORY_WORKFLOW = {
    "name": "Sell Inventory Item",
    "code": "sell_inventory",
    "description": "Reduce inventory, record COGS and Income",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "inventory.sale_processed"
    },
    "workflow_definition": {
        "steps": [
            {
                "id": "validate_stock",
                "name": "Check Stock Availability",
                "type": "query",
                "config": {
                    "entity": "InventoryStock",
                    "where": {
                        "item_id": "${form.item_id}",
                        "location_id": "${form.location_id}"
                    },
                    "select": ["quantity_available", "average_cost"]
                },
                "next": "check_quantity"
            },
            {
                "id": "check_quantity",
                "name": "Verify Sufficient Stock",
                "type": "condition",
                "config": {
                    "conditions": [
                        {
                            "field": "step_validate_stock.results.0.quantity_available",
                            "operator": ">=",
                            "value": "${form.quantity}"
                        }
                    ],
                    "logic": "AND"
                },
                "on_true": "calculate_cogs",
                "on_false": "send_insufficient_stock_error"
            },
            {
                "id": "calculate_cogs",
                "name": "Calculate Cost of Goods Sold",
                "type": "calculation",
                "config": {
                    "formula": "quantity * average_cost",
                    "variables": {
                        "quantity": "form.quantity",
                        "average_cost": "step_validate_stock.results.0.average_cost"
                    }
                },
                "next": "reduce_inventory"
            },
            {
                "id": "reduce_inventory",
                "name": "Reduce Inventory Quantity",
                "type": "update",
                "config": {
                    "entity": "InventoryStock",
                    "id": "${form.inventory_stock_id}",
                    "fields": {
                        "quantity_on_hand": "${calculated.new_quantity}",
                        "quantity_available": "${calculated.new_available}"
                    }
                },
                "next": "record_stock_movement"
            },
            {
                "id": "record_stock_movement",
                "name": "Record Stock Movement",
                "type": "update",
                "config": {
                    "entity": "StockMovement",
                    "operation": "create",
                    "fields": {
                        "item_id": "${form.item_id}",
                        "movement_type": "sale",
                        "from_location_id": "${form.location_id}",
                        "quantity": "${form.quantity}",
                        "unit_cost": "${step_validate_stock.results.0.average_cost}",
                        "reference_number": "${form.invoice_number}"
                    }
                },
                "next": "create_cogs_transaction"
            },
            {
                "id": "create_cogs_transaction",
                "name": "Record COGS",
                "type": "transaction",
                "config": {
                    "transaction_type": "double_entry",
                    "series_code": "COGS",
                    "date": "${form.sale_date}",
                    "description": "COGS: ${form.item_name} x ${form.quantity}",
                    "entries": [
                        {
                            "account_id": "${item.category.cogs_account_id}",
                            "side": "DR",
                            "amount": "${step_calculate_cogs.result}",
                            "description": "Cost of goods sold"
                        },
                        {
                            "account_id": "${item.category.inventory_account_id}",
                            "side": "CR",
                            "amount": "${step_calculate_cogs.result}",
                            "description": "Inventory reduction"
                        }
                    ]
                },
                "next": "create_income_transaction"
            },
            {
                "id": "create_income_transaction",
                "name": "Record Income",
                "type": "transaction",
                "config": {
                    "transaction_type": "double_entry",
                    "series_code": "REV",
                    "date": "${form.sale_date}",
                    "description": "Sale: ${form.item_name} x ${form.quantity}",
                    "entries": [
                        {
                            "account_id": "${form.payment_account_id}",
                            "side": "DR",
                            "amount": "${form.selling_price}",
                            "description": "Cash/AR from sale"
                        },
                        {
                            "account_id": "${item.category.sales_account_id}",
                            "side": "CR",
                            "amount": "${form.selling_price}",
                            "description": "Sales income"
                        }
                    ]
                },
                "next": "send_sale_notification"
            },
            {
                "id": "send_sale_notification",
                "name": "Send Sale Confirmation",
                "type": "notification",
                "config": {
                    "template_code": "inventory_sold",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "item_name": "${form.item_name}",
                        "quantity": "${form.quantity}",
                        "selling_price": "${form.selling_price}",
                        "cogs": "${step_calculate_cogs.result}",
                        "profit": "${calculated.gross_profit}"
                    }
                },
                "next": None
            },
            {
                "id": "send_insufficient_stock_error",
                "name": "Send Insufficient Stock Error",
                "type": "notification",
                "config": {
                    "template_code": "insufficient_stock",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "item_name": "${form.item_name}",
                        "requested": "${form.quantity}",
                        "available": "${step_validate_stock.results.0.quantity_available}"
                    }
                },
                "next": None
            }
        ],
        "initial_step": "validate_stock"
    }
}

# ================================================================
# SCENARIO 3: Prepaid Fuel Purchase (Bulk)
# ================================================================

PREPAID_FUEL_PURCHASE_WORKFLOW = {
    "name": "Prepaid Fuel Purchase",
    "code": "prepaid_fuel_purchase",
    "description": "Purchase fuel in bulk, create prepaid expense",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "expense.prepaid_fuel_purchase"
    },
    "workflow_definition": {
        "steps": [
            {
                "id": "validate_purchase",
                "name": "Validate Purchase Details",
                "type": "condition",
                "config": {
                    "conditions": [
                        {
                            "field": "form.total_liters",
                            "operator": ">",
                            "value": 0
                        },
                        {
                            "field": "form.total_amount",
                            "operator": ">",
                            "value": 0
                        }
                    ],
                    "logic": "AND"
                },
                "on_true": "calculate_unit_cost",
                "on_false": "send_error"
            },
            {
                "id": "calculate_unit_cost",
                "name": "Calculate Cost Per Liter",
                "type": "calculation",
                "config": {
                    "formula": "total_amount / total_liters",
                    "variables": {
                        "total_amount": "form.total_amount",
                        "total_liters": "form.total_liters"
                    }
                },
                "next": "create_prepaid_expense"
            },
            {
                "id": "create_prepaid_expense",
                "name": "Create Prepaid Expense Record",
                "type": "update",
                "config": {
                    "entity": "PrepaidExpense",
                    "operation": "create",
                    "fields": {
                        "category_id": "${form.expense_category_id}",
                        "description": "Bulk fuel purchase from ${form.supplier_name}",
                        "purchase_date": "${form.purchase_date}",
                        "total_amount": "${form.total_amount}",
                        "measurable": True,
                        "unit_of_measure": "liters",
                        "total_units": "${form.total_liters}",
                        "unit_cost": "${step_calculate_unit_cost.result}",
                        "supplier_name": "${form.supplier_name}",
                        "supplier_invoice": "${form.supplier_invoice}"
                    }
                },
                "next": "create_prepaid_transaction"
            },
            {
                "id": "create_prepaid_transaction",
                "name": "Record Prepaid Expense Transaction",
                "type": "transaction",
                "config": {
                    "transaction_type": "double_entry",
                    "series_code": "PRE",
                    "date": "${form.purchase_date}",
                    "description": "Prepaid fuel: ${form.total_liters}L @ ${step_calculate_unit_cost.result}/L",
                    "entries": [
                        {
                            "account_id": "${expense_category.prepaid_account_id}",
                            "side": "DR",
                            "amount": "${form.total_amount}",
                            "description": "Prepaid fuel expense (asset)"
                        },
                        {
                            "account_id": "${form.payment_account_id}",
                            "side": "CR",
                            "amount": "${form.total_amount}",
                            "description": "Payment for bulk fuel"
                        }
                    ]
                },
                "next": "send_confirmation"
            },
            {
                "id": "send_confirmation",
                "name": "Send Purchase Confirmation",
                "type": "notification",
                "config": {
                    "template_code": "prepaid_fuel_purchased",
                    "recipient_source": "user",
                    "channels": ["in_app", "email"],
                    "context_mapping": {
                        "supplier": "${form.supplier_name}",
                        "total_liters": "${form.total_liters}",
                        "total_amount": "${form.total_amount}",
                        "unit_cost": "${step_calculate_unit_cost.result}",
                        "transaction_ref": "${step_create_prepaid_transaction.reference_number}"
                    }
                },
                "next": None
            },
            {
                "id": "send_error",
                "name": "Send Error",
                "type": "notification",
                "config": {
                    "template_code": "workflow_error",
                    "recipient_source": "user",
                    "channels": ["in_app"]
                },
                "next": None
            }
        ],
        "initial_step": "validate_purchase"
    }
}

# ================================================================
# SCENARIO 4: Issue Fuel Voucher to Asset
# ================================================================

ISSUE_FUEL_VOUCHER_WORKFLOW = {
    "name": "Issue Fuel Voucher",
    "code": "issue_fuel_voucher",
    "description": "Issue fuel voucher to vehicle/asset from prepaid",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "expense.fuel_voucher_issue"
    },
    "workflow_definition": {
        "steps": [
            {
                "id": "validate_prepaid",
                "name": "Validate Prepaid Fuel Availability",
                "type": "query",
                "config": {
                    "entity": "PrepaidExpense",
                    "where": {
                        "id": "${form.prepaid_expense_id}",
                        "status__in": ["active", "partially_consumed"]
                    },
                    "select": ["remaining_units", "remaining_amount", "unit_cost"]
                },
                "next": "check_availability"
            },
            {
                "id": "check_availability",
                "name": "Check Sufficient Balance",
                "type": "condition",
                "config": {
                    "conditions": [
                        {
                            "field": "step_validate_prepaid.results.0.remaining_units",
                            "operator": ">=",
                            "value": "${form.allocated_liters}"
                        }
                    ],
                    "logic": "AND"
                },
                "on_true": "calculate_voucher_amount",
                "on_false": "send_insufficient_balance"
            },
            {
                "id": "calculate_voucher_amount",
                "name": "Calculate Voucher Amount",
                "type": "calculation",
                "config": {
                    "formula": "allocated_liters * unit_cost",
                    "variables": {
                        "allocated_liters": "form.allocated_liters",
                        "unit_cost": "step_validate_prepaid.results.0.unit_cost"
                    }
                },
                "next": "create_voucher"
            },
            {
                "id": "create_voucher",
                "name": "Create Fuel Voucher",
                "type": "update",
                "config": {
                    "entity": "PrepaidVoucher",
                    "operation": "create",
                    "fields": {
                        "prepaid_expense_id": "${form.prepaid_expense_id}",
                        "issue_date": "${form.issue_date}",
                        "beneficiary_type": "asset",
                        "beneficiary_name": "${form.asset_name}",
                        "beneficiary_reference": "${form.asset_number}",
                        "allocated_units": "${form.allocated_liters}",
                        "allocated_amount": "${step_calculate_voucher_amount.result}",
                        "notes": "Fuel voucher for ${form.asset_name}"
                    }
                },
                "next": "update_prepaid"
            },
            {
                "id": "update_prepaid",
                "name": "Update Prepaid Expense",
                "type": "update",
                "config": {
                    "entity": "PrepaidExpense",
                    "id": "${form.prepaid_expense_id}",
                    "fields": {
                        "consumed_units": "${calculated.new_consumed_units}",
                        "consumed_amount": "${calculated.new_consumed_amount}"
                    }
                },
                "next": "send_voucher_notification"
            },
            {
                "id": "send_voucher_notification",
                "name": "Send Voucher Details",
                "type": "notification",
                "config": {
                    "template_code": "fuel_voucher_issued",
                    "recipient_source": "user",
                        "channels": ["in_app", "email", "sms"],
                    "context_mapping": {
                        "voucher_number": "${step_create_voucher.voucher_number}",
                        "asset_name": "${form.asset_name}",
                        "asset_number": "${form.asset_number}",
                        "allocated_liters": "${form.allocated_liters}",
                        "supplier_name": "${prepaid.supplier_name}",
                        "valid_until": "${calculated.expiry_date}"
                    }
                },
                "next": None
            },
            {
                "id": "send_insufficient_balance",
                "name": "Send Insufficient Balance Error",
                "type": "notification",
                "config": {
                    "template_code": "insufficient_prepaid_balance",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "requested": "${form.allocated_liters}",
                        "available": "${step_validate_prepaid.results.0.remaining_units}"
                    }
                },
                "next": None
            }
        ],
        "initial_step": "validate_prepaid"
    }
}

# ================================================================
# SCENARIO 5: Redeem Fuel Voucher (At Gas Station)
# ================================================================

REDEEM_FUEL_VOUCHER_WORKFLOW = {
    "name": "Redeem Fuel Voucher",
    "code": "redeem_fuel_voucher",
    "description": "Record fuel consumption when voucher is redeemed",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "expense.fuel_voucher_redeem"
    },
    "workflow_definition": {
        "steps": [
            {
                "id": "validate_voucher",
                "name": "Validate Voucher",
                "type": "query",
                "config": {
                    "entity": "PrepaidVoucher",
                    "where": {
                        "voucher_number": "${form.voucher_number}",
                        "status__in": ["active", "partially_used"]
                    },
                    "select": ["id", "remaining_units", "remaining_amount", "prepaid_expense_id"]
                },
                "next": "check_voucher_valid"
            },
            {
                "id": "check_voucher_valid",
                "name": "Check Voucher Validity",
                "type": "condition",
                "config": {
                    "conditions": [
                        {
                            "field": "step_validate_voucher.results.count",
                            "operator": ">",
                            "value": 0
                        },
                        {
                            "field": "step_validate_voucher.results.0.remaining_units",
                            "operator": ">=",
                            "value": "${form.liters_dispensed}"
                        }
                    ],
                    "logic": "AND"
                },
                "on_true": "update_voucher",
                "on_false": "send_invalid_voucher"
            },
            {
                "id": "update_voucher",
                "name": "Update Voucher Consumption",
                "type": "update",
                "config": {
                    "entity": "PrepaidVoucher",
                    "id": "${step_validate_voucher.results.0.id}",
                    "fields": {
                        "consumed_units": "${calculated.new_consumed_units}",
                        "consumed_amount": "${calculated.new_consumed_amount}",
                        "is_redeemed": True,
                        "redemption_date": "${form.redemption_date}",
                        "redemption_location": "${form.gas_station_name}"
                    }
                },
                "next": "create_expense_transaction"
            },
            {
                "id": "create_expense_transaction",
                "name": "Record Fuel Expense",
                "type": "transaction",
                "config": {
                    "transaction_type": "double_entry",
                    "series_code": "EXP",
                    "date": "${form.redemption_date}",
                    "description": "Fuel expense: ${form.asset_name} - ${form.liters_dispensed}L",
                    "entries": [
                        {
                            "account_id": "${expense_category.expense_account_id}",
                            "side": "DR",
                            "amount": "${calculated.expense_amount}",
                            "description": "Fuel expense for ${form.asset_name}"
                        },
                        {
                            "account_id": "${expense_category.prepaid_account_id}",
                            "side": "CR",
                            "amount": "${calculated.expense_amount}",
                            "description": "Reduction of prepaid fuel"
                        }
                    ]
                },
                "next": "update_asset_metadata"
            },
            {
                "id": "update_asset_metadata",
                "name": "Update Asset Fuel Log",
                "type": "update",
                "config": {
                    "entity": "FixedAsset",
                    "id": "${form.asset_id}",
                    "fields": {
                        "metadata.last_fuel_date": "${form.redemption_date}",
                        "metadata.total_fuel_consumed": "${calculated.cumulative_fuel}",
                        "metadata.odometer": "${form.odometer_reading}"
                    }
                },
                "next": "send_redemption_confirmation"
            },
            {
                "id": "send_redemption_confirmation",
                "name": "Send Confirmation",
                "type": "notification",
                "config": {
                    "template_code": "fuel_voucher_redeemed",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "voucher_number": "${form.voucher_number}",
                        "asset_name": "${form.asset_name}",
                        "liters_dispensed": "${form.liters_dispensed}",
                        "gas_station": "${form.gas_station_name}",
                        "transaction_ref": "${step_create_expense_transaction.reference_number}"
                    }
                },
                "next": None
            },
            {
                "id": "send_invalid_voucher",
                "name": "Send Invalid Voucher Error",
                "type": "notification",
                "config": {
                    "template_code": "invalid_voucher",
                    "recipient_source": "user",
                    "channels": ["in_app"],
                    "context_mapping": {
                        "voucher_number": "${form.voucher_number}"
                    }
                },
                "next": None
            }
        ],
        "initial_step": "validate_voucher"
    }
}


# ================================================================
# Helper function to create workflows in database
# ================================================================

def create_inventory_workflows(branch, owner, created_by):
    """Create all inventory/expense workflows as WorkflowTemplate records"""
    from automations.models import WorkflowTemplate
    
    workflows = [
        BUY_INVENTORY_WORKFLOW,
        SELL_INVENTORY_WORKFLOW,
        PREPAID_FUEL_PURCHASE_WORKFLOW,
        ISSUE_FUEL_VOUCHER_WORKFLOW,
        REDEEM_FUEL_VOUCHER_WORKFLOW,
    ]
    
    created = []
    for workflow_def in workflows:
        workflow = WorkflowTemplate.objects.create(
            name=workflow_def["name"],
            code=workflow_def["code"],
            description=workflow_def["description"],
            trigger_type=workflow_def["trigger_type"],
            trigger_config=workflow_def["trigger_config"],
            workflow_definition=workflow_def["workflow_definition"],
            workflow_type='template',
            access_level='internal',
            is_active=True,
            owner=owner,
            branch=branch,
            created_by=created_by
        )
        created.append(workflow)
    
    return created