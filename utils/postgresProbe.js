const { Client } = require('pg');

const REQUIRED_TABLES = [
  'users',
  'projects',
  'maps',
  'map_versions',
  'scan_history',
  'pages',
  'shares',
  'usage_events',
  'jobs',
];

const buildSslOption = () => ({ rejectUnauthorized: false });

async function probePostgres(databaseUrl) {
  if (!databaseUrl) {
    return {
      configured: false,
      reachable: false,
      missingTables: REQUIRED_TABLES,
      error: 'DATABASE_URL not set',
    };
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: buildSslOption(),
  });

  try {
    await client.connect();

    const ping = await client.query('SELECT 1 AS ok');
    const ok = Number(ping?.rows?.[0]?.ok || 0) === 1;

    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tableSet = new Set((tablesRes.rows || []).map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((name) => !tableSet.has(name));

    return {
      configured: true,
      reachable: ok,
      missingTables,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      missingTables: REQUIRED_TABLES,
      error: error.message || 'Postgres probe failed',
    };
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = {
  REQUIRED_TABLES,
  probePostgres,
};

