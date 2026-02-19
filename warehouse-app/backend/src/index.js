const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const https = require('https');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    process.env.FRONTEND_URL, // your Vercel URL — set in Render env vars
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/pickers',  require('./routes/pickers'));
app.use('/api/checkers', require('./routes/checkers'));

app.get('/api/health', (req, res) => res.json({
  status: '✅ API is running',
  timestamp: new Date().toISOString(),
  uptime: Math.floor(process.uptime()) + 's',
}));

// ── Keep-alive: ping self every 10 min to prevent Render free tier sleep ──
cron.schedule('*/10 * * * *', () => {
  const renderUrl = process.env.RENDER_URL;
  if (!renderUrl) return; // only runs in production when RENDER_URL is set

  https.get(`${renderUrl}/api/health`, (res) => {
    console.log(`🔄 Keep-alive ping → ${res.statusCode}`);
  }).on('error', (err) => {
    console.log('⚠️  Keep-alive ping failed:', err.message);
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));