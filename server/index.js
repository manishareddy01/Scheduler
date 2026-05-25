require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const activityRoutes = require('./routes/activities');
const groupRoutes = require('./routes/groups');  // NEW
const eventProposalRoutes = require('./routes/eventProposals');  // NEW

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/groups', groupRoutes);  // NEW
app.use('/api/event-proposals', eventProposalRoutes);  // NEW

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});