/**
 * Request validation middleware using Zod schemas.
 *
 * Usage in routes:
 *   import { validate, schemas } from '../middleware/validate.js';
 *   router.post('/register', validate(schemas.register), async (req, res) => { ... });
 *
 * The validated & parsed data replaces req.body, so route handlers get
 * clean, typed data with defaults applied.
 */
import { z } from 'zod';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }
    // Replace body with parsed & sanitized data
    req.body = result.data;
    next();
  };
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: errors,
      });
    }
    req.query = result.data;
    next();
  };
}

// ============================================
// Reusable field validators
// ============================================

const email = z.string().email('Invalid email address').max(255).transform(v => v.toLowerCase().trim());
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().min(1, 'Required').max(100).transform(v => v.trim());
const uuid = z.string().uuid('Invalid ID format');
const optionalUuid = z.string().uuid('Invalid ID format').optional().nullable();

// ============================================
// Route schemas
// ============================================

export const schemas = {
  // Auth
  register: z.object({
    email,
    password,
    firstName: name,
    lastName: name,
    firmName: z.string().max(255).optional(),
  }),

  login: z.object({
    email: z.string().min(1, 'Email is required').max(255),
    password: z.string().min(1, 'Password is required').max(128),
  }),

  updatePassword: z.object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: password,
  }),

  forgotPassword: z.object({
    email,
  }),

  resetPassword: z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: password,
  }),

  // Clients
  createClient: z.object({
    displayName: z.string().min(1).max(255),
    type: z.enum(['person', 'company']).default('person'),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    companyName: z.string().max(255).optional(),
    email: z.string().email().max(255).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    addressStreet: z.string().optional().nullable(),
    addressCity: z.string().max(100).optional().nullable(),
    addressState: z.string().max(50).optional().nullable(),
    addressZip: z.string().max(20).optional().nullable(),
    notes: z.string().optional().nullable(),
    tags: z.array(z.string()).optional().default([]),
    contactType: z.string().max(50).optional().default('client'),
  }).passthrough(), // Allow additional fields for backwards compatibility

  // Matters
  createMatter: z.object({
    name: z.string().min(1, 'Matter name is required').max(255),
    clientId: optionalUuid,
    type: z.string().max(50).optional(),
    status: z.enum(['active', 'pending', 'closed', 'on_hold', 'archived']).default('active'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    billingType: z.enum(['hourly', 'flat', 'contingency', 'retainer', 'pro_bono']).default('hourly'),
    billingRate: z.number().min(0).optional().nullable(),
    description: z.string().optional().nullable(),
    responsibleAttorney: optionalUuid,
    originatingAttorney: optionalUuid,
  }).passthrough(),

  // Time entries
  createTimeEntry: z.object({
    matterId: uuid,
    date: z.string().min(1, 'Date is required'),
    hours: z.number().min(0).max(24),
    description: z.string().min(1, 'Description is required').max(5000),
    billable: z.boolean().default(true),
    rate: z.number().min(0),
    activityCode: z.string().max(20).optional().nullable(),
  }).passthrough(),

  // Invoices
  createInvoice: z.object({
    matterId: optionalUuid,
    clientId: optionalUuid,
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().optional().nullable(),
  }).passthrough(),
};
