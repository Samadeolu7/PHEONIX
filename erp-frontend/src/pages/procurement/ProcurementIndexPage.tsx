import React from 'react';
import { Link } from 'react-router-dom';
import {
  usePurchaseOrders,
  useGRNs,
  usePurchaseRequisitions,
  usePurchaseReturns,
  useQuotes,
} from '../../hooks/useProcurement';
import { useAllSuppliers } from '../../hooks/useSuppliers';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
  link?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  color = 'blue',
  link,
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  };

  const content = (
    <div
      className={`p-6 rounded-lg border-2 ${colorClasses[color]} transition-all hover:shadow-md`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium">{title}</div>
      {subtitle && <div className="text-xs opacity-75 mt-1">{subtitle}</div>}
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : content;
};

interface ModuleCardProps {
  title: string;
  description: string;
  icon: string;
  link: string;
  actions?: Array<{ label: string; link: string; primary?: boolean }>;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  title,
  description,
  icon,
  link,
  actions = [],
}) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center">
        <span className="text-2xl mr-3">{icon}</span>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      <Link
        to={link}
        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        View All
      </Link>
      {actions.map((action, index) => (
        <Link
          key={index}
          to={action.link}
          className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            action.primary
              ? 'border-transparent text-white bg-blue-600 hover:bg-blue-700'
              : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
          }`}
        >
          {action.label}
        </Link>
      ))}
    </div>
  </div>
);

const ProcurementIndexPage: React.FC = () => {
  // Fetch data for dashboard metrics
  const { data: purchaseOrdersData, isLoading: poLoading } = usePurchaseOrders({ page: 1 });
  const { data: grnsData, isLoading: grnLoading } = useGRNs({ page: 1 });
  const { data: suppliersData, isLoading: suppliersLoading } = useAllSuppliers();
  const { data: requisitionsData, isLoading: requisitionsLoading } = usePurchaseRequisitions({
    page: 1,
  });
  const { data: returnsData, isLoading: returnsLoading } = usePurchaseReturns({ page: 1 });
  const { data: quotesData, isLoading: quotesLoading } = useQuotes({ page: 1 });

  // Calculate Purchase Order metrics
  const totalPOs = purchaseOrdersData?.count || 0;
  const pendingPOs =
    purchaseOrdersData?.results?.filter(po =>
      ['draft', 'submitted', 'approved'].includes(po.status)
    ).length || 0;
  const overdueDeliveries =
    purchaseOrdersData?.results?.filter(po => {
      if (!po.expected_delivery_date || po.status === 'received') return false;
      return new Date(po.expected_delivery_date) < new Date();
    }).length || 0;

  // Calculate GRN metrics
  const totalGRNs = grnsData?.count || 0;
  const pendingGRNs = grnsData?.results?.filter(grn => !grn.is_posted).length || 0;
  const qualityIssues =
    grnsData?.results?.filter(
      grn => grn.quality_status === 'failed' || grn.quality_status === 'partial'
    ).length || 0;

  // Calculate Supplier metrics
  const totalSuppliers = suppliersData?.length || 0;
  const activeSuppliers =
    suppliersData?.filter(supplier => supplier.is_active).length || 0;

  // Calculate Requisition metrics
  const totalRequisitions = requisitionsData?.count || 0;
  const pendingRequisitions =
    requisitionsData?.results?.filter(req => ['submitted', 'under_review'].includes(req.status))
      .length || 0;
  const approvedRequisitions =
    requisitionsData?.results?.filter(req => req.status === 'approved').length || 0;

  // Calculate Returns metrics
  const totalReturns = returnsData?.count || 0;
  const pendingReturns =
    returnsData?.results?.filter(ret => ['pending', 'approved'].includes(ret.status)).length || 0;
  const completedReturns =
    returnsData?.results?.filter(ret => ret.status === 'completed').length || 0;

  // Calculate Quotes metrics
  const totalQuotes = quotesData?.count || 0;
  const receivedQuotes =
    quotesData?.results?.filter(quote => quote.status === 'received').length || 0;
  const selectedQuotes =
    quotesData?.results?.filter(quote => quote.status === 'selected').length || 0;
  const expiredQuotes =
    quotesData?.results?.filter(quote => {
      if (quote.status === 'expired') return true;
      return new Date(quote.valid_until) < new Date() && quote.status === 'received';
    }).length || 0;

  const isLoading =
    poLoading ||
    grnLoading ||
    suppliersLoading ||
    requisitionsLoading ||
    returnsLoading ||
    quotesLoading;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Procurement Management</h1>
        <p className="mt-2 text-gray-600">
          Manage your complete purchase-to-pay cycle including suppliers, requisitions, purchase
          orders, and goods receipt.
        </p>
      </div>

      {/* Key Metrics Dashboard */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Purchase Orders"
            value={isLoading ? '...' : totalPOs}
            subtitle="All time"
            color="blue"
            link="/procurement/orders"
          />
          <MetricCard
            title="Pending Orders"
            value={isLoading ? '...' : pendingPOs}
            subtitle="Awaiting processing"
            color="yellow"
            link="/procurement/purchase-orders?status=pending"
          />
          <MetricCard
            title="Overdue Deliveries"
            value={isLoading ? '...' : overdueDeliveries}
            subtitle="Past expected date"
            color="red"
            link="/procurement/purchase-orders?overdue=true"
          />
          <MetricCard
            title="Active Suppliers"
            value={isLoading ? '...' : `${activeSuppliers}/${totalSuppliers}`}
            subtitle="Supplier base"
            color="green"
            link="/procurement/suppliers"
          />
        </div>
      </div>

      {/* Secondary Metrics - Requisitions and GRNs */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Purchase Requisitions"
            value={isLoading ? '...' : totalRequisitions}
            subtitle="Total requests"
            color="blue"
            link="/procurement/requisitions"
          />
          <MetricCard
            title="Pending Requisitions"
            value={isLoading ? '...' : pendingRequisitions}
            subtitle="Awaiting approval"
            color="yellow"
            link="/procurement/requisitions?status=pending"
          />
          <MetricCard
            title="Goods Receipts"
            value={isLoading ? '...' : totalGRNs}
            subtitle="Total received"
            color="blue"
            link="/procurement/grn"
          />
          <MetricCard
            title="Pending GRNs"
            value={isLoading ? '...' : pendingGRNs}
            subtitle="Awaiting posting"
            color="yellow"
            link="/procurement/grn?status=pending"
          />
        </div>
      </div>

      {/* Tertiary Metrics - Returns and Quality */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Purchase Returns"
            value={isLoading ? '...' : totalReturns}
            subtitle="Total returns"
            color="blue"
            link="/procurement/returns"
          />
          <MetricCard
            title="Pending Returns"
            value={isLoading ? '...' : pendingReturns}
            subtitle="Awaiting processing"
            color="yellow"
            link="/procurement/returns?status=pending"
          />
          <MetricCard
            title="Quality Issues"
            value={isLoading ? '...' : qualityIssues}
            subtitle="Failed/partial inspections"
            color="red"
            link="/procurement/grn?quality=issues"
          />
          <MetricCard
            title="Approved Requisitions"
            value={isLoading ? '...' : approvedRequisitions}
            subtitle="Ready for PO creation"
            color="green"
            link="/procurement/requisitions?status=approved"
          />
        </div>
      </div>

      {/* Quotes Metrics */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Supplier Quotes"
            value={isLoading ? '...' : totalQuotes}
            subtitle="Total quotes"
            color="blue"
            link="/procurement/quotes"
          />
          <MetricCard
            title="Received Quotes"
            value={isLoading ? '...' : receivedQuotes}
            subtitle="Awaiting selection"
            color="yellow"
            link="/procurement/quotes?status=received"
          />
          <MetricCard
            title="Selected Quotes"
            value={isLoading ? '...' : selectedQuotes}
            subtitle="Ready for PO"
            color="green"
            link="/procurement/quotes?status=selected"
          />
          <MetricCard
            title="Expired Quotes"
            value={isLoading ? '...' : expiredQuotes}
            subtitle="Past validity"
            color="red"
            link="/procurement/quotes?status=expired"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/procurement/orders/create"
            className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            + Create Purchase Order
          </Link>
          <Link
            to="/procurement/suppliers/create"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            + Add Supplier
          </Link>
          <Link
            to="/procurement/grn/create"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            + Record Receipt
          </Link>
          <Link
            to="/procurement/requisitions/create"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            + New Requisition
          </Link>
        </div>
      </div>

      {/* Procurement Modules */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Procurement Modules</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ModuleCard
            title="Purchase Orders"
            description="Create and manage purchase orders, track delivery status, and handle approvals"
            icon="📋"
            link="/procurement/purchase-orders"
            actions={[
              { label: 'Create Order', link: '/procurement/orders/create', primary: true },
              { label: 'Pending Approvals', link: '/procurement/purchase-orders?status=pending' },
            ]}
          />

          <ModuleCard
            title="Suppliers"
            description="Manage supplier information, track performance, and maintain vendor relationships"
            icon="🏢"
            link="/procurement/suppliers"
            actions={[
              { label: 'Add Supplier', link: '/procurement/suppliers/create', primary: true },
              { label: 'Performance Reports', link: '/procurement/suppliers?view=performance' },
            ]}
          />

          <ModuleCard
            title="Purchase Requisitions"
            description="Request items for purchase through proper approval workflows"
            icon="📝"
            link="/procurement/requisitions"
            actions={[
              { label: 'New Requisition', link: '/procurement/requisitions/create', primary: true },
              { label: 'My Requests', link: '/procurement/requisitions?filter=my' },
            ]}
          />

          <ModuleCard
            title="Supplier Quotes"
            description="Request and compare quotes from suppliers, select winning bids"
            icon="💰"
            link="/procurement/quotes"
            actions={[
              { label: 'View Quotes', link: '/procurement/quotes', primary: true },
              { label: 'Compare Quotes', link: '/procurement/quotes?view=comparison' },
            ]}
          />

          <ModuleCard
            title="Goods Receipt (GRN)"
            description="Record received goods, perform quality checks, and update inventory"
            icon="📦"
            link="/procurement/grn"
            actions={[
              { label: 'Record Receipt', link: '/procurement/grn/create', primary: true },
              { label: 'Quality Issues', link: '/procurement/grn?quality=issues' },
            ]}
          />

          <ModuleCard
            title="Purchase Returns"
            description="Process returns to suppliers and handle credit notes"
            icon="↩️"
            link="/procurement/returns"
            actions={[
              { label: 'Create Return', link: '/procurement/returns/create', primary: true },
              { label: 'Credit Notes', link: '/procurement/returns?view=credits' },
            ]}
          />

          <ModuleCard
            title="Reports & Analytics"
            description="View procurement reports, supplier performance, and spending analysis"
            icon="📊"
            link="/procurement/reports"
            actions={[
              { label: 'Spending Report', link: '/procurement/reports/spending' },
              { label: 'Supplier Performance', link: '/procurement/reports/suppliers' },
            ]}
          />
        </div>
      </div>

      {/* Pending Approvals Section - Enhanced for all modules */}
      {(pendingPOs > 0 || pendingRequisitions > 0 || pendingReturns > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending Approvals</h2>
          <div className="space-y-4">
            {pendingRequisitions > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-xl">📝</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {pendingRequisitions} purchase requisitions awaiting approval
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/requisitions?status=pending"
                        className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
                      >
                        Review pending requisitions →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pendingPOs > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-xl">📋</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {pendingPOs} purchase orders awaiting approval
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/purchase-orders?status=pending"
                        className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
                      >
                        Review pending orders →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pendingReturns > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-xl">↩️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {pendingReturns} purchase returns awaiting processing
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/returns?status=pending"
                        className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
                      >
                        Review pending returns →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overdue Items Section - Enhanced for all modules */}
      {(overdueDeliveries > 0 || pendingGRNs > 0 || qualityIssues > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Items Requiring Attention</h2>
          <div className="space-y-4">
            {overdueDeliveries > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-red-400 text-xl">🚨</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      {overdueDeliveries} purchase orders have overdue deliveries
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/purchase-orders?overdue=true"
                        className="text-sm font-medium text-red-800 underline hover:text-red-900"
                      >
                        View overdue orders →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pendingGRNs > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-orange-400 text-xl">📦</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-orange-800">
                      {pendingGRNs} goods receipts awaiting posting to inventory/accounting
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/grn?status=pending"
                        className="text-sm font-medium text-orange-800 underline hover:text-orange-900"
                      >
                        Post pending GRNs →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {qualityIssues > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-red-400 text-xl">⚠️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      {qualityIssues} goods receipts have quality inspection issues
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/grn?quality=issues"
                        className="text-sm font-medium text-red-800 underline hover:text-red-900"
                      >
                        Review quality issues →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {approvedRequisitions > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-green-400 text-xl">✅</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      {approvedRequisitions} approved requisitions ready for purchase order creation
                    </h3>
                    <div className="mt-2">
                      <Link
                        to="/procurement/requisitions?status=approved"
                        className="text-sm font-medium text-green-800 underline hover:text-green-900"
                      >
                        Convert to purchase orders →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementIndexPage;
