import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configure SSL for Azure PostgreSQL
// In production, ALWAYS verify the server certificate to prevent MITM attacks.
// Set AZURE_PG_SSL_CA to the path of the DigiCert Global Root G2 CA cert,
// or set DATABASE_SSL_REJECT_UNAUTHORIZED=false ONLY for local development.
function buildSslConfig() {
  if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL?.includes('sslmode')) {
    return false; // No SSL in local development without explicit sslmode
  }

  const config = { rejectUnauthorized: true }; // Default: verify certs

  // Allow a custom CA certificate (e.g., Azure DigiCert Global Root G2)
  if (process.env.AZURE_PG_SSL_CA) {
    try {
      config.ca = fs.readFileSync(process.env.AZURE_PG_SSL_CA, 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to read SSL CA certificate:', err.message);
    }
  }

  // ONLY allow disabling cert verification via explicit env var (NOT by default)
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn('[DB] WARNING: SSL certificate verification is DISABLED. This should NEVER be used in production with real data.');
    config.rejectUnauthorized = false;
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
