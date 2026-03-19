import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { rulesApi, stepsApi, workflowsApi } from '../api'
import Modal from '../components/Modal'

function validateCondition(condition) {
  if (!condition || condition.trim().toUpperCase() === 'DEFAULT') return null
  const forbidden = ['eval', 'function', 'require', 'import', 'process', 'window', 'document', '__']
  for (const kw of forbidden) {
    if (condition.toLowerCase().includes(kw)) return `Forbidden keyword: "${kw}"`
  }
  // Basic parenthesis balance
  let depth = 0
  for (const c of condition) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (depth < 0) return 'Unmatched closing parenthesis'
  }
  if (depth !== 0) return 'Unmatched opening parenthesis'
  return null
}

function RuleFormModal({ rule, steps, currentStepId, onSave, onClose }) {
  const [form, setForm] = useState({
    condition: rule?.condition || '',
    next_step_id: rule?.next_step_id || '',
    priority: rule?.priority ?? '',
  })
  const [condErr, setCondErr] = useState(null)

  const handleSave = () => {
    const err = validateCondition(form.condition)
    if (err) return setCondErr(err)
    if (!form.condition.trim()) return setCondErr('Condition is required')
    onSave({
      condition: form.condition.trim(),
      next_step_id: form.next_step_id || null,
      priority: form.priority !== '' ? Number(form.priority) : undefined,
    })
  }

  const otherSteps = steps.filter(s => s.id !== currentStepId)

  return (
    <Modal title={rule ? 'Edit Rule' : 'Add Rule'} onClose={onClose}>
      <div className="space-y-4">
        {condErr && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
            ⚠ {condErr}
          </div>
        )}

        <div>
          <label className="label">Condition *</label>
          <input
            className={`input font-mono ${condErr ? 'border-red-500' : ''}`}
            placeholder="e.g. amount > 100 && country == 'US'  or  DEFAULT"
            value={form.condition}
            onChange={e => { setCondErr(null); setForm(f => ({ ...f, condition: e.target.value })) }}
          />
          <div className="mt-2 p-2 bg-gray-800/60 rounded text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">Supported syntax:</p>
            <p>Operators: <code className="text-brand-400">== != &lt; &gt; &lt;= &gt;=</code></p>
            <p>Logical: <code className="text-brand-400">&amp;&amp; ||</code></p>
            <p>Functions: <code className="text-brand-400">contains(field, "val") startsWith(field, "x") endsWith(field, "y")</code></p>
            <p>Special: <code className="text-brand-400">DEFAULT</code> — matches when no other rule matches</p>
          </div>
        </div>

        <div>
          <label className="label">Next Step</label>
          <select
            className="input"
            value={form.next_step_id}
            onChange={e => setForm(f => ({ ...f, next_step_id: e.target.value }))}
          >
            <option value="">— End Workflow (null) —</option>
            {otherSteps.map(s => (
              <option key={s.id} value={s.id}>{s.order}. {s.name} ({s.step_type})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Priority</label>
          <input
            className="input"
            type="number"
            min="1"
            placeholder="Auto-assigned if left blank"
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
          />
          <p className="text-xs text-gray-500 mt-1">Lower number = higher priority. Rules are evaluated in ascending priority order.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-primary flex-1" onClick={handleSave}>Save Rule</button>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

export default function RuleEditorPage() {
  const { workflow_id, step_id } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState(null)
  const [allSteps, setAllSteps] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ruleModal, setRuleModal] = useState(null) // null | 'add' | ruleObj
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [stepsRes, rulesRes] = await Promise.all([
        stepsApi.list(workflow_id),
        rulesApi.list(step_id),
      ])
      const foundStep = stepsRes.data.find(s => s.id === step_id)
      setStep(foundStep)
      setAllSteps(stepsRes.data)
      setRules(rulesRes.data)
    } catch (e) {
      setError('Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [workflow_id, step_id])

  useEffect(() => { load() }, [load])

  const handleAddRule = async (data) => {
    try {
      await rulesApi.create(step_id, data)
      await load()
      setRuleModal(null)
    } catch (e) { setError(e.error || 'Failed to add rule') }
  }

  const handleEditRule = async (data) => {
    try {
      await rulesApi.update(ruleModal.id, data)
      await load()
      setRuleModal(null)
    } catch (e) { setError(e.error || 'Failed to update rule') }
  }

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return
    try {
      await rulesApi.delete(ruleId)
      setRules(prev => prev.filter(r => r.id !== ruleId))
    } catch (e) { setError(e.error || 'Failed to delete rule') }
  }

  // Drag and drop reorder
  const handleDragStart = (e, idx) => { setDragging(idx); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragOver(idx) }

  const handleDrop = async (e, dropIdx) => {
    e.preventDefault()
    if (dragging === null || dragging === dropIdx) return
    const reordered = [...rules]
    const [moved] = reordered.splice(dragging, 1)
    reordered.splice(dropIdx, 0, moved)
    // Reassign priorities
    const updated = reordered.map((r, i) => ({ ...r, priority: i + 1 }))
    setRules(updated)
    setDragging(null)
    setDragOver(null)
    // Persist new priorities
    try {
      await Promise.all(updated.map(r => rulesApi.update(r.id, { priority: r.priority })))
    } catch { setError('Failed to reorder rules') }
  }

  const getNextStepName = (rule) => {
    if (!rule.next_step_id) return <span className="text-gray-500 italic">End Workflow</span>
    const step = allSteps.find(s => s.id === rule.next_step_id)
    return step ? `${step.order}. ${step.name}` : rule.next_step_id
  }

  const condErr = (condition) => validateCondition(condition)

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12 text-gray-500">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-3" /> Loading rules...
    </div>
  )

  return (
    <div className="p-8 fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button onClick={() => navigate(`/workflows/${workflow_id}/edit`)} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Rule Editor</h1>
          {step && <p className="text-gray-400 text-sm mt-1">Step: <span className="text-white font-medium">{step.name}</span> <span className="badge badge-blue ml-1">{step.step_type}</span></p>}
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-8 ml-[72px]">Drag rows to reorder priority. Rules are evaluated top-to-bottom — first match wins.</p>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">{error}</div>}

      <div className="flex justify-end mb-4">
        <button className="btn-primary" onClick={() => setRuleModal('add')}>+ Add Rule</button>
      </div>

      <div className="card overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-3xl mb-3">📜</div>
            <h3 className="font-semibold text-white mb-2">No rules yet</h3>
            <p className="text-gray-400 text-sm mb-4">Add rules to control which step comes next</p>
            <button className="btn-primary" onClick={() => setRuleModal('add')}>+ Add First Rule</button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="table-header w-8"></th>
                <th className="table-header">Priority</th>
                <th className="table-header">Condition</th>
                <th className="table-header">Next Step</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {rules.map((rule, idx) => {
                const err = condErr(rule.condition)
                const isDefault = rule.condition.trim().toUpperCase() === 'DEFAULT'
                return (
                  <tr
                    key={rule.id}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={() => { setDragging(null); setDragOver(null) }}
                    className={`transition-colors ${dragOver === idx ? 'bg-brand-900/20' : 'hover:bg-gray-800/30'}`}
                  >
                    <td className="table-cell cursor-grab text-gray-600 hover:text-gray-400 text-center">⠿</td>
                    <td className="table-cell">
                      <span className="w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-300 inline-flex">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="table-cell max-w-xs">
                      <code className={`text-xs font-mono ${isDefault ? 'text-yellow-400' : err ? 'text-red-400' : 'text-emerald-400'}`}>
                        {rule.condition}
                      </code>
                      {err && <p className="text-xs text-red-400 mt-1">⚠ {err}</p>}
                    </td>
                    <td className="table-cell text-sm">{getNextStepName(rule)}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button className="btn-secondary btn-sm" onClick={() => setRuleModal(rule)}>Edit</button>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(rule.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {ruleModal && (
        <RuleFormModal
          rule={ruleModal === 'add' ? null : ruleModal}
          steps={allSteps}
          currentStepId={step_id}
          onSave={ruleModal === 'add' ? handleAddRule : handleEditRule}
          onClose={() => setRuleModal(null)}
        />
      )}
    </div>
  )
}
