# Orchestrix
### Workflow Automation Platform
### Halleyx Full Stack Engineer Challenge I - 2026

A full-stack workflow automation platform that allows users to design workflows, 
define rules, execute processes, and track every step. Supports automation, 
notifications, approvals, and dynamic decision-making based on input data.

---

## Tech Stack

- **Frontend**: React.js + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Rule Engine**: Custom-built safe expression evaluator (no eval())

---

## Prerequisites

- Node.js v18+ 
- PostgreSQL 14+
- npm v9+

---

## Setup Instructions

### 1. Clone the repository
git clone <your-repo-url>
cd workflow-automation-system

### 2. Backend Setup
cd backend
cp .env.example .env

Edit .env and set your PostgreSQL password:
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/workflow_db"
PORT=4000
MAX_LOOP_ITERATIONS=10

Install dependencies:
npm install

Generate Prisma client:
npx prisma generate

Run database migrations:
npx prisma migrate dev --name init

Seed sample data:
npm run seed

Start backend:
npm run dev

Backend runs on: http://localhost:4000

### 3. Frontend Setup
Open a new terminal:
cd frontend
npm install
npm run dev

Frontend runs on: http://localhost:5173

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| DATABASE_URL | PostgreSQL connection string | required |
| PORT | Backend server port | 4000 |
| MAX_LOOP_ITERATIONS | Max loop iterations in workflow | 10 |

---

## API Documentation

### Workflows
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/workflows | Create workflow |
| GET | /api/workflows | List workflows (pagination & search) |
| GET | /api/workflows/:id | Get workflow with steps & rules |
| PUT | /api/workflows/:id | Update workflow (auto-increments version) |
| DELETE | /api/workflows/:id | Delete workflow |

### Steps
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/workflows/:workflow_id/steps | Add step |
| GET | /api/workflows/:workflow_id/steps | List steps |
| PUT | /api/steps/:id | Update step |
| DELETE | /api/steps/:id | Delete step |

### Rules
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/steps/:step_id/rules | Add rule |
| GET | /api/steps/:step_id/rules | List rules |
| PUT | /api/rules/:id | Update rule |
| DELETE | /api/rules/:id | Delete rule |

### Executions
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/workflows/:workflow_id/execute | Start execution |
| GET | /api/executions/:id | Get execution status & logs |
| POST | /api/executions/:id/cancel | Cancel execution |
| POST | /api/executions/:id/retry | Retry failed step only |
| POST | /api/executions/:id/approve | Approve or reject approval step |

---

## Workflow Engine Design

### How it works
1. User creates a workflow with an input schema defining required fields
2. Steps are added in order (task, approval, or notification)
3. Rules are defined per step with conditions and next step routing
4. When executed, the engine evaluates rules at each step using input data
5. First matching rule (by priority) determines the next step
6. null next_step_id means workflow is complete

### Step Types
- **Task** — auto-executes immediately, logs completion, moves to next step
- **Notification** — auto-executes immediately, simulates sending alert, moves to next step  
- **Approval** — pauses execution, waits for POST /executions/:id/approve, then continues

### Rule Engine
- Custom tokenizer + recursive descent parser (safe, no eval())
- Supported operators: ==, !=, <, >, <=, >=, &&, ||
- Supported functions: contains(field, "value"), startsWith(field, "prefix"), endsWith(field, "suffix")
- Special condition: DEFAULT — matches when no other rule matches
- Rules evaluated in priority order (lowest number = highest priority)
- Loop detection: if a step is visited more than MAX_LOOP_ITERATIONS times, execution fails

### Execution States
pending → in_progress → completed
                     → failed
                     → canceled

---

## Sample Workflows

### Workflow 1: Expense Approval

Input Schema:
- amount: number (required)
- country: string (required)
- department: string (optional)
- priority: string (required) — allowed: High, Medium, Low

Steps:
1. Manager Approval (approval)
2. Finance Notification (notification)
3. CEO Approval (approval)
4. Task Rejection (task)

Rules for Manager Approval:
| Priority | Condition | Next Step |
|---|---|---|
| 1 | amount > 100 && country == 'US' && priority == 'High' | Finance Notification |
| 2 | amount <= 100 || department == 'HR' | CEO Approval |
| 3 | priority == 'Low' && country != 'US' | Task Rejection |
| 4 | DEFAULT | Task Rejection |

### Workflow 2: Employee Onboarding

Input Schema:
- employee_name: string (required)
- department: string (required)
- start_date: string (required)

Steps:
1. HR Notification (notification)
2. IT Setup Task (task)
3. Manager Welcome (approval)

---

## Sample Execution Example

Workflow: Expense Approval
Input:
{
  "amount": 250,
  "country": "US",
  "department": "Finance",
  "priority": "High",
  "triggered_by": "user123"
}

Execution path:
Step 1 — Manager Approval
  Rules evaluated:
    ✓ amount > 100 && country == 'US' && priority == 'High' → true
    ✗ amount <= 100 || department == 'HR' → false
  Next: Finance Notification
  Status: completed (approved by user123)

Step 2 — Finance Notification
  Rules evaluated:
    ✓ DEFAULT → true
  Next: CEO Approval
  Status: completed (auto-executed)

Step 3 — CEO Approval
  Status: pending_approval → completed (approved)
  Next: null → Workflow COMPLETED

---

## Bonus Features

- Loop detection with configurable MAX_LOOP_ITERATIONS
- Dark mode UI
- Drag-and-drop rule priority reordering
- Automated tests
- Real-time execution log updates
- Input schema validation before execution

---

## Project Structure
```
Orchestrix/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── workflowController.js
│   │   │   ├── stepController.js
│   │   │   ├── ruleController.js
│   │   │   └── executionController.js
│   │   ├── engine/
│   │   │   ├── ruleEngine.js
│   │   │   └── executionEngine.js
│   │   ├── routes/
│   │   │   └── index.js
│   │   └── index.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── WorkflowListPage.jsx
│   │   │   ├── WorkflowEditorPage.jsx
│   │   │   ├── RuleEditorPage.jsx
│   │   │   ├── ExecuteWorkflowPage.jsx
│   │   │   └── AuditLogPage.jsx
│   │   ├── components/
│   │   ├── api/
│   │   │   └── index.js
│   │   └── App.jsx
│   ├── .env.example
│   └── package.json
└── README.md
```
