const { settings, createAlert } = require('./alertService');

const ATTACK_TYPES = [
  { name: 'Port Scan', base: 'medium' },
  { name: 'Brute Force (SSH)', base: 'high' },
  { name: 'DDoS — SYN Flood', base: 'critical' },
  { name: 'SQL Injection', base: 'critical' },
  { name: 'Malware C2 Beacon', base: 'critical' },
  { name: 'Zero-day Anomaly', base: 'high' },
  { name: 'DNS Tunneling', base: 'medium' },
  { name: 'Lateral Movement', base: 'high' },
  { name: 'Credential Stuffing', base: 'medium' },
  { name: 'Benign — flagged for review', base: 'low' },
];
const COUNTRIES = ['RU', 'CN', 'US', 'BR', 'VN', 'NG', 'DE', 'IN', 'KP', 'NL'];
const TAGS_POOL = [
  'known botnet node', 'Tor exit node', 'recent C2 activity', 'scanning infra',
  'residential proxy', 'prior campaign match', 'cloud hosting (abused)', 'no prior history',
];

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randIp = () => `${rnd(1, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`;

function makeSimAlert() {
  const atk = pick(ATTACK_TYPES);
  let sev = atk.base;
  if (Math.random() < 0.15) sev = pick(['low', 'medium', 'high', 'critical']);
  const confidence =
    sev === 'critical' ? rnd(88, 99) :
    sev === 'high' ? rnd(75, 93) :
    sev === 'medium' ? rnd(55, 80) : rnd(20, 55);
  const isAttack = sev === 'critical' || sev === 'high';
  return {
    srcIp: randIp(),
    dstIp: randIp(),
    dstPort: pick([22, 80, 443, 3389, 53, 8080, 21, 3306]),
    attack: atk.name,
    sev,
    confidence,
    status: Math.random() < 0.7 ? 'New' : 'Investigating',
    country: pick(COUNTRIES),
    reputation: rnd(5, 95),
    tags: [...new Set([pick(TAGS_POOL), pick(TAGS_POOL)])],
    firstSeen: `${rnd(1, 30)} days ago`,
    features: [
      { name: 'Packet rate (z-score)', val: +(Math.random() * 2 - 0.3).toFixed(2) },
      { name: 'Flow duration', val: +(Math.random() * 2 - 1).toFixed(2) },
      { name: 'Unique dst ports', val: +(Math.random() * 2 - 0.2).toFixed(2) },
      { name: 'Payload entropy', val: +(Math.random() * 2 - 1).toFixed(2) },
      { name: 'TTL variance', val: +(Math.random() * 2 - 1).toFixed(2) },
    ],
    intelMatch: Math.random() < 0.4,
    eventCount: rnd(40, 160),
    pps: rnd(200, 420) + (isAttack ? rnd(80, 220) : 0),
  };
}

function startSimulator() {
  setInterval(() => {
    if (settings.simulator) createAlert(makeSimAlert()).catch(console.error);
  }, 2200);
}

module.exports = { makeSimAlert, startSimulator };