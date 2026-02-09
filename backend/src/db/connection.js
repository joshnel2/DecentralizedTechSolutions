import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configure SSL for Azure PostgreSQL.
//
// MIGRATION PATH (backwards-compatible):
//   1. Current default: rejectUnauthorized: false (matches old behavior, won't break existing deploys)
//   2. Set DATABASE_SSL_VERIFY=true in production to enable cert verification (recommended)
//   3. Optionally set AZURE_PG_SSL_CA to a CA cert path for custom CAs
//
// The goal is to reach rejectUnauthorized: true in production, but we can't flip
// the default without risking breaking existing deployments that don't have the
// Azure CA cert configured. The env var opt-in lets you upgrade safely.
function buildSslConfig() {
  if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL?.includes('sslmode')) {
    return false; // No SSL in local development without explicit sslmode
  }

  // Default: rejectUnauthorized false for backwards compatibility with existing deploys.
  // Set DATABASE_SSL_VERIFY=true to enable proper cert verification.
  const shouldVerify = process.env.DATABASE_SSL_VERIFY === 'true';
  const config = { rejectUnauthorized: shouldVerify };

  if (!shouldVerify && process.env.NODE_ENV === 'production') {
    console.warn('[DB] WARNING: SSL certificate verification is DISABLED. Set DATABASE_SSL_VERIFY=true and optionally AZURE_PG_SSL_CA for secure connections.');
  }

  // Allow a custom CA certificate (e.g., Azure DigiCert Global Root G2)
  if (process.env.AZURE_PG_SSL_CA) {
    try {
      config.ca = fs.readFileSync(process.env.AZURE_PG_SSL_CA, 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to read SSL CA certificate:', err.message);
    }
  }

  return config;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  // 2 minute idle timeout (was 10 min -- too long, wastes Azure connection slots)
  idleTimeoutMillis: 120000,
  // Connection timeout (10 seconds)
  connectionTimeoutMillis: 10000,
  ssl: buildSslConfig(),
  // Keep connections alive - prevents Azure from closing idle connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Track connection errors but don't crash the app
pool.on('error', (err) => {
  console.error('[DB POOL] Unexpected error on idle client:', err.message);
  // Don't exit - let the pool recover by getting a new connection
});

// Helper for transactions
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Query helper with logging in dev
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
  }
  return res;
}

export default pool;
