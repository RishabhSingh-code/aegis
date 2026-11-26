require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const api = require('./routes/api');
const Alert = require('./models/Alert');
const { createAlert } = require('./services/alertService');
const { makeSimAlert, startSimulator } = require('./services/simulator');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aegis')
  .then(async () => {
    console.log('MongoDB connected');
    if ((await Alert.countDocuments()) === 0) {
      for (let i = 0; i < 10; i++) await createAlert(makeSimAlert(), { silent: true });
    }
    startSimulator();
    const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
  })
  .catch((err) => {
    console.error('Mongo connection failed:', err.message);
    process.exit(1);
  });