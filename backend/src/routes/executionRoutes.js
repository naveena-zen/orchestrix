const express = require('express');
const router = express.Router();
const { getExecution, listExecutions, cancelExec, retryExec, approveExec } = require('../controllers/executionController');

router.get('/', listExecutions);
router.get('/:id', getExecution);
router.post('/:id/cancel', cancelExec);
router.post('/:id/retry', retryExec);
router.post('/:id/approve', approveExec);

module.exports = router;
