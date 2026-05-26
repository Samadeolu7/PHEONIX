# automations/workflow_templates.py
"""
Predefined workflow templates for inventory allocation systems
"""

# ================================================================
# CASE 1: SCHOOL SUPPLIES ALLOCATION WORKFLOW
# ================================================================

SCHOOL_SUPPLIES_WORKFLOW = {
    "name": "School Supplies Allocation & Redemption",
    "description": "Manages student payments, allocations, and item redemptions",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "invoice-paid",
        "filters": {
            "invoice_type": "school_supplies"
        }
    },
    "workflow_definition": {
        "initial_step": "check_invoice_items",
        "steps": [
            {
                "id": "check_invoice_items",
                "type": "condition",
                "name": "Check Invoice Items",
                "config": {
                    "condition": "len(context['invoice_items']) > 0",
                    "on_true": "create_allocation",
                    "on_false": "end_workflow"
                }
            },
            {
                "id": "create_allocation",
                "type": "transaction",
                "name": "Create Inventory Allocation",
                "config": {
                    "action": "create_allocation",
                    "model": "inventory.InventoryAllocation",
                    "data": {
                        "client_id": "{{context.client_id}}",
                        "invoice_id": "{{context.invoice_id}}",
                        "allocation_type": "item_specific",
                        "allocated_amount": "{{context.total_amount}}",
                        "valid_from": "{{context.payment_date}}",
                        "valid_until": "{{context.academic_year_end}}"
                    }
                },
                "next": "create_allocation_items"
            },
            {
                "id": "create_allocation_items",
                "type": "loop",
                "name": "Create Allocation Items",
                "config": {
                    "iterate_over": "context['invoice_items']",
                    "item_var": "invoice_item",
                    "steps": [
                        {
                            "id": "create_item",
                            "type": "transaction",
                            "config": {
                                "action": "create",
                                "model": "inventory.AllocationItem",
                                "data": {
                                    "allocation_id": "{{variables.allocation_id}}",
                                    "item_id": "{{invoice_item.item_id}}",
                                    "allocated_quantity": "{{invoice_item.quantity}}",
                                    "is_one_time_only": "{{invoice_item.is_uniform}}"
                                }
                            }
                        }
                    ]
                },
                "next": "post_accounting_entry"
            },
            {
                "id": "post_accounting_entry",
                "type": "transaction",
                "name": "Record Payment",
                "config": {
                    "action": "create_journal_entry",
                    "entries": [
                        {
                            "account": "{{config.cash_account}}",
                            "debit": "{{context.total_amount}}",
                            "description": "Payment received for school supplies"
                        },
                        {
                            "account": "{{config.deferred_income_account}}",
                            "credit": "{{context.total_amount}}",
                            "description": "Deferred income - supplies not yet delivered"
                        }
                    ]
                },
                "next": "send_notification"
            },
            {
                "id": "send_notification",
                "type": "notification",
                "name": "Notify Student",
                "config": {
                    "template": "allocation_created",
                    "recipient": "{{context.client_email}}",
                    "data": {
                        "allocation_number": "{{variables.allocation_number}}",
                        "items": "{{context.invoice_items}}"
                    }
                },
                "next": "end_workflow"
            }
        ]
    }
}

