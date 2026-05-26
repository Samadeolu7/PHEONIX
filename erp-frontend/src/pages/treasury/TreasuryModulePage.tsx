import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  CreditCard,
  Building2,
  ArrowLeftRight,
  FileText,
  Plus,
  RefreshCw,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
} from 'lucide-react';

interface SectionCard {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
}

interface Section {
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  cards: SectionCard[];
}

const SECTIONS: Section[] = [
  {
    title: 'Expenses',
    color: 'text-rose-800',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    iconBg: 'bg-rose-100 group-hover:bg-rose-200',
    iconColor: 'text-rose-600',
    cards: [
      {
        title: 'All Expenses',
        description: 'View, approve, and post general expenses to the GL',
        path: '/expenses',
        icon: Receipt,
      },
      {
        title: 'New Expense',
        description: 'Record a direct or reimbursement expense linked to a bank account',
        path: '/expenses/new',
        icon: Plus,
        badge: 'Quick Add',
      },
      {
        title: 'Prepaid Expenses',
        description: 'Manage prepaid expense amortization schedules and tracking',
        path: '/expenses/prepaid',
        icon: CalendarDays,
      },
    ],
  },
  {
    title: 'Bank Management',
    color: 'text-blue-800',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconBg: 'bg-blue-100 group-hover:bg-blue-200',
    iconColor: 'text-blue-600',
    cards: [
      {
        title: 'Bank Accounts',
        description: 'GL-linked bank accounts with live balances and transaction history',
        path: '/banks/accounts',
        icon: CreditCard,
      },
      {
        title: 'Banks',
        description: 'Manage banking institutions, branch details, and account managers',
        path: '/banks',
        icon: Building2,
      },
      {
        title: 'Inter-bank Transfers',
        description: 'Initiate and review bank-to-bank transfers with dual-approval',
        path: '/banks/transfers',
        icon: ArrowLeftRight,
      },
      {
        title: 'New Inter-bank Transfer',
        description: 'Create a bank-to-bank transfer with automatic GL journal entries',
        path: '/banks/transfers/new',
        icon: Plus,
        badge: 'Quick Add',
      },
      {
        title: 'Bank Payments',
        description: 'Pay supplier invoices or direct expenses from bank accounts',
        path: '/banks/payments',
        icon: Receipt,
      },
      {
        title: 'Bank Reconciliation',
        description: 'Reconcile system balances against bank statements',
        path: '/treasury/bank-reconciliation',
        icon: BookOpen,
      },
    ],
  },
  {
    title: 'Petty Cash',
    color: 'text-amber-800',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconBg: 'bg-amber-100 group-hover:bg-amber-200',
    iconColor: 'text-amber-600',
    cards: [
      {
        title: 'Petty Cash Dashboard',
        description: 'Overview of all petty cash funds, balances, and recent activity',
        path: '/treasury/petty-cash',
        icon: Wallet,
      },
      {
        title: 'Petty Cash Request',
        description: 'Manage petty cash vouchers — create, disburse, retire, and reconcile',
        path: '/treasury/petty-cash/vouchers',
        icon: FileText,
      },
      {
        title: 'Reimbursements',
        description: 'Track all fund reimbursement requests and their approval status',
        path: '/treasury/petty-cash/replenishments',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    title: 'Operations',
    color: 'text-teal-800',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    iconBg: 'bg-teal-100 group-hover:bg-teal-200',
    iconColor: 'text-teal-600',
    cards: [
      {
        title: 'Treasury Dashboard',
        description: 'Daily cash operations: collections, transfers, cashier reconciliations',
        path: '/treasury/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
];

const TreasuryModulePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-teal-700" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Treasury & Expenses</h1>
          </div>
          <p className="text-gray-500 ml-13 pl-1">
            Manage expenses, bank accounts, petty cash, and daily treasury operations
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <h2
                className={`text-lg font-semibold mb-4 pb-2 border-b ${section.color} ${section.borderColor}`}
              >
                {section.title}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.cards.map(card => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.path}
                      to={card.path}
                      className={`group relative bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${section.borderColor} hover:border-current`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${section.iconBg}`}
                        >
                          <Icon className={`w-5 h-5 ${section.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">
                              {card.title}
                            </h3>
                            {card.badge && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                {card.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">
                            {card.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TreasuryModulePage;
