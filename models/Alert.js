const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    alertId: { type: String, unique: true, index: true },
    time: String,
    srcIp: String,
    dstIp: String,
    dstPort: Number,
    attack: String,
    sev: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    confidence: Number,
    status: { type: String, default: 'New' },
    responded: { type: Boolean, default: false },
    country: String,
    reputation: Number,
    tags: [String],
    firstSeen: String,
    features: [{ _id: false, name: String, val: Number }],
    intelMatch: { type: Boolean, default: false },
    eventCount: { type: Number, default: 1 },
    pps: Number,
  },
  { timestamps: true }
);

alertSchema.set('toJSON', {
  transform: (_doc, r) => {
    r.id = r.alertId;
    delete r._id;
    delete r.__v;
    return r;
  },
});

module.exports = mongoose.model('Alert', alertSchema);