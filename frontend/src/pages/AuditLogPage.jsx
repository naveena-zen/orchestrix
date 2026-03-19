import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { executionsApi, workflowsApi } from '../api'
import { StatusBadge } from '../components/Badges'
import Modal from '../components/Modal'

function ExecutionLogsModal({ execution, onClose }) {
  if (!execution) return null
  const logs = Array.isArray(execution.logs) ? execution.logs : []
  return (
    <Modal title={`Execution Logs — ${execution.id.slice(0, 8)}…`} onClose={onClose} size="xl">
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg text-sm mb-4">
          <div><span className="text-gray-400">Workflow:</span> <span className="text-white font-medium">{execution.workflow?.name}</span></div>
          <div><span className="text-gray-400">v</span><span className="text-white">{execution.workflow_version}</span></div>
          <div><StatusBadge status={execution.status} /></div>
          <div><span className="text-gray-400">By:</span> <span className="text-white">{execution.triggered_by}</span></div>
        </div>

        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No logs recorded for this execution.</p>
        ) : (
          logs.map((log, i) => {
            const duration = log.started_at && log.ended_at
              ? Math.round(new Date(log.ended_at) - new Date(log.started_at))
              : null
            return (
              <div key={i} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{log.step_name}</span>
                    <span className="badge badge-blue text-xs">{log.step_type}</span>
                    <StatusBadge status={log.status} />
                  </div>
                  {duration !== null && <span className="text-xs text-gray-500">{duration}ms</span>}
                </div>
                {log.evaluated_rules?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Rules:</p>
                    {log.evaluated_rules.map((r, j) => (
                      <div key={j} className={`text-xs font-mono py-0.5 flex items-start gap-2 ${r.result ? 'text-emerald-400' : 'text-gray-600'}`}>
                        <span>{r.result ? '✓' : '✗'}</span>
                        <span>{r.rule}</span>
                      </div>
                    ))}
                  </div>
                )}
                {log.notification_log && (
                  <p className="text-xs text-gray-400 mt-2">📣 {log.notification_log.channel}: {log.notification_log.message}</p>
                )}
                {log.selected_next_step && (
                  <p className="text-xs text-gray-400 mt-1">→ {log.selected_next_step}</p>
                )}
                {log.error_message && <p className="text-xs text-red-400 mt-1">⚠ {log.error_message}</p>}
                {log.approver_id && <p className="text-xs text-gray-500 mt-1">Approver: {log.approver_id}</p>}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}

const STATUSES = ['', 'pending', 'in_progress', 'completed', 'failed', 'canceled']

export default function AuditLogPage() {
  const navigate = useNavigate()
  const [executions, setExecutions] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [viewExec, setViewExec] = useState(null)
  const [workflows, setWorkflows] = useState([])

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterWorkflow, setFilterWorkflow] = useState('')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  useEffect(() => {
    workflowsApi.list({ limit: 100 }).then(res => setWorkflows(res.data.workflows || [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = { page, limit: 10 }
      if (filterStatus) params.status = filterStatus
      if (filterWorkflow) params.workflow_id = filterWorkflow
      if (filterStart) params.start_date = filterStart
      if (filterEnd) params.end_date = filterEnd
      const res = await executionsApi.list(params)
      setExecutions(res.data.executions || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      setError(e.error || 'Failed to load executions')
    } finally { setLoading(false) }
  }, [page, filterStatus, filterWorkflow, filterStart, filterEnd])

  useEffect(() => { load() }, [load])

  const openLogs = async (exec) => {
    // Fetch full execution with logs
    try {
      const res = await executionsApi.get(exec.id)
      setViewExec(res.data)
    } catch { setViewExec(exec) }
  }

  const pages = Math.ceil(total / 10)

  const formatDate = (d) => d ? new Date(d).toLocaleString() : '—'

  return (
    <div className="p-8 fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 text-sm mt-1">{total} execution{total !== 1 ? 's' : ''} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Filters</p>
        <div className="flex flex-wrap gap-3">
          <select
            className="input w-auto"
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select
            className="input w-auto"
            value={filterWorkflow}
            onChange={e => { setFilterWorkflow(e.target.value); setPage(1) }}
          >
            <option value="">All Workflows</option>
            {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">From</span>
            <input type="date" className="input w-auto" value={filterStart} onChange={e => { setFilterStart(e.target.value); setPage(1) }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">To</span>
            <input type="date" className="input w-auto" value={filterEnd} onChange={e => { setFilterEnd(e.target.value); setPage(1) }} />
          </div>
          {(filterStatus || filterWorkflow || filterStart || filterEnd) && (
            <button className="btn-secondary btn-sm" onClick={() => { setFilterStatus(''); setFilterWorkflow(''); setFilterStart(''); setFilterEnd(''); setPage(1) }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">{error}</div>}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-gray-500">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-3" /> Loading...
          </div>
        ) : executions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-white mb-2">No executions found</h3>
            <p className="text-gray-400 text-sm">Execute a workflow to see it here</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="table-header">Execution ID</th>
                  <th className="table-header">Workflow</th>
                  <th className="table-header">Version</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Triggered By</th>
                  <th className="table-header">Started</th>
                  <th className="table-header">Ended</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {executions.map(exec => (
                  <tr key={exec.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-500">{exec.id.slice(0, 8)}…</td>
                    <td className="table-cell">
                      <span className="font-medium text-white">{exec.workflow?.name || '—'}</span>
                    </td>
                    <td className="table-cell">
                      <span className="badge badge-blue">v{exec.workflow_version}</span>
                    </td>
                    <td className="table-cell"><StatusBadge status={exec.status} /></td>
                    <td className="table-cell text-xs">{exec.triggered_by}</td>
                    <td className="table-cell text-xs text-gray-400">{formatDate(exec.started_at)}</td>
                    <td className="table-cell text-xs text-gray-400">{formatDate(exec.ended_at)}</td>
                    <td className="table-cell">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => openLogs(exec)}
                      >
                        View Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <span className="text-sm text-gray-400">Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <button className="btn-secondary btn-sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {viewExec && <ExecutionLogsModal execution={viewExec} onClose={() => setViewExec(null)} />}
    </div>
  )
}
