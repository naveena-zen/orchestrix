require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up existing seed data
  await prisma.execution.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.step.deleteMany();
  await prisma.workflow.deleteMany();

  // ============================================================
  // WORKFLOW 1: Expense Approval
  // ============================================================
  const expenseWorkflow = await prisma.workflow.create({
    data: {
      name: 'Expense Approval',
      description: 'Multi-level expense approval workflow with manager and CEO sign-off',
      is_active: true,
      input_schema: [
        { name: 'amount', type: 'number', required: true },
        { name: 'country', type: 'string', required: true },
        { name: 'department', type: 'string', required: false },
        { name: 'priority', type: 'string', required: true, allowed_values: ['High', 'Medium', 'Low'] },
      ],
    },
  });

  // Steps for Expense Approval
  const managerApproval = await prisma.step.create({
    data: {
      workflow_id: expenseWorkflow.id,
      name: 'Manager Approval',
      step_type: 'approval',
      order: 1,
      metadata: { assignee_email: 'manager@example.com' },
    },
  });

  const financeNotification = await prisma.step.create({
    data: {
      workflow_id: expenseWorkflow.id,
      name: 'Finance Notification',
      step_type: 'notification',
      order: 2,
      metadata: { notification_channel: 'email', template: 'Finance team notified' },
    },
  });

  const ceoApproval = await prisma.step.create({
    data: {
      workflow_id: expenseWorkflow.id,
      name: 'CEO Approval',
      step_type: 'approval',
      order: 3,
      metadata: { assignee_email: 'ceo@example.com' },
    },
  });

  const taskRejection = await prisma.step.create({
    data: {
      workflow_id: expenseWorkflow.id,
      name: 'Task Rejection',
      step_type: 'task',
      order: 4,
      metadata: { instructions: 'Reject and notify requester' },
    },
  });

  // Update workflow with start_step_id
  await prisma.workflow.update({
    where: { id: expenseWorkflow.id },
    data: { start_step_id: managerApproval.id },
  });

  // Rules for Manager Approval
  await prisma.rule.create({
    data: {
      step_id: managerApproval.id,
      condition: "amount > 100 && country == 'US' && priority == 'High'",
      next_step_id: financeNotification.id,
      priority: 1,
    },
  });
  await prisma.rule.create({
    data: {
      step_id: managerApproval.id,
      condition: "amount <= 100 || department == 'HR'",
      next_step_id: ceoApproval.id,
      priority: 2,
    },
  });
  await prisma.rule.create({
    data: {
      step_id: managerApproval.id,
      condition: "priority == 'Low' && country != 'US'",
      next_step_id: taskRejection.id,
      priority: 3,
    },
  });
  await prisma.rule.create({
    data: {
      step_id: managerApproval.id,
      condition: 'DEFAULT',
      next_step_id: taskRejection.id,
      priority: 4,
    },
  });

  // Rules for Finance Notification
  await prisma.rule.create({
    data: {
      step_id: financeNotification.id,
      condition: 'DEFAULT',
      next_step_id: ceoApproval.id,
      priority: 1,
    },
  });

  // Rules for CEO Approval → end workflow
  await prisma.rule.create({
    data: {
      step_id: ceoApproval.id,
      condition: 'DEFAULT',
      next_step_id: null,
      priority: 1,
    },
  });

  // Rules for Task Rejection → end workflow
  await prisma.rule.create({
    data: {
      step_id: taskRejection.id,
      condition: 'DEFAULT',
      next_step_id: null,
      priority: 1,
    },
  });

  console.log('✅ Expense Approval workflow seeded');

  // ============================================================
  // WORKFLOW 2: Employee Onboarding
  // ============================================================
  const onboardingWorkflow = await prisma.workflow.create({
    data: {
      name: 'Employee Onboarding',
      description: 'Automated employee onboarding process with notifications and manager welcome',
      is_active: true,
      input_schema: [
        { name: 'employee_name', type: 'string', required: true },
        { name: 'department', type: 'string', required: true },
        { name: 'start_date', type: 'string', required: true },
      ],
    },
  });

  const hrNotification = await prisma.step.create({
    data: {
      workflow_id: onboardingWorkflow.id,
      name: 'HR Notification',
      step_type: 'notification',
      order: 1,
      metadata: { notification_channel: 'slack', template: 'New employee onboarding started' },
    },
  });

  const itSetup = await prisma.step.create({
    data: {
      workflow_id: onboardingWorkflow.id,
      name: 'IT Setup Task',
      step_type: 'task',
      order: 2,
      metadata: { instructions: 'Set up laptop and accounts' },
    },
  });

  const managerWelcome = await prisma.step.create({
    data: {
      workflow_id: onboardingWorkflow.id,
      name: 'Manager Welcome',
      step_type: 'approval',
      order: 3,
      metadata: { assignee_email: 'manager@example.com' },
    },
  });

  await prisma.workflow.update({
    where: { id: onboardingWorkflow.id },
    data: { start_step_id: hrNotification.id },
  });

  // Rules for HR Notification
  await prisma.rule.create({
    data: {
      step_id: hrNotification.id,
      condition: 'DEFAULT',
      next_step_id: itSetup.id,
      priority: 1,
    },
  });

  // Rules for IT Setup Task
  await prisma.rule.create({
    data: {
      step_id: itSetup.id,
      condition: "department == 'Engineering'",
      next_step_id: managerWelcome.id,
      priority: 1,
    },
  });
  await prisma.rule.create({
    data: {
      step_id: itSetup.id,
      condition: 'DEFAULT',
      next_step_id: managerWelcome.id,
      priority: 2,
    },
  });

  // Rules for Manager Welcome → end workflow
  await prisma.rule.create({
    data: {
      step_id: managerWelcome.id,
      condition: 'DEFAULT',
      next_step_id: null,
      priority: 1,
    },
  });

  console.log('✅ Employee Onboarding workflow seeded');
  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
