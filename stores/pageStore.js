const adapter = require('./dbAdapter');
const runtimeProvider = adapter.runtime?.activeProvider || 'sqlite';

async function getPageColumnsAsync() {
  if (runtimeProvider === 'postgres') {
    return (await adapter.queryAllAsync(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pages'
      ORDER BY ordinal_position
    `)).map((col) => col.column_name);
  }
  return (await adapter.queryAllAsync('PRAGMA table_info(pages)')).map((col) => col.name);
}

function getPageByUrlAsync(url, selectColumns) {
  const columns = Array.isArray(selectColumns) && selectColumns.length > 0
    ? selectColumns
    : ['url'];
  return adapter.queryOneAsync(`
    SELECT ${columns.join(', ')}
    FROM pages
    WHERE url = ?
  `, [url]);
}

async function getPagesByUrlsAsync(urls, selectColumns, { batchSize = 500 } = {}) {
  const uniqueUrls = Array.from(new Set((urls || []).filter(Boolean)));
  if (uniqueUrls.length === 0) return [];
  const columns = Array.isArray(selectColumns) && selectColumns.length > 0
    ? selectColumns
    : ['url'];
  const rows = [];
  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 500));
  for (let index = 0; index < uniqueUrls.length; index += safeBatchSize) {
    const batch = uniqueUrls.slice(index, index + safeBatchSize);
    rows.push(...await adapter.queryAllAsync(`
      SELECT ${columns.join(', ')}
      FROM pages
      WHERE url IN (${adapter.placeholders(batch.length)})
    `, batch));
  }
  return rows;
}

function insertPageAsync(row, { hasType = false, hasDepth = false } = {}) {
  const insertColumns = [
    'url',
    'title',
    'status',
    'severity',
    'placement',
    'parent_url',
    'discovery_source',
    'links_in',
  ];
  if (hasType) insertColumns.push('type');
  if (hasDepth) insertColumns.push('depth');

  const values = [
    row.url,
    row.title,
    row.status,
    row.severity,
    row.placement,
    row.parent_url,
    row.discovery_source,
    row.links_in,
  ];
  if (hasType) values.push(row.type ?? null);
  if (hasDepth) values.push(row.depth ?? null);

  return adapter.executeAsync(`
    INSERT INTO pages (${insertColumns.join(', ')}, created_at, updated_at)
    VALUES (${insertColumns.map(() => '?').join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, values);
}

function updatePageAsync(row, { hasType = false, hasDepth = false } = {}) {
  const updateColumns = [
    'title',
    'status',
    'severity',
    'placement',
    'parent_url',
    'discovery_source',
    'links_in',
  ];
  if (hasType) updateColumns.push('type');
  if (hasDepth) updateColumns.push('depth');

  const values = [
    row.title,
    row.status,
    row.severity,
    row.placement,
    row.parent_url,
    row.discovery_source,
    row.links_in,
  ];
  if (hasType) values.push(row.type ?? null);
  if (hasDepth) values.push(row.depth ?? null);
  values.push(row.url);

  return adapter.executeAsync(`
    UPDATE pages
    SET ${updateColumns.map((col) => `${col} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE url = ?
  `, values);
}

async function upsertPagesAsync(rows, { hasType = false, hasDepth = false, batchSize = 500 } = {}) {
  const uniqueRows = Array.from(new Map(
    (rows || []).filter((row) => row?.url).map((row) => [row.url, row])
  ).values());
  if (uniqueRows.length === 0) return { changes: 0 };

  const columns = [
    'url',
    'title',
    'status',
    'severity',
    'placement',
    'parent_url',
    'discovery_source',
    'links_in',
  ];
  if (hasType) columns.push('type');
  if (hasDepth) columns.push('depth');
  const updateColumns = columns.filter((column) => column !== 'url');
  let changes = 0;

  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 500));
  for (let index = 0; index < uniqueRows.length; index += safeBatchSize) {
    const batch = uniqueRows.slice(index, index + safeBatchSize);
    const values = [];
    const valueGroups = batch.map((row) => {
      columns.forEach((column) => values.push(row[column] ?? null));
      return `(${columns.map(() => '?').join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    });
    const result = await adapter.executeAsync(`
      INSERT INTO pages (${columns.join(', ')}, created_at, updated_at)
      VALUES ${valueGroups.join(', ')}
      ON CONFLICT(url) DO UPDATE SET
        ${updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')},
        updated_at = CURRENT_TIMESTAMP
    `, values);
    changes += Number(result?.changes || 0);
  }
  return { changes };
}

function transactionAsync(fn) {
  return adapter.transactionAsync(fn);
}

module.exports = {
  getPageColumnsAsync,
  getPageByUrlAsync,
  getPagesByUrlsAsync,
  insertPageAsync,
  updatePageAsync,
  upsertPagesAsync,
  transactionAsync,
};
