require('dotenv').config();
const express = require('express');
const cors = require('cors');

const workflowRoutes = require('./routes/workflowRoutes');
const stepRoutes = require('./routes/stepRoutes');
const ruleRoutes = require('./routes/ruleRoutes');
const executionRoutes = require('./routes/executionRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.use('/workflows', workflowRoutes);
app.use('/steps', stepRoutes);
app.use('/rules', ruleRoutes);
app.use('/executions', executionRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Workflow API running on port ${PORT}`);
});

module.exports = app;
