const { Client } = require('pg');
const { REQUIRED_TABLES } = require('./postgresProbe');

const buildSslOption = () => ({ rejectUnauthorized: false });

async function probePostgresParity({ databaseUrl, sqliteDb }) {
  if (!databaseUrl) {
    return {
      configured: false,
      reachable: false,
      allMatch: false,
      tables: REQUIRED_TABLES.map((table) => ({
        table,
        sqlite: Number(sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count || 0),
        postgres: null,
        match: false,
      })),
      error: 'DATABASE_URL not set',
    };
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: buildSslOption(),
  });

  try {
    await client.connect();
    const tables = [];
    for (const table of REQUIRED_TABLES) {
      const sqlite = Number(sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count || 0);
      const postgresResult = await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
      const postgres = Number(postgresResult?.rows?.[0]?.count || 0);
      tables.push({
        table,
        sqlite,
        postgres,
        match: sqlite === postgres,
      });
    }

    const allMatch = tables.every((row) => row.match);
    return {
      configured: true,
      reachable: true,
      allMatch,
      tables,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      allMatch: false,
      tables: [],
      error: error.message || 'Postgres parity probe failed',
    };
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = {
  probePostgresParity,
};
