const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error });

// POST /workflows
const createWorkflow = async (req, res) => {
  try {
    const { name, description, is_active, input_schema } = req.body;
    if (!name) return fail(res, 'Name is required');
    const workflow = await prisma.workflow.create({
      data: { name, description, is_active: is_active !== false, input_schema: input_schema || [] },
    });
    return ok(res, workflow, 201);
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /workflows
const listWorkflows = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
    const search = req.query.search || '';
    const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
    const [total, workflows] = await Promise.all([
      prisma.workflow.count({ where }),
      prisma.workflow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { _count: { select: { steps: true } } },
      }),
    ]);
    return ok(res, { workflows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /workflows/:id
const getWorkflow = async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: { rules: { orderBy: { priority: 'asc' } } },
        },
      },
    });
    if (!workflow) return fail(res, 'Workflow not found', 404);
    return ok(res, workflow);
  } catch (e) { return fail(res, e.message, 500); }
};

// PUT /workflows/:id
const updateWorkflow = async (req, res) => {
  try {
    const { name, description, is_active, input_schema, start_step_id } = req.body;
    const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 'Workflow not found', 404);
    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(is_active !== undefined && { is_active }),
        ...(input_schema !== undefined && { input_schema }),
        ...(start_step_id !== undefined && { start_step_id }),
        version: { increment: 1 },
      },
    });
    return ok(res, workflow);
  } catch (e) { return fail(res, e.message, 500); }
};

// DELETE /workflows/:id
const deleteWorkflow = async (req, res) => {
  try {
    await prisma.workflow.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Workflow deleted' });
  } catch (e) {
    if (e.code === 'P2025') return fail(res, 'Workflow not found', 404);
    return fail(res, e.message, 500);
  }
};

module.exports = { createWorkflow, listWorkflows, getWorkflow, updateWorkflow, deleteWorkflow };
