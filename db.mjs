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

  const additions = [
    ['owner', 'TEXT'],
    ['type', 'VARCHAR(100)'],
    ['category', 'VARCHAR(100)'],
    ['citizen_name', 'VARCHAR(150)'],
    ['citizen_contact', 'VARCHAR(100)'],
    ['source', "VARCHAR(30) DEFAULT 'web'"],
    ['department', 'VARCHAR(100)'],
    ['assigned_to', 'VARCHAR(150)'],
    ['priority', "VARCHAR(20) DEFAULT 'normal'"],
    ['status', "VARCHAR(30) DEFAULT 'submitted'"],
    ['resolution_notes', 'TEXT'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()'],
    ['resolved_at', 'TIMESTAMPTZ']
  ];

  for (const [name, type] of additions) {
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS ${name} ${type};`);
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reports_department_idx ON reports(department);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at DESC);`);
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

export async function listReports({ status='', department='', priority='', source='', q='', limit=200 } = {}) {
  const where = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };

  if (status) add('LOWER(status) = LOWER(?)', status);
  if (department) add('LOWER(COALESCE(department, \'\')) = LOWER(?)', department);
  if (priority) add('LOWER(priority) = LOWER(?)', priority);
  if (source) add('LOWER(source) = LOWER(?)', source);

  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    where.push(`(
      reference ILIKE ${p}
      OR COALESCE(category,'') ILIKE ${p}
      OR COALESCE(type,'') ILIKE ${p}
      OR COALESCE(location,'') ILIKE ${p}
      OR COALESCE(description,'') ILIKE ${p}
      OR COALESCE(department,'') ILIKE ${p}
      OR COALESCE(assigned_to,'') ILIKE ${p}
    )`);
  }

  values.push(Math.min(Math.max(Number(limit) || 200, 1), 1000));
  const limitParam = `$${values.length}`;

  const sql = `
    SELECT id, reference, category, type, description, location, source,
           department, assigned_to, priority, status, resolution_notes,
           created_at, updated_at, resolved_at
      FROM reports
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT ${limitParam}
  `;

  return (await pool.query(sql, values)).rows;
}

export async function getReportStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE LOWER(status) = 'submitted')::int AS submitted,
      COUNT(*) FILTER (WHERE LOWER(status) = 'in progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE LOWER(status) = 'resolved')::int AS resolved,
      COUNT(*) FILTER (
        WHERE LOWER(status) <> 'resolved'
        AND created_at < NOW() - INTERVAL '7 days'
      )::int AS overdue,
      COALESCE(
        ROUND(
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
          FILTER (WHERE resolved_at IS NOT NULL)::numeric,
          1
        ),
        0
      ) AS avg_resolution_hours
    FROM reports
  `);

  const byStatus = await pool.query(`
    SELECT COALESCE(status,'Unspecified') AS label, COUNT(*)::int AS count
    FROM reports GROUP BY status ORDER BY count DESC
  `);

  const byDepartment = await pool.query(`
    SELECT COALESCE(NULLIF(department,''),'Unassigned') AS label, COUNT(*)::int AS count
    FROM reports GROUP BY COALESCE(NULLIF(department,''),'Unassigned')
    ORDER BY count DESC LIMIT 10
  `);

  const byCategory = await pool.query(`
    SELECT COALESCE(NULLIF(category,''), NULLIF(type,''), 'Unspecified') AS label, COUNT(*)::int AS count
    FROM reports GROUP BY COALESCE(NULLIF(category,''), NULLIF(type,''), 'Unspecified')
    ORDER BY count DESC LIMIT 10
  `);

  return {
    ...result.rows[0],
    by_status: byStatus.rows,
    by_department: byDepartment.rows,
    by_category: byCategory.rows
  };
}

export async function updateReport(reference, changes) {
  const allowed = {
    status: changes.status,
    department: changes.department,
    assigned_to: changes.assigned_to,
    priority: changes.priority,
    resolution_notes: changes.resolution_notes
  };

  const sets = [];
  const values = [];

  for (const [column, value] of Object.entries(allowed)) {
    if (value === undefined) continue;
    values.push(value === '' ? null : value);
    sets.push(`${column} = $${values.length}`);
  }

  if (!sets.length) return null;

  const normalizedStatus = changes.status?.toLowerCase();
  if (normalizedStatus === 'resolved') {
    sets.push(`resolved_at = COALESCE(resolved_at, NOW())`);
  } else if (changes.status !== undefined) {
    sets.push(`resolved_at = NULL`);
  }

  sets.push(`updated_at = NOW()`);
  values.push(reference.toUpperCase());

  const result = await pool.query(
    `UPDATE reports
        SET ${sets.join(', ')}
      WHERE reference = $${values.length}
      RETURNING id, reference, category, type, description, location, source,
                department, assigned_to, priority, status, resolution_notes,
                created_at, updated_at, resolved_at`,
    values
  );

  return result.rows[0] || null;
}
