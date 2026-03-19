const { PrismaClient } = require('@prisma/client');
const { evaluateRules } = require('../engine/ruleEngine');

const prisma = new PrismaClient();
const MAX_LOOP_ITERATIONS = parseInt(process.env.MAX_LOOP_ITERATIONS || '10', 10);

async function executeWorkflow(executionId) {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { workflow: true },
  });

  if (!execution) throw new Error(`Execution ${executionId} not found`);
  if (['completed', 'failed', 'canceled'].includes(execution.status)) return;

  const workflow = execution.workflow;

  // Get the start step
  let currentStepId = execution.current_step_id || workflow.start_step_id;
  if (!currentStepId) {
    await failExecution(executionId, 'No start step defined for workflow');
    return;
  }

  // Track visited steps for loop detection
  const visitedSteps = {};
  const logs = Array.isArray(execution.logs) ? [...execution.logs] : [];

  // Build visited map from existing logs
  for (const log of logs) {
    if (log.step_id) {
      visitedSteps[log.step_id] = (visitedSteps[log.step_id] || 0) + 1;
    }
  }

  await prisma.execution.update({
    where: { id: executionId },
    data: { status: 'in_progress', current_step_id: currentStepId },
  });

  let continueExecution = true;

  while (continueExecution && currentStepId) {
    // Loop detection
    visitedSteps[currentStepId] = (visitedSteps[currentStepId] || 0) + 1;
    if (visitedSteps[currentStepId] > MAX_LOOP_ITERATIONS) {
      await failExecution(executionId, `Max loop iterations (${MAX_LOOP_ITERATIONS}) exceeded at step ${currentStepId}`, logs);
      return;
    }

    const step = await prisma.step.findUnique({
      where: { id: currentStepId },
      include: { rules: { orderBy: { priority: 'asc' } } },
    });

    if (!step) {
      await failExecution(executionId, `Step ${currentStepId} not found`, logs);
      return;
    }

    const stepLog = {
      step_id: step.id,
      step_name: step.name,
      step_type: step.step_type,
      evaluated_rules: [],
      selected_next_step: null,
      status: 'completed',
      approver_id: null,
      error_message: null,
      started_at: new Date().toISOString(),
      ended_at: null,
    };

    if (step.step_type === 'approval') {
      // Pause execution for approval
      stepLog.status = 'pending_approval';
      stepLog.ended_at = new Date().toISOString();
      logs.push(stepLog);

      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'in_progress',
          current_step_id: currentStepId,
          logs,
        },
      });
      return; // Pause — wait for approve/reject API call
    }

    if (step.step_type === 'notification') {
      const meta = step.metadata || {};
      const logEntry = {
        channel: meta.notification_channel || 'unknown',
        message: meta.template || 'Notification sent',
        timestamp: new Date().toISOString(),
      };
      stepLog.notification_log = logEntry;
    }

    // task and notification: evaluate rules and move on
    const { selectedRule, evaluatedRules, error: ruleError } = evaluateRules(
      step.rules,
      execution.data || {}
    );

    stepLog.evaluated_rules = evaluatedRules;

    if (ruleError && !selectedRule) {
      stepLog.status = 'failed';
      stepLog.error_message = ruleError;
      stepLog.ended_at = new Date().toISOString();
      logs.push(stepLog);
      await failExecution(executionId, ruleError, logs);
      return;
    }

    if (!selectedRule) {
      const err = `No matching rule found for step "${step.name}" and no DEFAULT rule defined`;
      stepLog.status = 'failed';
      stepLog.error_message = err;
      stepLog.ended_at = new Date().toISOString();
      logs.push(stepLog);
      await failExecution(executionId, err, logs);
      return;
    }

    // Resolve next step name
    if (selectedRule.next_step_id) {
      const nextStep = await prisma.step.findUnique({ where: { id: selectedRule.next_step_id } });
      stepLog.selected_next_step = nextStep ? nextStep.name : selectedRule.next_step_id;
    } else {
      stepLog.selected_next_step = null;
    }

    stepLog.ended_at = new Date().toISOString();
    logs.push(stepLog);

    currentStepId = selectedRule.next_step_id || null;

    await prisma.execution.update({
      where: { id: executionId },
      data: {
        current_step_id: currentStepId,
        logs,
      },
    });

    if (!currentStepId) {
      // Workflow completed
      await prisma.execution.update({
        where: { id: executionId },
        data: { status: 'completed', ended_at: new Date() },
      });
      continueExecution = false;
    }
  }
}

