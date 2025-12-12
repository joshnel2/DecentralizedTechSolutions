import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

async function runSqlFile(client, filePath) {
  const sql = readFileSync(filePath, 'utf8');
  if (!sql.trim()) return;
  await client.query(sql);
}

async function shouldRunSchema(client) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'firms' LIMIT 1`
  );
  return result.rows.length === 0;
}

// Run .sql migrations (idempotent migrations recommended)
async function runMigrations(client) {
  const migrationsDir = join(__dirname, 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const fullPath = join(migrationsDir, file);
    try {
      console.log(`Running migration: ${file}`);
      await runSqlFile(client, fullPath);
    } catch (error) {
      console.log(`Migration note (${file}):`, error.message);
    }
  }
}

async function initDatabase() {
  // First connect without database to create it
  const adminClient = new Client({
    connectionString: process.env.DATABASE_URL.replace(/\/[^/]+$/, '/postgres'),
  });

  try {
    await adminClient.connect();
    
    // Check if database exists
    const dbName = process.env.DATABASE_URL.split('/').pop().split('?')[0];
    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length === 0) {
      console.log(`Creating database: ${dbName}`);
      await adminClient.query(`CREATE DATABASE ${dbName}`);
    } else {
      console.log(`Database ${dbName} already exists`);
    }
  } catch (error) {
    // Database might already exist or user doesn't have create privileges
    console.log('Database setup note:', error.message);
  } finally {
    await adminClient.end();
  }

  // Now connect to our database and run schema
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Only run schema on empty DBs (schema.sql is not idempotent)
    if (await shouldRunSchema(client)) {
      const schemaPath = join(__dirname, 'schema.sql');
      console.log('Executing schema...');
      await runSqlFile(client, schemaPath);
      console.log('Schema executed successfully!');
    } else {
      console.log('Schema already present; skipping schema.sql');
    }

    // Run migrations for existing databases
    console.log('Running migrations...');
    await runMigrations(client);
    console.log('Migrations complete!');

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

initDatabase()
  .then(() => {
    console.log('Database initialization complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
