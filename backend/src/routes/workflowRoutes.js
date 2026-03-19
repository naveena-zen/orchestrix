const express = require('express');
const router = express.Router();
const { createWorkflow, listWorkflows, getWorkflow, updateWorkflow, deleteWorkflow } = require('../controllers/workflowController');
const { createStep, listSteps } = require('../controllers/stepController');
const { startExecution } = require('../controllers/executionController');

router.post('/', createWorkflow);
router.get('/', listWorkflows);
router.get('/:id', getWorkflow);
router.put('/:id', updateWorkflow);
router.delete('/:id', deleteWorkflow);

// Steps nested under workflow
router.post('/:workflow_id/steps', createStep);
router.get('/:workflow_id/steps', listSteps);

// Execute
router.post('/:workflow_id/execute', startExecution);

module.exports = router;
