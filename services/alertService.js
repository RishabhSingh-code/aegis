const Alert = require('../models/Alert');
const ResponseLog = require('../models/ResponseLog');
const { broadcast } = require('./events');

const settings = { autoResponse: true, simulator: true };

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clean = (s, max = 60) => String(s ?? '').replace(/[<>&"'`]/g, '').slice(0, max);
const ipRe = /^(\d{1,3}\.){3}\d{1,3}$/;
const SEVS = ['low', 'medium', 'high', 'critical'];

// Attack type -> mitigation playbook (simulated actions)
const ACTIONS = {
  'Port Scan': { action: 'Rate-limited source at perimeter firewall', label: 'Rate-limited' },
  'Brute Force (SSH)': { action: 'Blocked source IP and locked affected account', label: 'Blocked' },
  'DDoS — SYN Flood': { action: 'Null-routed source via upstream ACL', label: 'Null-routed' },
  'SQL Injection': { action: 'Blocked request signature at WAF', label: 'Blocked' },
  'Malware C2 Beacon': { action: 'Isolated host from network segment', label: 'Isolated' },
  'Zero-day Anomaly': { action: 'Sandboxed traffic and escalated for analyst review', label: 'Sandboxed' },
  'DNS Tunneling': { action: 'Sinkholed outbound DNS queries', label: 'Sinkholed' },
  'Lateral Movement': { action: 'Isolated host and revoked session tokens', label: 'Isolated' },
  'Credential Stuffing': { action: 'Blocked source IP and enforced step-up MFA', label: 'Blocked' },
};

const pad = (n) => String(n).padStart(2, '0');

// Validates + sanitizes anything coming in (simulator or real ML pipeline)
function normalize(b) {
  if (!ipRe.test(b.srcIp)) throw new Error('srcIp must be an IPv4 address');
  if (!SEVS.includes(b.sev)) throw new Error('sev must be low|medium|high|critical');
  if (!b.attack) throw new Error('attack is required');
  const now = new Date();
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    srcIp: b.srcIp,
    dstIp: ipRe.test(b.dstIp) ? b.dstIp : '0.0.0.0',
    dstPort: clamp(parseInt(b.dstPort) || 0, 0, 65535),
    attack: clean(b.attack),
    sev: b.sev,
    confidence: clamp(Math.round(+b.confidence || 0), 0, 100),
    status: ['New', 'Investigating'].includes(b.status) ? b.status : 'New',
    country: clean(b.country, 2).toUpperCase() || '??',
    reputation: clamp(Math.round(+b.reputation || 0), 0, 100),
    tags: (Array.isArray(b.tags) ? b.tags : []).slice(0, 6).map((t) => clean(t, 40)),
    firstSeen: clean(b.firstSeen, 30) || 'unknown',
    features: (Array.isArray(b.features) ? b.features : [])
      .slice(0, 8)
      .map((f) => ({ name: clean(f.name, 40), val: Number(f.val) || 0 })),
    intelMatch: !!b.intelMatch,
    eventCount: clamp(parseInt(b.eventCount) || 1, 1, 100000),
    pps: Number(b.pps) || rnd(200, 420),
  };
}

function shouldAutoRespond(a) {
  return (
    !a.attack.startsWith('Benign') &&
    ((a.sev === 'critical' && a.confidence >= 85) || (a.sev === 'high' && a.confidence >= 93))
  );
}

async function getStats() {
  const fiveMin = new Date(Date.now() - 5 * 60 * 1000);
  const [agg] = await Alert.aggregate([
    {
      $group: {
        _id: null,
        events: { $sum: '$eventCount' },
        conf: { $avg: '$confidence' },
        intel: { $sum: { $cond: ['$intelMatch', 1, 0] } },
      },
    },
  ]);
  const active = await Alert.countDocuments({
    responded: false,
    sev: { $in: ['critical', 'high'] },
    createdAt: { $gte: fiveMin },
  });
  const [resp] = await ResponseLog.aggregate([
    { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: '$ms' } } },
  ]);
  const countries = await Alert.aggregate([{ $group: { _id: '$country', n: { $sum: 1 } } }]);

  return {
    totalEvents: 12480 + (agg?.events || 0),
    activeThreats: active,
    meanConfidence: Math.round(agg?.conf || 0),
    intelMatches: agg?.intel || 0,
    mitigated: resp?.n || 0,
    avgResponseMs: resp ? Math.round(resp.avg) : 0,
    eps: rnd(180, 540), // placeholder until you measure real throughput
    countryCounts: Object.fromEntries(countries.map((c) => [c._id, c.n])),
  };
}

async function createAlert(raw, { silent = false } = {}) {
  const data = normalize(raw);
  const doc = await Alert.create({
    alertId: 'a' + Math.random().toString(36).slice(2, 9),
    ...data,
  });
  if (!silent) {
    broadcast({ type: 'alert', alert: doc.toJSON(), stats: await getStats() });
    if (settings.autoResponse && shouldAutoRespond(doc)) {
      setTimeout(() => respond(doc.alertId, 'Auto').catch(console.error), rnd(150, 450));
    }
  }
  return doc;
}

async function respond(alertId, mode) {
  // Atomic: only the first caller flips responded=false -> true
  const doc = await Alert.findOneAndUpdate(
    { alertId, responded: false },
    { $set: { responded: true } },
    { new: true }
  );
  if (!doc) return null;
  const info = ACTIONS[doc.attack] || { action: 'Flagged for manual review', label: 'Reviewed' };
  doc.status = info.label;
  await doc.save();
  const log = await ResponseLog.create({
    alertId,
    time: doc.time,
    ip: doc.srcIp,
    action: info.action,
    mode,
    ms: rnd(45, 260),
  });
  broadcast({ type: 'update', alert: doc.toJSON(), log: log.toJSON(), stats: await getStats() });
  return doc;
}

async function dismiss(alertId) {
  const doc = await Alert.findOneAndUpdate(
    { alertId, responded: false },
    { $set: { responded: true, status: 'Dismissed' } },
    { new: true }
  );
  if (!doc) return null;
  broadcast({ type: 'update', alert: doc.toJSON(), stats: await getStats() });
  return doc;
}

module.exports = { settings, createAlert, respond, dismiss, getStats };