SUPPLIES_REDEMPTION_WORKFLOW = {
    "name": "Supplies Redemption Processing",
    "description": "Process student item pickups with validation",
    "trigger_type": "manual",
    "workflow_definition": {
        "initial_step": "validate_allocation",
        "steps": [
            {
                "id": "validate_allocation",
                "type": "validation",
                "name": "Validate Allocation",
                "config": {
                    "checks": [
                        {
                            "condition": "allocation.is_valid",
                            "error": "Allocation is not valid or has expired"
                        },
                        {
                            "condition": "allocation.status in ['active', 'partially_used']",
                            "error": "Allocation is not active"
                        }
                    ]
                },
                "next": "validate_items"
            },
            {
                "id": "validate_items",
                "type": "loop",
                "name": "Validate Each Item",
                "config": {
                    "iterate_over": "context['requested_items']",
                    "item_var": "requested_item",
                    "steps": [
                        {
                            "id": "check_item_eligibility",
                            "type": "validation",
                            "config": {
                                "checks": [
                                    {
                                        "condition": "requested_item.quantity <= allocation_item.remaining_quantity",
                                        "error": "Insufficient quantity allocated"
                                    },
                                    {
                                        "condition": "not (allocation_item.is_one_time_only and allocation_item.has_been_redeemed)",
                                        "error": "Item can only be redeemed once"
                                    }
                                ]
                            }
                        },
                        {
                            "id": "check_stock_availability",
                            "type": "validation",
                            "config": {
                                "checks": [
                                    {
                                        "condition": "stock.quantity_available >= requested_item.quantity",
                                        "error": "Insufficient stock available"
                                    }
                                ]
                            }
                        }
                    ]
                },
                "next": "create_redemption"
            },
            {
                "id": "create_redemption",
                "type": "transaction",
                "name": "Create Redemption Record",
                "config": {
                    "action": "create",
                    "model": "inventory.AllocationRedemption",
                    "data": {
                        "allocation_id": "{{context.allocation_id}}",
                        "location_id": "{{context.pickup_location_id}}",
                        "authorized_by_id": "{{context.user_id}}",
                        "status": "pending"
                    }
                },
                "next": "create_redemption_items"
            },
            {
                "id": "create_redemption_items",
                "type": "loop",
                "name": "Create Redemption Items",
                "config": {
                    "iterate_over": "context['requested_items']",
                    "item_var": "requested_item",
                    "steps": [
                        {
                            "id": "create_item",
                            "type": "transaction",
                            "config": {
                                "action": "create",
                                "model": "inventory.RedemptionItem",
                                "data": {
                                    "redemption_id": "{{variables.redemption_id}}",
                                    "item_id": "{{requested_item.item_id}}",
                                    "quantity": "{{requested_item.quantity}}",
                                    "unit_cost": "{{requested_item.item.cost_price}}"
                                }
                            }
                        }
                    ]
                },
                "next": "update_stock"
            },
            {
                "id": "update_stock",
                "type": "loop",
                "name": "Update Stock Levels",
                "config": {
                    "iterate_over": "context['requested_items']",
                    "item_var": "requested_item",
                    "steps": [
                        {
                            "id": "reduce_stock",
                            "type": "transaction",
                            "config": {
                                "action": "update_stock",
                                "item_id": "{{requested_item.item_id}}",
                                "location_id": "{{context.pickup_location_id}}",
                                "quantity": "-{{requested_item.quantity}}",
                                "movement_type": "sale"
                            }
                        },
                        {
                            "id": "create_movement",
                            "type": "transaction",
                            "config": {
                                "action": "create",
                                "model": "inventory.StockMovement",
                                "data": {
                                    "item_id": "{{requested_item.item_id}}",
                                    "movement_type": "sale",
                                    "from_location_id": "{{context.pickup_location_id}}",
                                    "quantity": "{{requested_item.quantity}}",
                                    "unit_cost": "{{requested_item.item.cost_price}}",
                                    "reference_number": "{{variables.redemption_number}}"
                                }
                            }
                        }
                    ]
                },
                "next": "post_cogs_entry"
            },
            {
                "id": "post_cogs_entry",
                "type": "transaction",
                "name": "Post COGS and Income Recognition",
                "config": {
                    "action": "create_journal_entry",
                    "entries": [
                        {
                            "account": "{{config.cogs_account}}",
                            "debit": "{{variables.total_cost}}",
                            "description": "Cost of goods sold - supplies redemption"
                        },
                        {
                            "account": "{{config.inventory_account}}",
                            "credit": "{{variables.total_cost}}",
                            "description": "Inventory reduction"
                        },
                        {
                            "account": "{{config.deferred_income_account}}",
                            "debit": "{{variables.total_cost}}",
                            "description": "Income recognition on delivery"
                        },
                        {
                            "account": "{{config.income_account}}",
                            "credit": "{{variables.total_cost}}",
                            "description": "Income recognized"
                        }
                    ]
                },
                "next": "complete_redemption"
            },
            {
                "id": "complete_redemption",
                "type": "transaction",
                "name": "Complete Redemption",
                "config": {
                    "action": "update",
                    "model": "inventory.AllocationRedemption",
                    "id": "{{variables.redemption_id}}",
                    "data": {
                        "status": "completed",
                        "is_posted": True
                    }
                },
                "next": "print_receipt"
            },
            {
                "id": "print_receipt",
                "type": "report",
                "name": "Generate Receipt",
                "config": {
                    "template": "redemption_receipt",
                    "format": "pdf",
                    "data": {
                        "redemption_id": "{{variables.redemption_id}}",
                        "items": "{{context.requested_items}}",
                        "student_name": "{{allocation.client.full_name}}"
                    },
                    "auto_print": True
                },
                "next": "end_workflow"
            }
        ]
    }
}

