/**
 * Migration Runner with Version Tracking
 *
 * Tracks which .sql migration files have been applied in a `schema_migrations`
 * table. On each run, only unapplied migrations are executed (in alphabetical
 * order by filename).
 *
 * Usage:
 *   node src/db/migrationRunner.js          # Run pending migrations
 *   node src/db/migrationRunner.js --status # Show migration status
 *
 * Or programmatically:
 *   import { runPendingMigrations } from './db/migrationRunner.js';
 *   await runPendingMigrations();
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

const { Client } = pg;

/**
 * Ensure the schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );
  `);
}

/**
 * Get list of already-applied migration filenames.
 */
async function getAppliedMigrations(client) {
  const result = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map(r => r.filename));
}

/**
 * Get all .sql files in the migrations directory, sorted alphabetically.
 */
function getMigrationFiles() {
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !f.startsWith('diagnostic'))
      .sort();
  } catch (err) {
    console.error(`Cannot read migrations directory: ${MIGRATIONS_DIR}`, err.message);
    return [];
  }
}

/**
 * Simple checksum for migration content (detect if file changed after applying).
 */
function checksumSql(sql) {
  const { createHash } = await_import_crypto();
  return createHash('sha256').update(sql).digest('hex').substring(0, 16);
}

// Lazy crypto import (top-level await not used for compatibility)
let _crypto = null;
function await_import_crypto() {
  if (!_crypto) {
    _crypto = require('crypto');
  }
  return _crypto;
}

// Use dynamic import for crypto in ESM
import crypto from 'crypto';
function computeChecksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex').substring(0, 16);
}

/**
 * Run all pending migrations in order.
 * @returns {{ applied: string[], skipped: string[], failed: string[] }}
 */
export async function runPendingMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  });

  const results = { applied: [], skipped: [], failed: [] };

  try {
    await client.connect();
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const allFiles = getMigrationFiles();

    const pending = allFiles.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('[MIGRATIONS] All migrations are up to date');
      return results;
    }

    console.log(`[MIGRATIONS] ${pending.length} pending migration(s) to apply:`);

    for (const filename of pending) {
      const filePath = join(MIGRATIONS_DIR, filename);
      const sql = readFileSync(filePath, 'utf8');
      const checksum = computeChecksum(sql);

      const startTime = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        const executionTime = Date.now() - startTime;

        await client.query(
          `INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
           VALUES ($1, $2, $3)
           ON CONFLICT (filename) DO NOTHING`,
          [filename, checksum, executionTime]
        );
        await client.query('COMMIT');

        console.log(`  ✓ ${filename} (${executionTime}ms)`);
        results.applied.push(filename);
      } catch (err) {
        await client.query('ROLLBACK');
        const executionTime = Date.now() - startTime;

        // Many migrations use IF NOT EXISTS / DO $$ and may "fail" safely
        if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
          // Record as applied even if it was a no-op (idempotent migration)
          try {
            await client.query(
              `INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
               VALUES ($1, $2, $3)
               ON CONFLICT (filename) DO NOTHING`,
              [filename, checksum, executionTime]
            );
          } catch { /* ignore tracking failure */ }
          console.log(`  ~ ${filename} (already applied, now tracked)`);
          results.skipped.push(filename);
        } else {
          console.error(`  ✗ ${filename}: ${err.message}`);
          results.failed.push(filename);
          // Don't stop on failure -- some migrations are independent
        }
      }
    }

    console.log(`[MIGRATIONS] Done: ${results.applied.length} applied, ${results.skipped.length} skipped, ${results.failed.length} failed`);
    return results;
  } finally {
    await client.end();
  }
}

/**
 * Show migration status (applied vs pending).
 */
export async function getMigrationStatus() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  });

  try {
    await client.connect();
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const allFiles = getMigrationFiles();

    // Get full details for applied migrations
    const detailsResult = await client.query(
      'SELECT filename, applied_at, execution_time_ms FROM schema_migrations ORDER BY filename'
    );
    const details = new Map(detailsResult.rows.map(r => [r.filename, r]));

    const status = allFiles.map(f => ({
      filename: f,
      applied: applied.has(f),
      appliedAt: details.get(f)?.applied_at || null,
      executionTimeMs: details.get(f)?.execution_time_ms || null,
    }));

    return {
      total: allFiles.length,
      applied: status.filter(s => s.applied).length,
      pending: status.filter(s => !s.applied).length,
      migrations: status,
    };
  } finally {
    await client.end();
  }
}

// CLI support: run directly with node src/db/migrationRunner.js
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  const arg = process.argv[2];

  if (arg === '--status') {
    getMigrationStatus()
      .then(status => {
        console.log(`\nMigration Status: ${status.applied}/${status.total} applied, ${status.pending} pending\n`);
        for (const m of status.migrations) {
          const icon = m.applied ? '✓' : '○';
          const time = m.appliedAt ? ` (${new Date(m.appliedAt).toISOString()})` : '';
          console.log(`  ${icon} ${m.filename}${time}`);
        }
        process.exit(0);
      })
      .catch(err => {
        console.error('Failed to get migration status:', err);
        process.exit(1);
      });
  } else {
    runPendingMigrations()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Migration runner failed:', err);
        process.exit(1);
      });
  }
}
