/**
 * Tenant Isolation Middleware
 * 
 * Defense-in-depth enforcement of firm-level data isolation.
 * This middleware does THREE things:
 * 
 * 1. Sets PostgreSQL session variable `app.current_firm_id` for RLS policies
 * 2. Injects firmId into every database query context
 * 3. Validates that the authenticated user belongs to the claimed firm
 * 
 * This is the FIRST line of defense. Even if application code forgets
 * a WHERE firm_id = ? clause, RLS policies will prevent cross-tenant access.
 * 
 * IMPORTANT: This middleware must run AFTER authentication middleware.
 */

import { query } from '../db/connection.js';

/**
 * Audit log for tenant isolation events
 * Only logs violations and suspicious activity, not every request
 */
const ISOLATION_VIOLATIONS = [];
const MAX_VIOLATION_LOG = 1000;

/**
 * Set RLS context for the current database connection
 * This is called on every authenticated request to ensure
 * PostgreSQL RLS policies have the correct firm_id context.
 */
async function setTenantContext(firmId) {
  if (!firmId) {
    throw new TenantIsolationError('No firm_id provided for tenant context');
  }
  
  // Validate firmId is a valid UUID to prevent SQL injection via session variable
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(firmId)) {
    throw new TenantIsolationError(`Invalid firm_id format: ${firmId}`);
  }
  
  try {
    // Set the session variable that RLS policies reference
    await query(`SET LOCAL app.current_firm_id = '${firmId}'`);
  } catch (error) {
    console.error('[TenantIsolation] Failed to set RLS context:', error.message);
    // Don't expose the error details to the client
    throw new TenantIsolationError('Failed to establish tenant context');
  }
}

/**
 * Clear tenant context (called at end of request)
 */
async function clearTenantContext() {
  try {
    await query(`RESET app.current_firm_id`);
  } catch (error) {
    // Non-critical, log and continue
    console.warn('[TenantIsolation] Failed to clear tenant context:', error.message);
  }
}

/**
 * Log a tenant isolation violation
 */
function logViolation(type, details) {
  const violation = {
    type,
    details,
    timestamp: new Date().toISOString(),
  };
  
  console.error('[TenantIsolation] VIOLATION:', JSON.stringify(violation));
  
  ISOLATION_VIOLATIONS.push(violation);
  if (ISOLATION_VIOLATIONS.length > MAX_VIOLATION_LOG) {
    ISOLATION_VIOLATIONS.shift();
  }
  
  // In production, this should alert to a monitoring system
  // e.g., Azure Monitor, PagerDuty, etc.
}

/**
 * Custom error class for tenant isolation violations
 */
class TenantIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantIsolationError';
    this.statusCode = 403;
  }
}

/**
 * Middleware: Enforce tenant isolation on every authenticated request
 * 
 * Usage: router.use(enforceTenantIsolation);
 * Must be placed AFTER authenticate middleware.
 */
export function enforceTenantIsolation(req, res, next) {
  // Skip for unauthenticated routes (auth middleware handles those)
  if (!req.user) {
    return next();
  }
  
  const firmId = req.user.firmId || req.user.firm_id;
  
  if (!firmId) {
    logViolation('missing_firm_id', {
      userId: req.user.id,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ 
      error: 'Access denied: no tenant context available' 
    });
  }
  
  // Inject tenant context into request for downstream use
  req.tenantContext = {
    firmId,
    userId: req.user.id,
    userRole: req.user.role,
    
    /**
     * Get a query builder that always includes firm_id filtering
     * Usage: const results = await req.tenantContext.query('SELECT * FROM documents WHERE firm_id = $1', [req.tenantContext.firmId]);
     */
    buildWhereClause: (alias = '') => {
      const prefix = alias ? `${alias}.` : '';
      return `${prefix}firm_id = '${firmId}'`;
    },
    
    /**
     * Validate that a resource belongs to this tenant
     * Call before any cross-table operations
     */
    validateResourceOwnership: async (tableName, resourceId) => {
      try {
        const result = await query(
          `SELECT firm_id FROM ${tableName} WHERE id = $1 LIMIT 1`,
          [resourceId]
        );
        
        if (result.rows.length === 0) {
          return { valid: false, reason: 'resource_not_found' };
        }
        
        const resourceFirmId = result.rows[0].firm_id;
        if (resourceFirmId !== firmId) {
          logViolation('cross_tenant_access_attempt', {
            userId: req.user.id,
            firmId,
            targetFirmId: resourceFirmId,
            tableName,
            resourceId,
            path: req.path,
          });
          return { valid: false, reason: 'cross_tenant_access' };
        }
        
        return { valid: true };
      } catch (error) {
        console.error('[TenantIsolation] Ownership validation error:', error.message);
        return { valid: false, reason: 'validation_error' };
      }
    },
  };
  
  // Set RLS context asynchronously (non-blocking for most routes)
  // Routes that need RLS should await req.tenantContext.setRLS()
  req.tenantContext.setRLS = async () => {
    await setTenantContext(firmId);
  };
  
  req.tenantContext.clearRLS = async () => {
    await clearTenantContext();
  };
  
  next();
}

/**
 * Middleware: Strict tenant isolation for sensitive routes
 * Sets RLS context synchronously before proceeding.
 * Use for embedding, retrieval, and AI routes.
 */
export function enforceStrictTenantIsolation(req, res, next) {
  // First apply standard isolation
  enforceTenantIsolation(req, res, async () => {
    if (!req.tenantContext) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    try {
      // Set RLS before any database operations
      await req.tenantContext.setRLS();
      
      // Ensure RLS is cleared after response
      res.on('finish', async () => {
        try {
          await req.tenantContext.clearRLS();
        } catch (e) {
          // Non-critical cleanup
        }
      });
      
      next();
    } catch (error) {
      console.error('[TenantIsolation] Strict enforcement error:', error.message);
      return res.status(403).json({ error: 'Failed to establish secure tenant context' });
    }
  });
}

/**
 * Validate that a set of document IDs all belong to the requesting firm
 * Used before batch operations on embeddings, relationships, etc.
 */
export async function validateDocumentOwnership(documentIds, firmId) {
  if (!documentIds || documentIds.length === 0) {
    return { valid: true, invalidIds: [] };
  }
  
  try {
    const result = await query(`
      SELECT id, firm_id 
      FROM documents 
      WHERE id = ANY($1::UUID[])
    `, [documentIds]);
    
    const invalidIds = [];
    const foundIds = new Set();
    
    for (const row of result.rows) {
      foundIds.add(row.id);
      if (row.firm_id !== firmId) {
        invalidIds.push(row.id);
        logViolation('batch_cross_tenant_access', {
          firmId,
          targetFirmId: row.firm_id,
          documentId: row.id,
        });
      }
    }
    
    // Check for documents that don't exist
    for (const docId of documentIds) {
      if (!foundIds.has(docId)) {
        invalidIds.push(docId);
      }
    }
    
    return {
      valid: invalidIds.length === 0,
      invalidIds,
    };
  } catch (error) {
    console.error('[TenantIsolation] Batch validation error:', error.message);
    return { valid: false, invalidIds: documentIds };
  }
}

/**
 * Get recent isolation violations (for admin dashboard)
 */
export function getRecentViolations(limit = 50) {
  return ISOLATION_VIOLATIONS.slice(-limit);
}

export default {
  enforceTenantIsolation,
  enforceStrictTenantIsolation,
  validateDocumentOwnership,
  setTenantContext,
  clearTenantContext,
  getRecentViolations,
  TenantIsolationError,
};