# ================================================================
# CASE 2: FUEL ALLOCATION & TRACKING WORKFLOW
# ================================================================

FUEL_ALLOCATION_WORKFLOW = {
    "name": "Fuel Prepayment & Allocation",
    "description": "Process fuel prepayment and create vehicle allocations",
    "trigger_type": "manual",
    "workflow_definition": {
        "initial_step": "record_prepayment",
        "steps": [
            {
                "id": "record_prepayment",
                "type": "transaction",
                "name": "Record Fuel Prepayment",
                "config": {
                    "action": "create",
                    "model": "expenses.PrepaidExpense",
                    "data": {
                        "category_id": "{{context.fuel_category_id}}",
                        "total_amount": "{{context.payment_amount}}",
                        "supplier_name": "{{context.filling_station_name}}",
                        "measurable": True,
                        "unit_of_measure": "liters",
                        "total_units": "{{context.total_liters}}",
                        "unit_cost": "{{context.price_per_liter}}"
                    }
                },
                "next": "post_prepayment_entry"
            },
            {
                "id": "post_prepayment_entry",
                "type": "transaction",
                "name": "Post Accounting Entry",
                "config": {
                    "action": "create_journal_entry",
                    "entries": [
                        {
                            "account": "{{config.prepaid_fuel_account}}",
                            "debit": "{{context.payment_amount}}",
                            "description": "Prepaid fuel expense"
                        },
                        {
                            "account": "{{config.cash_account}}",
                            "credit": "{{context.payment_amount}}",
                            "description": "Payment for fuel"
                        }
                    ]
                },
                "next": "create_vehicle_allocations"
            },
            {
                "id": "create_vehicle_allocations",
                "type": "loop",
                "name": "Create Vehicle Allocations",
                "config": {
                    "iterate_over": "context['vehicles']",
                    "item_var": "vehicle",
                    "steps": [
                        {
                            "id": "create_allocation",
                            "type": "transaction",
                            "config": {
                                "action": "create",
                                "model": "inventory.InventoryAllocation",
                                "data": {
                                    "allocation_type": "monetary",
                                    "allocated_amount": "{{vehicle.monthly_allocation}}",
                                    "linked_asset_id": "{{vehicle.asset_id}}",
                                    "valid_from": "{{context.period_start}}",
                                    "valid_until": "{{context.period_end}}",
                                    "usage_rules": {
                                        "max_per_transaction": "{{vehicle.max_per_fill}}",
                                        "require_meter_reading": True
                                    }
                                }
                            }
                        },
                        {
                            "id": "issue_voucher",
                            "type": "transaction",
                            "config": {
                                "action": "create",
                                "model": "expenses.PrepaidVoucher",
                                "data": {
                                    "prepaid_expense_id": "{{variables.prepaid_expense_id}}",
                                    "beneficiary_type": "asset",
                                    "beneficiary_name": "{{vehicle.name}}",
                                    "beneficiary_reference": "{{vehicle.asset_number}}",
                                    "allocated_units": "{{vehicle.monthly_allocation / context.price_per_liter}}",
                                    "allocated_amount": "{{vehicle.monthly_allocation}}"
                                }
                            }
                        }
                    ]
                },
                "next": "end_workflow"
            }
        ]
    }
}

