const router = require('express').Router();
const Alert = require('../models/Alert');
const ResponseLog = require('../models/ResponseLog');
const { addClient, removeClient, broadcast } = require('../services/events');
const { settings, createAlert, respond, dismiss, getStats } = require('../services/alertService');
const { makeSimAlert } = require('../services/simulator');

// Live stream (SSE)
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});

router.get('/alerts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 45, 200);
  const alerts = await Alert.find().sort({ createdAt: -1, _id: -1 }).limit(limit);
  res.json(alerts);
});

// Ingest endpoint — your real ML pipeline posts here
router.post('/alerts', async (req, res) => {
  const key = process.env.INGEST_KEY;
  if (key && req.get('x-api-key') !== key) return res.status(401).json({ error: 'unauthorized' });
  try {
    const doc = await createAlert(req.body);
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/alerts/simulate', async (_req, res) => {
  res.status(201).json(await createAlert(makeSimAlert()));
});

router.post('/alerts/:id/respond', async (req, res) => {
  const doc = await respond(req.params.id, 'Manual');
  doc ? res.json(doc) : res.status(409).json({ error: 'not found or already handled' });
});

router.post('/alerts/:id/dismiss', async (req, res) => {
  const doc = await dismiss(req.params.id);
  doc ? res.json(doc) : res.status(409).json({ error: 'not found or already handled' });
});

router.get('/stats', async (_req, res) => res.json(await getStats()));

router.get('/response-log', async (_req, res) => {
  res.json(await ResponseLog.find().sort({ createdAt: -1 }).limit(20));
});

router.get('/settings', (_req, res) => res.json(settings));

router.put('/settings', (req, res) => {
  if (typeof req.body.autoResponse === 'boolean') settings.autoResponse = req.body.autoResponse;
  if (typeof req.body.simulator === 'boolean') settings.simulator = req.body.simulator;
  broadcast({ type: 'settings', settings });
  res.json(settings);
});

module.exports = router;