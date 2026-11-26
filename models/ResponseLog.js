const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    alertId: String,
    time: String,
    ip: String,
    action: String,
    mode: { type: String, enum: ['Auto', 'Manual'] },
    ms: Number,
  },
  { timestamps: true }
);

schema.set('toJSON', {
  transform: (_d, r) => {
    delete r._id;
    delete r.__v;
    return r;
  },
});

module.exports = mongoose.model('ResponseLog', schema);