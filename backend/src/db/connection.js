import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configure SSL for Azure PostgreSQL in production
const sslConfig = process.env.NODE_ENV === 'production' 
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  // Increase idle timeout for long-running operations (10 minutes)
  idleTimeoutMillis: 600000,
  // Increase connection timeout (10 seconds)
  connectionTimeoutMillis: 10000,
  ssl: sslConfig,
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
