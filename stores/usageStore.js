const db = require('../db');

function getUsageByDaySince(sinceModifier) {
  return db.prepare(`
    SELECT date(created_at) as day, event_type as eventType,
           COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, eventType
    ORDER BY day DESC
  `).all(sinceModifier);
}

function getUsageTotalsSince(sinceModifier) {
  return db.prepare(`
    SELECT event_type as eventType, COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY eventType
    ORDER BY events DESC
  `).all(sinceModifier);
}

module.exports = {
  getUsageByDaySince,
  getUsageTotalsSince,
};
