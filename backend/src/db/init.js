import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

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

    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    console.log('Executing schema...');
    await client.query(schema);
    console.log('Schema executed successfully!');

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
