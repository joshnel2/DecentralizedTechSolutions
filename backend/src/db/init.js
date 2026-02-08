import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

// Run migrations to update existing databases
async function runMigrations(client) {
  const migrations = [
    // Add billing_rate column to matter_assignments if it doesn't exist
    `DO $$ 
     BEGIN 
       IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'matter_assignments' AND column_name = 'billing_rate') THEN
         ALTER TABLE matter_assignments ADD COLUMN billing_rate DECIMAL(10,2);
       END IF;
     END $$;`,
    
    // Add Clio migration tracking columns to time_entries
    `DO $$ 
     BEGIN 
       IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'time_entries' AND column_name = 'clio_id') THEN
         ALTER TABLE time_entries ADD COLUMN clio_id BIGINT;
         ALTER TABLE time_entries ADD COLUMN clio_created_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE time_entries ADD COLUMN clio_updated_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE time_entries ADD COLUMN migrated_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE time_entries ADD COLUMN migration_source VARCHAR(50);
       END IF;
     END $$;`,
    
    // Add Clio migration tracking columns to expenses
    `DO $$ 
     BEGIN 
       IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'expenses' AND column_name = 'clio_id') THEN
         ALTER TABLE expenses ADD COLUMN clio_id BIGINT;
         ALTER TABLE expenses ADD COLUMN clio_created_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE expenses ADD COLUMN clio_updated_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE expenses ADD COLUMN migrated_at TIMESTAMP WITH TIME ZONE;
         ALTER TABLE expenses ADD COLUMN migration_source VARCHAR(50);
       END IF;
     END $$;`,
    
    // Create indexes for Clio deduplication (partial indexes for efficiency)
    `CREATE INDEX IF NOT EXISTS idx_time_entries_clio_id ON time_entries(clio_id) WHERE clio_id IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_clio_id ON expenses(clio_id) WHERE clio_id IS NOT NULL;`,
    
    // Create unique constraint for deduplication
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_clio_unique ON time_entries(firm_id, clio_id) WHERE clio_id IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_clio_unique ON expenses(firm_id, clio_id) WHERE clio_id IS NOT NULL;`,
    
    // Vector embedding support for semantic search
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    `CREATE TABLE IF NOT EXISTS document_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        chunk_text TEXT NOT NULL,
        chunk_hash VARCHAR(64) NOT NULL,
        embedding VECTOR(1536),
        encrypted_embedding BYTEA,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(firm_id, document_id, chunk_index),
        CONSTRAINT chunk_index_nonnegative CHECK (chunk_index >= 0)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_document_embeddings_firm_embedding ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WHERE firm_id IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_hash ON document_embeddings(firm_id, chunk_hash);`,
    `ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;`,
    `DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'document_embeddings' 
            AND policyname = 'firm_isolation_policy'
        ) THEN
            CREATE POLICY firm_isolation_policy ON document_embeddings
                USING (firm_id = current_setting('app.current_firm_id')::UUID);
        END IF;
    END
    $$;`,
    `CREATE TABLE IF NOT EXISTS document_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) NOT NULL CHECK (
            relationship_type IN ('cites', 'references', 'amends', 'depends_on', 'similar_to', 'contradicts', 'supersedes')
        ),
        confidence FLOAT DEFAULT 1.0,
        context TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CHECK (source_document_id != target_document_id),
        UNIQUE(firm_id, source_document_id, target_document_id, relationship_type)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_document_relationships_source ON document_relationships(firm_id, source_document_id, relationship_type);`,
    `CREATE INDEX IF NOT EXISTS idx_document_relationships_target ON document_relationships(firm_id, target_document_id, relationship_type);`,
    `CREATE TABLE IF NOT EXISTS lawyer_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        preference_type VARCHAR(50) NOT NULL,
        preference_key VARCHAR(100) NOT NULL,
        preference_value JSONB NOT NULL,
        confidence FLOAT DEFAULT 0.5,
        source VARCHAR(50) NOT NULL DEFAULT 'explicit' CHECK (
            source IN ('explicit', 'inferred', 'imported', 'default')
        ),
        occurrences INTEGER DEFAULT 1,
        context VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(firm_id, lawyer_id, preference_type, preference_key)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_lawyer_preferences_lookup ON lawyer_preferences(firm_id, lawyer_id, preference_type);`,
    `CREATE TABLE IF NOT EXISTS retrieval_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        query_hash VARCHAR(64) NOT NULL,
        query_text TEXT NOT NULL,
        retrieved_document_ids UUID[] NOT NULL,
        selected_document_id UUID,
        selected_chunk_index INTEGER,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        session_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_lookup ON retrieval_feedback(firm_id, lawyer_id, query_hash);`,
    `CREATE TABLE IF NOT EXISTS edit_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_text_hash VARCHAR(64) NOT NULL,
        edited_text_hash VARCHAR(64) NOT NULL,
        original_text_prefix TEXT,
        edited_text_prefix TEXT,
        context VARCHAR(100) NOT NULL,
        occurrences INTEGER DEFAULT 1,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(firm_id, lawyer_id, original_text_hash, edited_text_hash, context)
    );`,
    `DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'document_ai_insights' 
            AND column_name = 'embedding_vector'
        ) THEN
            ALTER TABLE document_ai_insights ADD COLUMN embedding_vector VECTOR(1536);
        END IF;
    END
    $$;`,
    `CREATE INDEX IF NOT EXISTS idx_document_ai_insights_embedding ON document_ai_insights USING ivfflat (embedding_vector vector_cosine_ops) WHERE embedding_vector IS NOT NULL;`,
    `DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'document_ai_insights' 
            AND column_name = 'encrypted_embedding'
        ) THEN
            ALTER TABLE document_ai_insights ADD COLUMN encrypted_embedding BYTEA;
        END IF;
    END
    $$;`,
    `CREATE INDEX IF NOT EXISTS idx_document_ai_insights_firm_embedding ON document_ai_insights(firm_id) WHERE embedding_vector IS NOT NULL;`,
  ];

  for (const migration of migrations) {
    try {
      await client.query(migration);
    } catch (error) {
      console.log('Migration note:', error.message);
    }
  }

  // Run migration SQL files from the migrations/ directory
  // These create the background agent, learning, and harness intelligence tables
  const migrationFiles = [
    'add_ai_background_tasks.sql',
    'add_ai_learnings.sql',
    'add_ai_learning_patterns.sql',
    'add_learning_pattern_levels.sql',
    'add_ai_task_checkpoints.sql',
    'add_review_queue.sql',
    'add_background_agent_indexes.sql',
    'add_document_learning.sql',
    'add_document_ai_insights.sql',
    'add_harness_intelligence.sql',
    'add_documents_created_at_column.sql',
    'add_attorney_identity.sql',
    'add_attorney_exemplars.sql',
  ];

  const migrationsDir = join(__dirname, 'migrations');
  for (const file of migrationFiles) {
    try {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`  Applied migration: ${file}`);
    } catch (error) {
      // Migrations are idempotent (IF NOT EXISTS, DO $$ checks)
      // so errors here usually mean the migration was already applied
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        // Expected for re-runs
      } else {
        console.log(`  Migration note (${file}): ${error.message}`);
      }
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

    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    console.log('Executing schema...');
    await client.query(schema);
    console.log('Schema executed successfully!');

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
