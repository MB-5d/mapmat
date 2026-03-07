const adapter = require('./dbAdapter');

function getPageColumns() {
  return adapter.queryAll('PRAGMA table_info(pages)').map((col) => col.name);
}

function getPageByUrl(url, selectColumns) {
  const columns = Array.isArray(selectColumns) && selectColumns.length > 0
    ? selectColumns
    : ['url'];
  return adapter.queryOne(`
    SELECT ${columns.join(', ')}
    FROM pages
    WHERE url = ?
  `, [url]);
}

function insertPage(row, { hasType = false, hasDepth = false } = {}) {
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

  adapter.execute(`
    INSERT INTO pages (${insertColumns.join(', ')}, created_at, updated_at)
    VALUES (${insertColumns.map(() => '?').join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, values);
}

function updatePage(row, { hasType = false, hasDepth = false } = {}) {
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

  adapter.execute(`
    UPDATE pages
    SET ${updateColumns.map((col) => `${col} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE url = ?
  `, values);
}

function transaction(fn) {
  return adapter.transaction(fn);
}

module.exports = {
  getPageColumns,
  getPageByUrl,
  insertPage,
  updatePage,
  transaction,
};
