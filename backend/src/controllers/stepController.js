const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error });

// POST /workflows/:workflow_id/steps
const createStep = async (req, res) => {
  try {
    const { workflow_id } = req.params;
    const { name, step_type, order, metadata } = req.body;
    if (!name || !step_type) return fail(res, 'name and step_type are required');
    if (!['task', 'approval', 'notification'].includes(step_type)) {
      return fail(res, 'step_type must be task, approval, or notification');
    }
    const workflow = await prisma.workflow.findUnique({ where: { id: workflow_id } });
    if (!workflow) return fail(res, 'Workflow not found', 404);

    // Auto-determine order if not provided
    let stepOrder = order;
    if (stepOrder === undefined) {
      const maxStep = await prisma.step.findFirst({
        where: { workflow_id },
        orderBy: { order: 'desc' },
      });
      stepOrder = maxStep ? maxStep.order + 1 : 1;
    }

    const step = await prisma.step.create({
      data: { workflow_id, name, step_type, order: stepOrder, metadata: metadata || {} },
    });

    // If this is the first/lowest order step, update start_step_id
    const firstStep = await prisma.step.findFirst({
      where: { workflow_id },
      orderBy: { order: 'asc' },
    });
    if (firstStep && firstStep.id === step.id) {
      await prisma.workflow.update({
        where: { id: workflow_id },
        data: { start_step_id: step.id },
      });
    }

    return ok(res, step, 201);
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /workflows/:workflow_id/steps
const listSteps = async (req, res) => {
  try {
    const steps = await prisma.step.findMany({
      where: { workflow_id: req.params.workflow_id },
      orderBy: { order: 'asc' },
      include: { rules: { orderBy: { priority: 'asc' } } },
    });
    return ok(res, steps);
  } catch (e) { return fail(res, e.message, 500); }
};

// PUT /steps/:id
const updateStep = async (req, res) => {
  try {
    const { name, step_type, order, metadata } = req.body;
    const existing = await prisma.step.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 'Step not found', 404);

    const step = await prisma.step.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(step_type !== undefined && { step_type }),
        ...(order !== undefined && { order }),
        ...(metadata !== undefined && { metadata }),
      },
    });

    // Update start_step_id if order changed
    const firstStep = await prisma.step.findFirst({
      where: { workflow_id: step.workflow_id },
      orderBy: { order: 'asc' },
    });
    if (firstStep) {
      await prisma.workflow.update({
        where: { id: step.workflow_id },
        data: { start_step_id: firstStep.id },
      });
    }

    return ok(res, step);
  } catch (e) { return fail(res, e.message, 500); }
};

// DELETE /steps/:id
const deleteStep = async (req, res) => {
  try {
    const step = await prisma.step.findUnique({ where: { id: req.params.id } });
    if (!step) return fail(res, 'Step not found', 404);

    await prisma.step.delete({ where: { id: req.params.id } });

    // Update start_step_id
    const firstStep = await prisma.step.findFirst({
      where: { workflow_id: step.workflow_id },
      orderBy: { order: 'asc' },
    });
    await prisma.workflow.update({
      where: { id: step.workflow_id },
      data: { start_step_id: firstStep ? firstStep.id : null },
    });

    return ok(res, { message: 'Step deleted' });
  } catch (e) { return fail(res, e.message, 500); }
};

module.exports = { createStep, listSteps, updateStep, deleteStep };
