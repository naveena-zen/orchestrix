const { PrismaClient } = require('@prisma/client');
const { executeWorkflow, approveStep, retryExecution, cancelExecution } = require('../services/executionEngine');
const prisma = new PrismaClient();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error });

// POST /workflows/:workflow_id/execute
const startExecution = async (req, res) => {
  try {
    const { workflow_id } = req.params;
    const { data = {}, triggered_by = 'anonymous' } = req.body;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflow_id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!workflow) return fail(res, 'Workflow not found', 404);
    if (!workflow.is_active) return fail(res, 'Workflow is not active');
    if (!workflow.start_step_id) return fail(res, 'Workflow has no steps configured');

    // Validate input against schema
    const schema = Array.isArray(workflow.input_schema) ? workflow.input_schema : [];
    for (const field of schema) {
      if (field.required && (data[field.name] === undefined || data[field.name] === '')) {
        return fail(res, `Required field missing: ${field.name}`);
      }
      if (field.allowed_values && field.allowed_values.length > 0 && data[field.name] !== undefined) {
        if (!field.allowed_values.includes(String(data[field.name]))) {
          return fail(res, `Invalid value for ${field.name}. Allowed: ${field.allowed_values.join(', ')}`);
        }
      }
    }

    const execution = await prisma.execution.create({
      data: {
        workflow_id,
        workflow_version: workflow.version,
        data,
        triggered_by,
        current_step_id: workflow.start_step_id,
        logs: [],
      },
    });

    // Run async — don't wait
    executeWorkflow(execution.id).catch(console.error);

    return ok(res, execution, 201);
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /executions/:id
const getExecution = async (req, res) => {
  try {
    const execution = await prisma.execution.findUnique({
      where: { id: req.params.id },
      include: {
        workflow: { select: { id: true, name: true, version: true } },
        current_step: { select: { id: true, name: true, step_type: true } },
      },
    });
    if (!execution) return fail(res, 'Execution not found', 404);
    return ok(res, execution);
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /executions
const listExecutions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const { workflow_id, status, start_date, end_date } = req.query;

    const where = {};
    if (workflow_id) where.workflow_id = workflow_id;
    if (status) where.status = status;
    if (start_date || end_date) {
      where.started_at = {};
      if (start_date) where.started_at.gte = new Date(start_date);
      if (end_date) where.started_at.lte = new Date(end_date);
    }

    const [total, executions] = await Promise.all([
      prisma.execution.count({ where }),
      prisma.execution.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { started_at: 'desc' },
        include: { workflow: { select: { id: true, name: true } } },
      }),
    ]);
    return ok(res, { executions, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { return fail(res, e.message, 500); }
};

// POST /executions/:id/cancel
const cancelExec = async (req, res) => {
  try {
    await cancelExecution(req.params.id);
    const execution = await prisma.execution.findUnique({ where: { id: req.params.id } });
    return ok(res, execution);
  } catch (e) { return fail(res, e.message, 400); }
};

// POST /executions/:id/retry
const retryExec = async (req, res) => {
  try {
    await retryExecution(req.params.id);
    const execution = await prisma.execution.findUnique({ where: { id: req.params.id } });
    return ok(res, execution);
  } catch (e) { return fail(res, e.message, 400); }
};

// POST /executions/:id/approve
const approveExec = async (req, res) => {
  try {
    const { approved, approver_id = 'unknown' } = req.body;
    if (approved === undefined) return fail(res, 'approved field is required');
    await approveStep(req.params.id, approved, approver_id);
    const execution = await prisma.execution.findUnique({ where: { id: req.params.id } });
    return ok(res, execution);
  } catch (e) { return fail(res, e.message, 400); }
};

module.exports = { startExecution, getExecution, listExecutions, cancelExec, retryExec, approveExec };
