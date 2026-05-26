// cypress/e2e/procurement.cy.ts
describe('Procurement System E2E Tests', () => {
  beforeEach(() => {
    // Mock authentication
    cy.window().then((win) => {
      win.localStorage.setItem('accessToken', 'mock-token');
      win.localStorage.setItem('user', JSON.stringify({
        id: 1,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
      }));
    });

    // Intercept API calls
    cy.intercept('GET', '/api/procurement/suppliers/*', {
      fixture: 'suppliers.json'
    }).as('getSuppliers');

    cy.intercept('GET', '/api/inventory/items/*', {
      fixture: 'inventory-items.json'
    }).as('getInventoryItems');

    cy.intercept('GET', '/api/inventory/locations/*', {
      fixture: 'inventory-locations.json'
    }).as('getInventoryLocations');

    cy.intercept('GET', '/api/hr/departments/*', {
      fixture: 'departments.json'
    }).as('getDepartments');
  });

  describe('Purchase Requisition Workflow', () => {
    it('should create a purchase requisition successfully', () => {
      // Mock requisition creation
      cy.intercept('POST', '/api/procurement/requisitions/', {
        statusCode: 201,
        body: {
          id: 1,
          pr_number: 'PR-2024-001',
          status: 'draft',
          title: 'Test Requisition',
          justification: 'Test justification',
          department_id: 1,
          items: []
        }
      }).as('createRequisition');

      // Mock requisitions list
      cy.intercept('GET', '/api/procurement/requisitions/*', {
        body: {
          count: 0,
          results: []
        }
      }).as('getRequisitions');

      // Visit requisitions page
      cy.visit('/procurement/requisitions');

      // Wait for page to load
      cy.wait('@getRequisitions');
      cy.contains('Purchase Requisitions').should('be.visible');

      // Click create button
      cy.get('[data-testid="create-requisition-btn"]').click();

      // Fill out form
      cy.get('[data-testid="title-input"]').type('Test Requisition');
      cy.get('[data-testid="justification-input"]').type('Test justification for procurement');
      cy.get('[data-testid="department-select"]').select('1');
      cy.get('[data-testid="budget-code-input"]').type('TEST-2024-001');

      // Add item
      cy.get('[data-testid="add-item-btn"]').click();
      cy.get('[data-testid="item-select"]').select('1');
      cy.get('[data-testid="quantity-input"]').type('5');
      cy.get('[data-testid="estimated-cost-input"]').type('100.00');
      cy.get('[data-testid="specification-input"]').type('Test specification');
      cy.get('[data-testid="item-justification-input"]').type('Item justification');

      // Submit form
      cy.get('[data-testid="create-requisition-submit"]').click();

      // Verify API call
      cy.wait('@createRequisition').then((interception) => {
        expect(interception.request.body).to.include({
          title: 'Test Requisition',
          justification: 'Test justification for procurement',
          department_id: 1,
          budget_code: 'TEST-2024-001'
        });
        expect(interception.request.body.items).to.have.length(1);
        expect(interception.request.body.items[0]).to.include({
          item_id: 1,
          quantity: 5,
          estimated_cost: '100.00'
        });
      });

      // Verify redirect to requisitions list
      cy.url().should('include', '/procurement/requisitions');
      cy.contains('Requisition created successfully').should('be.visible');
    });

    it('should approve a purchase requisition', () => {
      // Mock requisition with submitted status
      cy.intercept('GET', '/api/procurement/requisitions/*', {
        body: {
          count: 1,
          results: [
            {
              id: 1,
              pr_number: 'PR-2024-001',
              status: 'submitted',
              title: 'Test Requisition',
              requester: {
                first_name: 'Test',
                last_name: 'User'
              },
              total_estimated_cost: '500.00',
              created_at: '2024-01-01T00:00:00Z'
            }
          ]
        }
      }).as('getRequisitions');

      // Mock approval
      cy.intercept('POST', '/api/procurement/requisitions/1/approve/', {
        statusCode: 200,
        body: {
          id: 1,
          pr_number: 'PR-2024-001',
          status: 'approved'
        }
      }).as('approveRequisition');

      cy.visit('/procurement/requisitions');
      cy.wait('@getRequisitions');

      // Find requisition and click approve
      cy.get('[data-testid="requisition-1"]').should('be.visible');
      cy.get('[data-testid="approve-btn-1"]').click();

      // Fill approval form
      cy.get('[data-testid="approval-comments"]').type('Approved for business needs');
      cy.get('[data-testid="approve-submit"]').click();

      // Verify API call
      cy.wait('@approveRequisition').then((interception) => {
        expect(interception.request.body).to.include({
          action: 'approve',
          comments: 'Approved for business needs'
        });
      });

      cy.contains('Requisition approved successfully').should('be.visible');
    });
  });

  describe('Purchase Order Workflow', () => {
    it('should create a purchase order from approved requisition', () => {
      // Mock approved requisition
      cy.intercept('GET', '/api/procurement/requisitions/1/', {
        body: {
          id: 1,
          pr_number: 'PR-2024-001',
          status: 'approved',
          title: 'Test Requisition',
          items: [
            {
              id: 1,
              item_id: 1,
              item: {
                id: 1,
                name: 'Test Item',
                sku: 'TEST-001'
              },
              quantity: 5,
              estimated_cost: '100.00'
            }
          ]
        }
      }).as('getRequisition');

      // Mock PO creation
      cy.intercept('POST', '/api/procurement/requisitions/1/convert-to-po/', {
        statusCode: 201,
        body: {
          id: 1,
          po_number: 'PO-2024-001',
          status: 'draft',
          supplier_name: 'Test Supplier',
          total_amount: '500.00'
        }
      }).as('convertToPO');

      cy.visit('/procurement/requisitions/1/view');
      cy.wait('@getRequisition');

      // Click convert to PO button
      cy.get('[data-testid="convert-to-po-btn"]').click();

      // Confirm conversion
      cy.get('[data-testid="confirm-convert"]').click();

      // Verify API call
      cy.wait('@convertToPO');

      cy.contains('Purchase order created successfully').should('be.visible');
      cy.url().should('include', '/procurement/orders/1/view');
    });
  });
}); 
 describe('Goods Received Note (GRN) Workflow', () => {
    it('should create a GRN from purchase order', () => {
      // Mock purchase order
      cy.intercept('GET', '/api/procurement/purchase-orders/1/', {
        body: {
          id: 1,
          po_number: 'PO-2024-001',
          status: 'sent',
          supplier: {
            id: 1,
            name: 'Test Supplier'
          },
          items: [
            {
              id: 1,
              item: {
                id: 1,
                name: 'Test Item',
                sku: 'TEST-001'
              },
              quantity: 10,
              quantity_received: 0,
              unit_price: '50.00'
            }
          ]
        }
      }).as('getPurchaseOrder');

      // Mock GRN creation
      cy.intercept('POST', '/api/procurement/goods-receipts/', {
        statusCode: 201,
        body: {
          id: 1,
          grn_number: 'GRN-2024-001',
          status: 'draft',
          purchase_order: 1
        }
      }).as('createGRN');

      cy.visit('/procurement/orders/1/view');
      cy.wait('@getPurchaseOrder');

      // Click create GRN button
      cy.get('[data-testid="create-grn-btn"]').click();

      // Fill GRN form
      cy.get('[data-testid="received-date"]').type('2024-01-15');
      cy.get('[data-testid="delivery-note-number"]').type('DN-001');
      cy.get('[data-testid="vehicle-number"]').type('ABC-123');
      cy.get('[data-testid="driver-name"]').type('John Driver');

      // Fill item quantities
      cy.get('[data-testid="quantity-received-1"]').type('8');
      cy.get('[data-testid="quantity-accepted-1"]').type('8');
      cy.get('[data-testid="quantity-rejected-1"]').type('0');

      // Submit GRN
      cy.get('[data-testid="create-grn-submit"]').click();

      // Verify API call
      cy.wait('@createGRN').then((interception) => {
        expect(interception.request.body).to.include({
          purchase_order_id: 1,
          received_date: '2024-01-15'
        });
        expect(interception.request.body.delivery_information).to.include({
          delivery_note_number: 'DN-001',
          vehicle_number: 'ABC-123',
          driver_name: 'John Driver'
        });
      });

      cy.contains('GRN created successfully').should('be.visible');
    });

    it('should post GRN to inventory and accounting', () => {
      // Mock GRN
      cy.intercept('GET', '/api/procurement/goods-receipts/1/', {
        body: {
          id: 1,
          grn_number: 'GRN-2024-001',
          status: 'quality_check',
          posted_to_inventory: false,
          posted_to_accounting: false,
          items: [
            {
              id: 1,
              quantity_accepted: 8,
              inspection_status: 'passed'
            }
          ]
        }
      }).as('getGRN');

      // Mock posting
      cy.intercept('POST', '/api/procurement/goods-receipts/1/post-to-both/', {
        statusCode: 200,
        body: {
          id: 1,
          grn_number: 'GRN-2024-001',
          status: 'posted',
          posted_to_inventory: true,
          posted_to_accounting: true
        }
      }).as('postGRN');

      cy.visit('/procurement/grn/1/view');
      cy.wait('@getGRN');

      // Click post to both button
      cy.get('[data-testid="post-to-both-btn"]').click();

      // Confirm posting
      cy.get('[data-testid="confirm-post"]').click();

      // Verify API call
      cy.wait('@postGRN');

      cy.contains('GRN posted successfully').should('be.visible');
      cy.get('[data-testid="inventory-status"]').should('contain', 'Posted');
      cy.get('[data-testid="accounting-status"]').should('contain', 'Posted');
    });
  });

  describe('Purchase Returns Workflow', () => {
    it('should create a purchase return from GRN', () => {
      // Mock GRN with received items
      cy.intercept('GET', '/api/procurement/goods-receipts/1/', {
        body: {
          id: 1,
          grn_number: 'GRN-2024-001',
          status: 'posted',
          supplier: {
            id: 1,
            name: 'Test Supplier'
          },
          items: [
            {
              id: 1,
              item: {
                id: 1,
                name: 'Test Item',
                sku: 'TEST-001'
              },
              quantity_accepted: 8,
              unit_cost: '50.00'
            }
          ]
        }
      }).as('getGRN');

      // Mock return creation
      cy.intercept('POST', '/api/procurement/returns/', {
        statusCode: 201,
        body: {
          id: 1,
          return_number: 'RET-2024-001',
          status: 'draft',
          grn: 1
        }
      }).as('createReturn');

      cy.visit('/procurement/grn/1/view');
      cy.wait('@getGRN');

      // Click create return button
      cy.get('[data-testid="create-return-btn"]').click();

      // Fill return form
      cy.get('[data-testid="return-date"]').type('2024-01-20');
      cy.get('[data-testid="return-reason-category"]').select('quality_issue');
      cy.get('[data-testid="refund-method"]').select('credit_note');

      // Fill return item details
      cy.get('[data-testid="quantity-returned-1"]').type('2');
      cy.get('[data-testid="return-reason-1"]').type('Defective items found');
      cy.get('[data-testid="condition-1"]').select('defective');

      // Submit return
      cy.get('[data-testid="create-return-submit"]').click();

      // Verify API call
      cy.wait('@createReturn').then((interception) => {
        expect(interception.request.body).to.include({
          grn: 1,
          return_date: '2024-01-20',
          return_reason_category: 'quality_issue',
          refund_method: 'credit_note'
        });
        expect(interception.request.body.items).to.have.length(1);
        expect(interception.request.body.items[0]).to.include({
          quantity_returned: 2,
          return_reason: 'Defective items found',
          condition: 'defective'
        });
      });

      cy.contains('Return created successfully').should('be.visible');
    });
  });

  describe('Cross-Module Integration', () => {
    it('should verify inventory updates after GRN posting', () => {
      // Mock inventory check
      cy.intercept('GET', '/api/inventory/items/1/stock/', {
        body: {
          item_id: 1,
          total_quantity: '18.00',
          total_value: '900.00',
          movements: [
            {
              id: 1,
              movement_type: 'receipt',
              quantity: '8.00',
              reference_number: 'GRN-2024-001',
              movement_date: '2024-01-15'
            }
          ]
        }
      }).as('getItemStock');

      cy.visit('/inventory/items/1/stock');
      cy.wait('@getItemStock');

      // Verify stock movement from GRN
      cy.get('[data-testid="movement-1"]').should('be.visible');
      cy.get('[data-testid="movement-type-1"]').should('contain', 'Receipt');
      cy.get('[data-testid="movement-reference-1"]').should('contain', 'GRN-2024-001');
      cy.get('[data-testid="movement-quantity-1"]').should('contain', '8.00');
    });

    it('should verify accounting entries after GRN posting', () => {
      // Mock accounting entries
      cy.intercept('GET', '/api/accounts/journal-entries/*', {
        body: {
          count: 1,
          results: [
            {
              id: 1,
              entry_number: 'JE-2024-001',
              description: 'GRN Posting - GRN-2024-001',
              reference_type: 'grn',
              reference_id: 1,
              total_debit: '400.00',
              total_credit: '400.00',
              line_items: [
                {
                  account: {
                    code: '1300',
                    name: 'Inventory'
                  },
                  debit_amount: '400.00',
                  credit_amount: '0.00'
                },
                {
                  account: {
                    code: '2100',
                    name: 'Accounts Payable'
                  },
                  debit_amount: '0.00',
                  credit_amount: '400.00'
                }
              ]
            }
          ]
        }
      }).as('getJournalEntries');

      cy.visit('/accounts/journal-entries');
      cy.wait('@getJournalEntries');

      // Verify journal entry from GRN
      cy.get('[data-testid="entry-1"]').should('be.visible');
      cy.get('[data-testid="entry-description-1"]').should('contain', 'GRN Posting - GRN-2024-001');
      cy.get('[data-testid="entry-total-1"]').should('contain', '$400.00');
    });
  });
});