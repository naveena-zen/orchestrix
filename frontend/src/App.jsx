import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import WorkflowListPage from './pages/WorkflowListPage'
import WorkflowEditorPage from './pages/WorkflowEditorPage'
import RuleEditorPage from './pages/RuleEditorPage'
import ExecuteWorkflowPage from './pages/ExecuteWorkflowPage'
import AuditLogPage from './pages/AuditLogPage'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<WorkflowListPage />} />
          <Route path="/workflows/create" element={<WorkflowEditorPage />} />
          <Route path="/workflows/:id/edit" element={<WorkflowEditorPage />} />
          <Route path="/workflows/:workflow_id/steps/:step_id/rules" element={<RuleEditorPage />} />
          <Route path="/workflows/:id/execute" element={<ExecuteWorkflowPage />} />
          <Route path="/executions" element={<AuditLogPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
