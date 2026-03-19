require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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
app.use('/api/workflows', workflowRoutes);
app.use('/api/steps', stepRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/executions', executionRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` }));

// Serve frontend static build
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

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