FUEL_REDEMPTION_WORKFLOW = {
    "name": "Fuel Redemption & Mileage Tracking",
    "description": "Process fuel voucher redemption with mileage tracking",
    "trigger_type": "manual",
    "workflow_definition": {
        "initial_step": "validate_voucher",
        "steps": [
            {
                "id": "validate_voucher",
                "type": "validation",
                "name": "Validate Fuel Voucher",
                "config": {
                    "checks": [
                        {
                            "condition": "allocation.is_valid",
                            "error": "Allocation has expired or is not valid"
                        },
                        {
                            "condition": "context['requested_amount'] <= allocation.remaining_amount",
                            "error": "Requested amount exceeds available balance"
                        }
                    ]
                },
                "next": "check_meter_reading"
            },
            {
                "id": "check_meter_reading",
                "type": "condition",
                "name": "Check if Meter Reading Required",
                "config": {
                    "condition": "allocation.usage_rules.get('require_meter_reading', False)",
                    "on_true": "validate_meter_reading",
                    "on_false": "create_redemption"
                }
            },
            {
                "id": "validate_meter_reading",
                "type": "validation",
                "name": "Validate Meter Reading",
                "config": {
                    "checks": [
                        {
                            "condition": "context.get('meter_reading') is not None",
                            "error": "Meter reading is required"
                        },
                        {
                            "condition": "context['meter_reading'] > asset.metadata.get('last_meter_reading', 0)",
                            "error": "Meter reading must be greater than last reading"
                        }
                    ]
                },
                "next": "calculate_efficiency"
            },
            {
                "id": "calculate_efficiency",
                "type": "calculation",
                "name": "Calculate Fuel Efficiency",
                "config": {
                    "calculations": [
                        {
                            "variable": "distance_traveled",
                            "formula": "context['meter_reading'] - asset.metadata.get('last_meter_reading', context['meter_reading'])"
                        },
                        {
                            "variable": "expected_consumption",
                            "formula": "distance_traveled / asset.metadata.get('avg_fuel_efficiency', 10)"
                        },
                        {
                            "variable": "requested_liters",
                            "formula": "context['requested_amount'] / prepaid_expense.unit_cost"
                        }
                    ]
                },
                "next": "check_anomaly"
            },
            {
                "id": "check_anomaly",
                "type": "condition",
                "name": "Check for Consumption Anomaly",
                "config": {
                    "condition": "abs(variables['requested_liters'] - variables['expected_consumption']) / variables['expected_consumption'] > 0.2",
                    "on_true": "flag_for_review",
                    "on_false": "create_redemption"
                }
            },
            {
                "id": "flag_for_review",
                "type": "approval",
                "name": "Request Manager Approval",
                "config": {
                    "approver_role": "fleet_manager",
                    "approval_message": "Fuel consumption anomaly detected. Requested: {{variables.requested_liters}}L, Expected: {{variables.expected_consumption}}L ({{((variables.requested_liters - variables.expected_consumption) / variables.expected_consumption * 100)}}% deviation)",
                    "timeout_hours": 24,
                    "on_approved": "create_redemption",
                    "on_rejected": "cancel_redemption"
                }
            },
            {
                "id": "create_redemption",
                "type": "transaction",
                "name": "Create Redemption Record",
                "config": {
                    "action": "create",
                    "model": "inventory.AllocationRedemption",
                    "data": {
                        "allocation_id": "{{context.allocation_id}}",
                        "amount_redeemed": "{{context.requested_amount}}",
                        "asset_id": "{{allocation.linked_asset_id}}",
                        "meter_reading": "{{context.meter_reading}}",
                        "authorized_by_id": "{{context.user_id}}"
                    }
                },
                "next": "create_usage_log"
            },
            {
                "id": "create_usage_log",
                "type": "transaction",
                "name": "Log Asset Usage",
                "config": {
                    "action": "create",
                    "model": "inventory.AssetUsageLog",
                    "data": {
                        "asset_id": "{{allocation.linked_asset_id}}",
                        "meter_reading_start": "{{asset.metadata.last_meter_reading}}",
                        "meter_reading_end": "{{context.meter_reading}}",
                        "distance_traveled": "{{variables.distance_traveled}}",
                        "resource_consumed": "{{variables.requested_liters}}",
                        "resource_unit": "liters",
                        "expected_consumption": "{{variables.expected_consumption}}",
                        "redemption_id": "{{variables.redemption_id}}"
                    }
                },
                "next": "update_asset_metadata"
            },
            {
                "id": "update_asset_metadata",
                "type": "transaction",
                "name": "Update Asset Metadata",
                "config": {
                    "action": "update",
                    "model": "assets.FixedAsset",
                    "id": "{{allocation.linked_asset_id}}",
                    "data": {
                        "metadata": {
                            "last_meter_reading": "{{context.meter_reading}}",
                            "last_fuel_date": "{{context.redemption_date}}",
                            "total_fuel_consumed": "{{asset.metadata.get('total_fuel_consumed', 0) + variables.requested_liters}}"
                        }
                    }
                },
                "next": "post_expense_entry"
            },
            {
                "id": "post_expense_entry",
                "type": "transaction",
                "name": "Post Expense Recognition",
                "config": {
                    "action": "create_journal_entry",
                    "entries": [
                        {
                            "account": "{{config.fuel_expense_account}}",
                            "debit": "{{context.requested_amount}}",
                            "description": "Fuel expense - {{asset.name}}"
                        },
                        {
                            "account": "{{config.prepaid_fuel_account}}",
                            "credit": "{{context.requested_amount}}",
                            "description": "Prepaid fuel consumed"
                        }
                    ]
                },
                "next": "update_prepaid_expense"
            },
            {
                "id": "update_prepaid_expense",
                "type": "transaction",
                "name": "Update Prepaid Expense",
                "config": {
                    "action": "update",
                    "model": "expenses.PrepaidExpense",
                    "id": "{{prepaid_expense.id}}",
                    "data": {
                        "consumed_amount": "{{prepaid_expense.consumed_amount + context.requested_amount}}",
                        "consumed_units": "{{prepaid_expense.consumed_units + variables.requested_liters}}"
                    }
                },
                "next": "complete_redemption"
            },
            {
                "id": "complete_redemption",
                "type": "transaction",
                "name": "Complete Redemption",
                "config": {
                    "action": "call_method",
                    "model": "inventory.AllocationRedemption",
                    "id": "{{variables.redemption_id}}",
                    "method": "complete"
                },
                "next": "print_voucher"
            },
            {
                "id": "print_voucher",
                "type": "report",
                "name": "Generate Fuel Voucher",
                "config": {
                    "template": "fuel_voucher",
                    "format": "pdf",
                    "data": {
                        "redemption_id": "{{variables.redemption_id}}",
                        "vehicle": "{{asset.name}}",
                        "amount": "{{context.requested_amount}}",
                        "liters": "{{variables.requested_liters}}",
                        "meter_reading": "{{context.meter_reading}}"
                    },
                    "auto_print": True
                },
                "next": "end_workflow"
            },
            {
                "id": "cancel_redemption",
                "type": "notification",
                "name": "Notify Cancellation",
                "config": {
                    "template": "redemption_rejected",
                    "recipient": "{{context.user_email}}",
                    "data": {
                        "reason": "Excessive fuel consumption flagged for review"
                    }
                },
                "next": "end_workflow"
            }
        ]
    }
}