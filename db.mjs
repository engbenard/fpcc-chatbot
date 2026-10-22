import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function initialiseDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id BIGSERIAL PRIMARY KEY,
      reference VARCHAR(30) UNIQUE NOT NULL,
      owner TEXT,
      type VARCHAR(100),
      category VARCHAR(100),
      description TEXT NOT NULL,
      location TEXT,
      citizen_name VARCHAR(150),
      citizen_contact VARCHAR(100),
      source VARCHAR(30) DEFAULT 'web',
      department VARCHAR(100),
      assigned_to VARCHAR(150),
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(30) DEFAULT 'submitted',
      resolution_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS owner TEXT;`);
  await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS type VARCHAR(100);`);
}

export async function createReport({ reference, owner, type, location, description, source }) {
  const result = await pool.query(
    `INSERT INTO reports
      (reference, owner, type, category, location, description, source, status)
     VALUES ($1,$2,$3,$3,$4,$5,$6,'submitted')
     RETURNING reference, status, created_at`,
    [reference, owner, type, location, description, source]
  );
  return result.rows[0];
}

export async function findReport(reference, owner) {
  const result = await pool.query(
    `SELECT reference, type, location, status, department, assigned_to,
            priority, resolution_notes, created_at, updated_at, resolved_at
       FROM reports
      WHERE reference = $1 AND owner = $2
      LIMIT 1`,
    [reference.toUpperCase(), owner]
  );
  return result.rows[0] || null;
}
