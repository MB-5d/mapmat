const adapter = require('./dbAdapter');

function getUsageByDaySince(sinceModifier) {
  return adapter.queryAll(`
    SELECT date(created_at) as day, event_type as eventType,
           COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, eventType
    ORDER BY day DESC
  `, [sinceModifier]);
}

function getUsageTotalsSince(sinceModifier) {
  return adapter.queryAll(`
    SELECT event_type as eventType, COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY eventType
    ORDER BY events DESC
  `, [sinceModifier]);
}

module.exports = {
  getUsageByDaySince,
  getUsageTotalsSince,
};
