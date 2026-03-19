import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { workflowsApi, executionsApi } from '../api'
import { StatusBadge, StepTypeBadge } from '../components/Badges'

const formatLabel = (name) => {
  if (!name) return ''
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function InputForm({ schema, onSubmit, loading }) {
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})

  const validate = () => {
    const errs = {}
    for (const field of schema) {
      const val = form[field.name]
      if (field.required && (val === undefined || val === '')) {
        errs[field.name] = 'This field is required'
      }
      if (field.allowed_values?.length && val !== undefined && val !== '') {
        if (!field.allowed_values.includes(String(val))) {
          errs[field.name] = `Must be one of: ${field.allowed_values.join(', ')}`
        }
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return
    // Convert types
    const typed = {}
    for (const field of schema) {
      const raw = form[field.name]
      if (raw === undefined || raw === '') continue
      if (field.type === 'number') typed[field.name] = Number(raw)
      else if (field.type === 'boolean') typed[field.name] = raw === 'true'
      else typed[field.name] = raw
    }
    onSubmit(typed)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {schema.map(field => (
        <div key={field.name}>
          <label className="label">
            {formatLabel(field.name)}
            {field.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {field.allowed_values?.length ? (
            <select
              className="input"
              value={form[field.name] || ''}
              onChange={e => setForm(f => ({ ...f, [field.name]: e.target.value }))}
            >
              <option value="">Select...</option>
              {field.allowed_values.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : field.type === 'boolean' ? (
            <select
              className="input"
              value={form[field.name] || ''}
              onChange={e => setForm(f => ({ ...f, [field.name]: e.target.value }))}
            >
              <option value="">Select...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className="input"
              type={field.type === 'number' ? 'number' : 'text'}
              placeholder={`Enter ${formatLabel(field.name)}`}
              value={form[field.name] || ''}
              onChange={e => setForm(f => ({ ...f, [field.name]: e.target.value }))}
            />
          )}
          {errors[field.name] && <p className="text-xs text-red-400 mt-1">{errors[field.name]}</p>}
        </div>
      ))}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Starting...</> : '▶ Start Execution'}
      </button>
    </form>
  )
}

function RuleResult({ rule }) {
  return (
    <div className={`flex items-start gap-2 text-xs font-mono py-0.5 ${rule.result ? 'text-emerald-400' : 'text-gray-500'}`}>
      <span className="flex-shrink-0">{rule.result ? '✓' : '✗'}</span>
      <span className={rule.isDefault ? 'text-yellow-400' : ''}>{rule.rule}</span>
    </div>
  )
}

function LogEntry({ log }) {
  const duration = log.started_at && log.ended_at
    ? Math.round((new Date(log.ended_at) - new Date(log.started_at)))
    : null

  const statusColors = {
    completed: 'border-emerald-700/30 bg-emerald-900/10',
    failed: 'border-red-700/30 bg-red-900/10',
    rejected: 'border-red-700/30 bg-red-900/10',
    pending_approval: 'border-yellow-700/30 bg-yellow-900/10',
    skipped: 'border-gray-700/30',
  }

  return (
    <div className={`p-4 rounded-lg border ${statusColors[log.status] || 'border-gray-700/30'}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">{log.step_name}</span>
          <StepTypeBadge type={log.step_type} />
          <StatusBadge status={log.status} />
        </div>
        <div className="text-right flex-shrink-0">
          {duration !== null && <p className="text-xs text-gray-500">{duration}ms</p>}
          {log.approver_id && <p className="text-xs text-gray-400">Approver: {log.approver_id}</p>}
        </div>
      </div>

      {log.evaluated_rules?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1 font-semibold">Rules evaluated:</p>
          <div className="pl-2 border-l border-gray-700 space-y-0.5">
            {log.evaluated_rules.map((r, i) => <RuleResult key={i} rule={r} />)}
          </div>
        </div>
      )}

      {log.notification_log && (
        <div className="mb-3 text-xs text-gray-400 bg-gray-800/60 p-2 rounded">
          📣 {log.notification_log.channel}: {log.notification_log.message}
        </div>
      )}

      {log.selected_next_step && (
        <p className="text-xs text-gray-400">→ Next: <span className="text-white">{log.selected_next_step}</span></p>
      )}
      {log.selected_next_step === null && log.status === 'completed' && (
        <p className="text-xs text-emerald-400">→ Workflow ends here</p>
      )}
      {log.error_message && (
        <p className="text-xs text-red-400 mt-1">⚠ {log.error_message}</p>
      )}
    </div>
  )
}

export default function ExecuteWorkflowPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [workflow, setWorkflow] = useState(null)
  const [execution, setExecution] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [approving, setApproving] = useState(false)
  const [triggeredBy, setTriggeredBy] = useState('user-001')
  const pollRef = useRef(null)

  useEffect(() => {
    workflowsApi.get(id)
      .then(res => setWorkflow(res.data))
      .catch(() => setError('Failed to load workflow'))
      .finally(() => setLoading(false))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  const startPolling = useCallback((execId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await executionsApi.get(execId)
        setExecution(res.data)
        if (['completed', 'failed', 'canceled'].includes(res.data.status)) {
          clearInterval(pollRef.current)
        }
      } catch {}
    }, 2000)
  }, [])

  const handleStart = async (data) => {
    setStarting(true); setError(null)
    try {
      const res = await executionsApi.start(id, { data, triggered_by: triggeredBy })
      setExecution(res.data)
      startPolling(res.data.id)
    } catch (e) {
      setError(e.error || 'Failed to start execution')
    } finally {
      setStarting(false)
    }
  }

  const handleApprove = async (approved) => {
    if (!execution) return
    const approverId = prompt(`Enter approver ID:`, 'user-001') || 'user-001'
    setApproving(true)
    try {
      await executionsApi.approve(execution.id, { approved, approver_id: approverId })
      const res = await executionsApi.get(execution.id)
      setExecution(res.data)
      if (!['completed', 'failed', 'canceled'].includes(res.data.status)) {
        startPolling(execution.id)
      }
    } catch (e) {
      setError(e.error || 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  const handleCancel = async () => {
    if (!execution) return
    if (!window.confirm('Cancel this execution?')) return
    try {
      await executionsApi.cancel(execution.id)
      const res = await executionsApi.get(execution.id)
      setExecution(res.data)
      if (pollRef.current) clearInterval(pollRef.current)
    } catch (e) { setError(e.error || 'Cancel failed') }
  }

  const handleRetry = async () => {
    if (!execution) return
    try {
      await executionsApi.retry(execution.id)
      const res = await executionsApi.get(execution.id)
      setExecution(res.data)
      startPolling(execution.id)
    } catch (e) { setError(e.error || 'Retry failed') }
  }

  const isApprovalPending = execution?.status === 'in_progress' &&
    execution?.current_step?.step_type === 'approval'

  const schema = Array.isArray(workflow?.input_schema) ? workflow.input_schema : []

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12 text-gray-500">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-3" /> Loading...
    </div>
  )

  return (
    <div className="p-8 fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition-colors">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-white">Execute Workflow</h1>
          {workflow && <p className="text-gray-400 text-sm mt-1">{workflow.name} <span className="badge badge-blue ml-1 text-xs">v{workflow.version}</span></p>}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">{error}</div>}

      {/* Input Form (Step 1) */}
      {!execution && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-white mb-1">Step 1 — Configure Execution</h2>
          <p className="text-gray-400 text-sm mb-5">Fill in the required inputs for this workflow</p>

          <div className="mb-4">
            <label className="label">Triggered By (User ID)</label>
            <input className="input max-w-xs" value={triggeredBy} onChange={e => setTriggeredBy(e.target.value)} />
          </div>

          {schema.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg mb-4">
              No input schema defined for this workflow.
            </div>
          ) : null}

          <InputForm schema={schema} onSubmit={handleStart} loading={starting} />
        </div>
      )}

      {/* Execution Progress (Step 2) */}
      {execution && (
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-white mb-1">Step 2 — Execution Progress</h2>
              <p className="text-xs text-gray-500 font-mono">{execution.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={execution.status} />
              {['in_progress', 'pending'].includes(execution.status) && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full pulse-dot" /> polling
                </span>
              )}
            </div>
          </div>

          {/* Final banners */}
          {execution.status === 'completed' && (
            <div className="p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-lg mb-4">
              <p className="text-emerald-300 font-semibold text-sm">✅ Workflow Completed Successfully</p>
            </div>
          )}
          {execution.status === 'failed' && (
            <div className="p-4 bg-red-900/20 border border-red-700/40 rounded-lg mb-4">
              <p className="text-red-300 font-semibold text-sm">❌ Workflow Failed</p>
            </div>
          )}
          {execution.status === 'canceled' && (
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-lg mb-4">
              <p className="text-gray-400 font-semibold text-sm">⛔ Execution Canceled</p>
            </div>
          )}

          {/* Current step */}
          {execution.current_step && ['in_progress', 'pending'].includes(execution.status) && (
            <div className="p-4 bg-gray-800/50 rounded-lg mb-4 border border-gray-700/50">
              <p className="text-xs text-gray-500 mb-1">Current Step</p>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{execution.current_step.name}</span>
                <StepTypeBadge type={execution.current_step.step_type} />
              </div>
            </div>
          )}

          {/* Approval actions */}
          {isApprovalPending && (
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/40 rounded-lg mb-4">
              <p className="text-yellow-300 font-semibold text-sm mb-1">⏳ Awaiting Approval</p>
              <p className="text-gray-400 text-xs mb-3">Step "{execution.current_step?.name}" requires manual approval to continue.</p>
              <div className="flex gap-3">
                <button
                  className="btn-success"
                  disabled={approving}
                  onClick={() => handleApprove(true)}
                >
                  {approving ? '…' : '✓ Approve'}
                </button>
                <button
                  className="btn-danger"
                  disabled={approving}
                  onClick={() => handleApprove(false)}
                >
                  {approving ? '…' : '✕ Reject'}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {['in_progress', 'pending'].includes(execution.status) && (
              <button className="btn-danger btn-sm" onClick={handleCancel}>Cancel Execution</button>
            )}
            {execution.status === 'failed' && (
              <button className="btn-secondary btn-sm" onClick={handleRetry}>↩ Retry Failed Step</button>
            )}
            <button
              className="btn-secondary btn-sm"
              onClick={() => { setExecution(null); if (pollRef.current) clearInterval(pollRef.current) }}
            >
              New Execution
            </button>
          </div>
        </div>
      )}

      {/* Execution Logs (Step 3) */}
      {execution && (
        <div className="card p-6">
          <h2 className="font-semibold text-white mb-4">Step 3 — Execution Logs</h2>
          {(!execution.logs || execution.logs.length === 0) ? (
            <div className="text-center text-gray-500 text-sm py-8">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                Waiting for first log entry...
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {execution.logs.map((log, i) => <LogEntry key={i} log={log} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