async function approveStep(executionId, approved, approverId) {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { workflow: true },
  });

  if (!execution) throw new Error('Execution not found');
  if (execution.status !== 'in_progress') throw new Error('Execution is not in progress');

  const currentStepId = execution.current_step_id;
  const step = await prisma.step.findUnique({
    where: { id: currentStepId },
    include: { rules: { orderBy: { priority: 'asc' } } },
  });

  if (!step || step.step_type !== 'approval') throw new Error('Current step is not an approval step');

  const logs = Array.isArray(execution.logs) ? [...execution.logs] : [];

  // Find the pending_approval log entry for this step
  const logIdx = logs.findLastIndex
    ? logs.findLastIndex(l => l.step_id === currentStepId && l.status === 'pending_approval')
    : [...logs].reverse().findIndex(l => l.step_id === currentStepId && l.status === 'pending_approval');
  const actualIdx = logs.findLastIndex
    ? logIdx
    : logIdx === -1 ? -1 : logs.length - 1 - logIdx;

  if (!approved) {
    if (actualIdx !== -1) {
      logs[actualIdx] = {
        ...logs[actualIdx],
        status: 'rejected',
        approver_id: approverId,
        error_message: 'Rejected by approver',
        ended_at: new Date().toISOString(),
      };
    }
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: 'failed', ended_at: new Date(), logs },
    });
    return;
  }

  // Approved — evaluate rules and continue
  const { selectedRule, evaluatedRules, error: ruleError } = evaluateRules(
    step.rules,
    execution.data || {}
  );

  if (actualIdx !== -1) {
    logs[actualIdx] = {
      ...logs[actualIdx],
      status: 'completed',
      approver_id: approverId,
      evaluated_rules: evaluatedRules,
      ended_at: new Date().toISOString(),
    };
  }

  if (!selectedRule) {
    const err = ruleError || `No matching rule for step "${step.name}"`;
    if (actualIdx !== -1) logs[actualIdx].status = 'failed';
    await failExecution(executionId, err, logs);
    return;
  }

  if (selectedRule.next_step_id) {
    const nextStep = await prisma.step.findUnique({ where: { id: selectedRule.next_step_id } });
    if (actualIdx !== -1) logs[actualIdx].selected_next_step = nextStep ? nextStep.name : selectedRule.next_step_id;
  }

  await prisma.execution.update({
    where: { id: executionId },
    data: {
      current_step_id: selectedRule.next_step_id || null,
      logs,
    },
  });

  if (!selectedRule.next_step_id) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: 'completed', ended_at: new Date() },
    });
    return;
  }

  // Continue execution from next step
  await executeWorkflow(executionId);
}

async function retryExecution(executionId) {
  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error('Execution not found');
  if (execution.status !== 'failed') throw new Error('Only failed executions can be retried');

  // Find the failed step from logs
  const logs = Array.isArray(execution.logs) ? execution.logs : [];
  const failedLog = [...logs].reverse().find(l => l.status === 'failed');

  if (!failedLog) throw new Error('No failed step found in logs');

  // Remove the failed log entry to re-run that step
  const cleanedLogs = logs.filter((l, i) => !(logs.length - 1 - i === logs.findIndex(ll => ll === failedLog) || false));
  // Simpler: remove last failed entry
  const lastFailedIdx = logs.length - 1 - [...logs].reverse().findIndex(l => l.status === 'failed');
  const newLogs = logs.filter((_, i) => i !== lastFailedIdx);

  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: 'in_progress',
      current_step_id: failedLog.step_id,
      retries: { increment: 1 },
      logs: newLogs,
      ended_at: null,
    },
  });

  await executeWorkflow(executionId);
}

async function cancelExecution(executionId) {
  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error('Execution not found');
  if (['completed', 'failed', 'canceled'].includes(execution.status)) {
    throw new Error('Cannot cancel a finished execution');
  }

  await prisma.execution.update({
    where: { id: executionId },
    data: { status: 'canceled', ended_at: new Date() },
  });
}

async function failExecution(executionId, reason, logs) {
  const updateData = { status: 'failed', ended_at: new Date() };
  if (logs) updateData.logs = logs;
  await prisma.execution.update({ where: { id: executionId }, data: updateData });
}

module.exports = { executeWorkflow, approveStep, retryExecution, cancelExecution };
