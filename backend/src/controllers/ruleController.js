const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error });

// POST /steps/:step_id/rules
const createRule = async (req, res) => {
  try {
    const { step_id } = req.params;
    const { condition, next_step_id, priority } = req.body;
    if (!condition) return fail(res, 'condition is required');

    const step = await prisma.step.findUnique({ where: { id: step_id } });
    if (!step) return fail(res, 'Step not found', 404);

    let rulePriority = priority;
    if (rulePriority === undefined) {
      const maxRule = await prisma.rule.findFirst({
        where: { step_id },
        orderBy: { priority: 'desc' },
      });
      rulePriority = maxRule ? maxRule.priority + 1 : 1;
    }

    const rule = await prisma.rule.create({
      data: {
        step_id,
        condition,
        next_step_id: next_step_id || null,
        priority: rulePriority,
      },
    });
    return ok(res, rule, 201);
  } catch (e) { return fail(res, e.message, 500); }
};

// GET /steps/:step_id/rules
const listRules = async (req, res) => {
  try {
    const rules = await prisma.rule.findMany({
      where: { step_id: req.params.step_id },
      orderBy: { priority: 'asc' },
      include: { next_step: { select: { id: true, name: true } } },
    });
    return ok(res, rules);
  } catch (e) { return fail(res, e.message, 500); }
};

// PUT /rules/:id
const updateRule = async (req, res) => {
  try {
    const { condition, next_step_id, priority } = req.body;
    const existing = await prisma.rule.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 'Rule not found', 404);

    const rule = await prisma.rule.update({
      where: { id: req.params.id },
      data: {
        ...(condition !== undefined && { condition }),
        ...(next_step_id !== undefined && { next_step_id: next_step_id || null }),
        ...(priority !== undefined && { priority }),
      },
    });
    return ok(res, rule);
  } catch (e) { return fail(res, e.message, 500); }
};

// DELETE /rules/:id
const deleteRule = async (req, res) => {
  try {
    await prisma.rule.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Rule deleted' });
  } catch (e) {
    if (e.code === 'P2025') return fail(res, 'Rule not found', 404);
    return fail(res, e.message, 500);
  }
};

module.exports = { createRule, listRules, updateRule, deleteRule };
