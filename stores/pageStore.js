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

function transactionAsync(fn) {
  return adapter.transactionAsync(fn);
}

module.exports = {
  getPageColumnsAsync,
  getPageByUrlAsync,
  insertPageAsync,
  updatePageAsync,
  transactionAsync,
};
