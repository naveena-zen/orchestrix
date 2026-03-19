const express = require('express');
const router = express.Router();
const { updateRule, deleteRule } = require('../controllers/ruleController');

router.put('/:id', updateRule);
router.delete('/:id', deleteRule);

module.exports = router;
