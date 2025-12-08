import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database, seeding...');

    // Create demo firm
    const firmResult = await client.query(
      `INSERT INTO firms (name, address, city, state, zip_code, phone, email, website, billing_defaults)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        'Apex Legal Partners LLP',
        '100 Legal Plaza, Suite 500',
        'New York',
        'NY',
        '10001',
        '(212) 555-0100',
        'info@apexlegal.com',
        'https://apexlegal.com',
        JSON.stringify({
          hourlyRate: 450,
          incrementMinutes: 6,
          paymentTerms: 30,
          currency: 'USD'
        })
      ]
    );

    let firmId;
    if (firmResult.rows.length > 0) {
      firmId = firmResult.rows[0].id;
    } else {
      const existingFirm = await client.query(
        `SELECT id FROM firms WHERE name = 'Apex Legal Partners LLP'`
      );
      firmId = existingFirm.rows[0]?.id;
      if (!firmId) {
        throw new Error('Could not create or find firm');
      }
    }

    console.log('Firm ID:', firmId);

    // Create demo user (password: apex2024)
    const passwordHash = await bcrypt.hash('apex2024', 12);
    
    const userResult = await client.query(
      `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3
       RETURNING id`,
      [firmId, 'admin@apex.law', passwordHash, 'John', 'Mitchell', 'owner', 550]
    );

    const userId = userResult.rows[0].id;
    console.log('Demo user created/updated:', userId);

    // Create additional team members
    const teamMembers = [
      ['sarah@apex.law', 'Sarah', 'Chen', 'admin', 500],
      ['michael@apex.law', 'Michael', 'Roberts', 'attorney', 450],
      ['emily@apex.law', 'Emily', 'Davis', 'paralegal', 200],
      ['james@apex.law', 'James', 'Wilson', 'attorney', 475],
      ['lisa@apex.law', 'Lisa', 'Thompson', 'staff', 150],
      ['billing@apex.law', 'Karen', 'Martinez', 'billing', 0],
    ];

    for (const [email, firstName, lastName, role, rate] of teamMembers) {
      await client.query(
        `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, hourly_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING`,
        [firmId, email, passwordHash, firstName, lastName, role, rate]
      );
    }

    // Create some demo clients
    const clients = [
      ['company', 'Quantum Technologies Inc.', null, null, 'Quantum Technologies Inc.', 'legal@quantumtech.com', '(415) 555-0200'],
      ['person', 'Michael Robertson', 'Michael', 'Robertson', null, 'michael.r@email.com', '(212) 555-0301'],
      ['company', 'Meridian Real Estate Group', null, null, 'Meridian Real Estate Group', 'counsel@meridianre.com', '(305) 555-0400'],
      ['company', 'Atlas Manufacturing Co.', null, null, 'Atlas Manufacturing Co.', 'legal@atlasmfg.com', '(312) 555-0500'],
      ['person', 'Elena Vasquez', 'Elena', 'Vasquez', null, 'elena.v@email.com', '(617) 555-0600'],
    ];

    const clientIds = [];
    for (const [type, displayName, firstName, lastName, companyName, email, phone] of clients) {
      const result = await client.query(
        `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, email, phone, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [firmId, type, displayName, firstName, lastName, companyName, email, phone, userId]
      );
      if (result.rows.length > 0) {
        clientIds.push(result.rows[0].id);
      }
    }

    console.log('Created clients:', clientIds.length);

    // Create demo matters if we have clients
    if (clientIds.length > 0) {
      const matters = [
        ['MTR-2024-001', 'Quantum v. TechStart - Patent Infringement', 0, 'intellectual_property', 'active', 'high', 'hourly', 550],
        ['MTR-2024-002', 'Robertson v. NYC Transit Authority', 1, 'personal_injury', 'active', 'medium', 'contingency', null],
        ['MTR-2024-003', 'Meridian Plaza Development', 2, 'real_estate', 'active', 'high', 'flat', null],
        ['MTR-2024-004', 'Quantum Technologies - Series C Funding', 0, 'corporate', 'active', 'urgent', 'hourly', 500],
        ['MTR-2024-005', 'Atlas Employment Dispute', 3, 'employment', 'pending', 'medium', 'retainer', 400],
        ['MTR-2024-006', 'Vasquez Estate Plan', 4, 'estate_planning', 'active', 'low', 'flat', null],
      ];

      for (const [number, name, clientIndex, type, status, priority, billingType, rate] of matters) {
        if (clientIds[clientIndex]) {
          await client.query(
            `INSERT INTO matters (firm_id, number, name, client_id, type, status, priority, billing_type, billing_rate, responsible_attorney, created_by, open_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, NOW())
             ON CONFLICT (number) DO NOTHING`,
            [firmId, number, name, clientIds[clientIndex], type, status, priority, billingType, rate, userId]
          );
        }
      }

      console.log('Created matters');
    }

    // Create groups
    const groups = [
      ['Litigation Team', 'Attorneys and paralegals handling litigation matters', '#EF4444'],
      ['Corporate Team', 'Corporate and transactional practice group', '#3B82F6'],
      ['Administrative Staff', 'Office administrators and support staff', '#10B981'],
    ];

    for (const [name, description, color] of groups) {
      await client.query(
        `INSERT INTO groups (firm_id, name, description, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [firmId, name, description, color]
      );
    }

    console.log('Created groups');

    // Create trust accounts
    await client.query(
      `INSERT INTO trust_accounts (firm_id, bank_name, account_name, account_number_last4, account_type, balance, is_verified)
       VALUES 
         ($1, 'First National Bank', 'Apex Legal IOLTA', '4521', 'iolta', 125750.00, true),
         ($1, 'First National Bank', 'Apex Legal Operating', '7834', 'operating', 89420.50, true)
       ON CONFLICT DO NOTHING`,
      [firmId]
    );

    console.log('Created trust accounts');

    // Update some matters with visibility settings (Clio-like permissions)
    // First, check if visibility column exists
    const visibilityCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matters' AND column_name = 'visibility'
    `);

    if (visibilityCheck.rows.length > 0) {
      // Set MTR-2024-003 (Meridian Plaza Development) as restricted
      await client.query(`
        UPDATE matters SET visibility = 'restricted' 
        WHERE number = 'MTR-2024-003' AND firm_id = $1
      `, [firmId]);

      // Set MTR-2024-005 (Atlas Employment Dispute) as restricted
      await client.query(`
        UPDATE matters SET visibility = 'restricted' 
        WHERE number = 'MTR-2024-005' AND firm_id = $1
      `, [firmId]);

      console.log('Set up matter visibility (restricted matters created)');

      // Add permissions for the restricted matters
      // Get the matter IDs
      const restrictedMatters = await client.query(`
        SELECT id, number FROM matters 
        WHERE visibility = 'restricted' AND firm_id = $1
      `, [firmId]);

      // Get some user IDs for permissions
      const emilyResult = await client.query(`
        SELECT id FROM users WHERE email = 'emily@apex.law'
      `);
      const jamesResult = await client.query(`
        SELECT id FROM users WHERE email = 'james@apex.law'
      `);
      const litigationGroup = await client.query(`
        SELECT id FROM groups WHERE name = 'Litigation Team' AND firm_id = $1
      `, [firmId]);

      // Add permissions to restricted matters
      for (const matter of restrictedMatters.rows) {
        // Add Emily (paralegal) to the matter
        if (emilyResult.rows.length > 0) {
          await client.query(`
            INSERT INTO matter_permissions (matter_id, user_id, permission_level, can_view_documents, can_view_notes, can_edit, granted_by)
            VALUES ($1, $2, 'view', true, true, false, $3)
            ON CONFLICT DO NOTHING
          `, [matter.id, emilyResult.rows[0].id, userId]);
        }

        // Add Litigation Team group to matters
        if (litigationGroup.rows.length > 0) {
          await client.query(`
            INSERT INTO matter_permissions (matter_id, group_id, permission_level, can_view_documents, can_view_notes, can_edit, granted_by)
            VALUES ($1, $2, 'edit', true, true, true, $3)
            ON CONFLICT DO NOTHING
          `, [matter.id, litigationGroup.rows[0].id, userId]);
        }
      }

      console.log('Created matter permissions for restricted matters');
    } else {
      console.log('Visibility column not found - run migration first: add_matter_permissions.sql');
    }

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📧 Demo Login Credentials:');
    console.log('   Email: admin@apex.law');
    console.log('   Password: apex2024');
    console.log('');

  } catch (error) {
    console.error('Seed error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
