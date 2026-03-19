const express = require('express');
const router = express.Router();
const { updateStep, deleteStep } = require('../controllers/stepController');
const { createRule, listRules } = require('../controllers/ruleController');

router.put('/:id', updateStep);
router.delete('/:id', deleteStep);

// Rules nested under step
router.post('/:step_id/rules', createRule);
router.get('/:step_id/rules', listRules);

module.exports = router;
