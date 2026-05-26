import { z } from 'zod';

export const hrConfigSchema = z.object({
  // Leave Management Settings
  enable_leave_approval: z.boolean().optional(),
  max_consecutive_leave_days: z
    .number()
    .min(1, 'Must be at least 1 day')
    .max(365, 'Cannot exceed 365 days'),
  annual_leave_days: z.number().min(0, 'Cannot be negative').max(365, 'Cannot exceed 365 days'),
  sick_leave_days: z.number().min(0, 'Cannot be negative').max(365, 'Cannot exceed 365 days'),

  // Attendance Settings
  enable_attendance_tracking: z.boolean().optional(),
  working_hours_per_day: z
    .number()
    .min(1, 'Must be at least 1 hour')
    .max(24, 'Cannot exceed 24 hours'),
  late_arrival_grace_minutes: z
    .number()
    .min(0, 'Cannot be negative')
    .max(120, 'Cannot exceed 120 minutes'),

  // Payroll Settings
  payroll_currency: z.string().length(3, 'Currency code must be 3 characters'),
  payroll_frequency: z.enum(['monthly', 'bi_weekly', 'weekly'], {
    errorMap: () => ({ message: 'Invalid payroll frequency' }),
  }),
  tax_rate_percentage: z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  enable_overtime_calculation: z.boolean().optional(),
  overtime_multiplier: z.number().min(1, 'Must be at least 1.0').max(5, 'Cannot exceed 5.0'),

  // Staff ID Settings
  staff_id_prefix: z
    .string()
    .max(10, 'Prefix cannot exceed 10 characters')
    .regex(/^[A-Za-z0-9]*$/, 'Prefix can only contain letters and numbers'),
  staff_id_padding: z.number().min(2, 'Minimum 2 digits').max(6, 'Maximum 6 digits'),

  // Pension Settings
  enable_pension: z.boolean().optional(),
  employee_pension_rate: z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  employer_pension_rate: z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  pension_provider_name: z.string().optional(),

  // PAYE / Tax Settings (Nigeria Tax Act 2024)
  enable_paye: z.boolean().optional(),
  enable_development_levy: z.boolean().optional(),
  development_levy_annual_amount: z.number().min(0, 'Cannot be negative'),

  // Workflow References (optional)
  default_leave_workflow: z.number().nullable().optional(),
  extended_leave_workflow: z.number().nullable().optional(),
  payroll_approval_workflow: z.number().nullable().optional(),
});

export type HRConfigFormData = z.infer<typeof hrConfigSchema>;
