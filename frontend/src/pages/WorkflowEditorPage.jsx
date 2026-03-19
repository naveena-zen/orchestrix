import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { workflowsApi, stepsApi } from '../api'
import { StepTypeBadge } from '../components/Badges'
import Modal from '../components/Modal'

const STEP_TYPES = ['task', 'approval', 'notification']

function SchemaFieldRow({ field, index, onChange, onRemove }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="label text-xs">Field Name</label>
          <input
            className="input"
            placeholder="e.g. amount"
            value={field.name}
            onChange={e => onChange(index, 'name', e.target.value)}
          />
        </div>
        <div>
          <label className="label text-xs">Type</label>
          <select className="input" value={field.type} onChange={e => onChange(index, 'type', e.target.value)}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Allowed Values (comma-separated, optional)</label>
          <input
            className="input"
            placeholder="e.g. High,Medium,Low"
            value={(field.allowed_values || []).join(',')}
            onChange={e => onChange(index, 'allowed_values', e.target.value ? e.target.value.split(',').map(v => v.trim()) : [])}
          />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-brand-500 focus:ring-brand-500"
              checked={field.required}
              onChange={e => onChange(index, 'required', e.target.checked)}
            />
            <span className="text-sm text-gray-300">Required</span>
          </label>
        </div>
      </div>
      <button onClick={() => onRemove(index)} className="btn-danger btn-sm mt-5 flex-shrink-0">✕</button>
    </div>
  )
}

function StepModal({ step, onSave, onClose }) {
  const [form, setForm] = useState({
    name: step?.name || '',
    step_type: step?.step_type || 'task',
    order: step?.order ?? '',
    metadata: step?.metadata ? JSON.stringify(step.metadata, null, 2) : '{}',
  })
  const [err, setErr] = useState(null)

  const handleSave = () => {
    if (!form.name.trim()) return setErr('Step name is required')
    let meta
    try { meta = JSON.parse(form.metadata) } catch { return setErr('Metadata must be valid JSON') }
    onSave({ ...form, metadata: meta, order: form.order !== '' ? Number(form.order) : undefined })
  }

  return (
    <Modal title={step ? 'Edit Step' : 'Add Step'} onClose={onClose}>
      <div className="space-y-4">
        {err && <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-3">{err}</div>}
        <div>
          <label className="label">Step Name</label>
          <input className="input" placeholder="e.g. Manager Approval" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.step_type} onChange={e => setForm(f => ({ ...f, step_type: e.target.value }))}>
              {STEP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Order</label>
            <input className="input" type="number" min="1" placeholder="Auto" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">Metadata (JSON)</label>
          <textarea
            className="input font-mono text-xs"
            rows={5}
            value={form.metadata}
            onChange={e => setForm(f => ({ ...f, metadata: e.target.value }))}
          />
          <p className="text-xs text-gray-500 mt-1">
            Examples: {`{"assignee_email":"mgr@co.com"}`} or {`{"notification_channel":"slack"}`}
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-primary flex-1" onClick={handleSave}>Save Step</button>
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

export default function WorkflowEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({ name: '', description: '', is_active: true, input_schema: [] })
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [stepModal, setStepModal] = useState(null) // null | 'add' | stepObj

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    workflowsApi.get(id)
      .then(res => {
        const wf = res.data
        setForm({
          name: wf.name,
          description: wf.description || '',
          is_active: wf.is_active,
          input_schema: Array.isArray(wf.input_schema) ? wf.input_schema : [],
        })
        setSteps(wf.steps || [])
      })
      .catch(() => setError('Failed to load workflow'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const addSchemaField = () => {
    setForm(f => ({
      ...f,
      input_schema: [...f.input_schema, { name: '', type: 'string', required: false, allowed_values: [] }],
    }))
  }

  const updateSchemaField = (index, key, value) => {
    setForm(f => {
      const schema = [...f.input_schema]
      schema[index] = { ...schema[index], [key]: value }
      return { ...f, input_schema: schema }
    })
  }

  const removeSchemaField = (index) => {
    setForm(f => ({ ...f, input_schema: f.input_schema.filter((_, i) => i !== index) }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Workflow name is required')
    setSaving(true); setError(null)
    try {
      let wf
      if (isEdit) {
        const res = await workflowsApi.update(id, form)
        wf = res.data
      } else {
        const res = await workflowsApi.create(form)
        wf = res.data
      }

      // set start_step_id to first step by order
      if (steps.length > 0) {
        const firstStep = [...steps].sort((a, b) => a.order - b.order)[0]
        await workflowsApi.update(wf.id, { start_step_id: firstStep.id })
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/')
      }, 1000)
    } catch (e) {
      setError(e.error || 'Failed to save workflow')
    } finally {
      setSaving(false)
    }
  }

  const handleAddStep = async (stepData) => {
    try {
      const workflowId = id
      if (!workflowId) {
        // Must save workflow first
        setError('Please save the workflow first, then add steps.')
        setStepModal(null)
        return
      }
      const res = await stepsApi.create(workflowId, stepData)
      setSteps(prev => [...prev, res.data].sort((a, b) => a.order - b.order))
      setStepModal(null)
    } catch (e) {
      setError(e.error || 'Failed to add step')
    }
  }

  const handleEditStep = async (stepData) => {
    try {
      const res = await stepsApi.update(stepModal.id, stepData)
      setSteps(prev => prev.map(s => s.id === stepModal.id ? res.data : s).sort((a, b) => a.order - b.order))
      setStepModal(null)
    } catch (e) {
      setError(e.error || 'Failed to update step')
    }
  }

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm('Delete this step and all its rules?')) return
    try {
      await stepsApi.delete(stepId)
      setSteps(prev => prev.filter(s => s.id !== stepId))
    } catch (e) {
      setError(e.error || 'Failed to delete step')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12 text-gray-500">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        Loading workflow...
      </div>
    </div>
  )

  return (
    <div className="p-8 fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Workflow' : 'Create Workflow'}</h1>
          {isEdit && <p className="text-gray-400 text-sm mt-1">Changes auto-increment the workflow version</p>}
        </div>
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg p-4">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-4">
          ✅ Workflow saved! Redirecting...
        </div>
      )}

      {/* Basic Info */}
      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Workflow Details</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" placeholder="e.g. Expense Approval" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} placeholder="Optional description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-brand-600' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_active ? 'left-6' : 'left-1'}`} />
            </button>
            <span className="text-sm text-gray-300">{form.is_active ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      </div>

      {/* Input Schema */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white">Input Schema</h2>
            <p className="text-xs text-gray-500 mt-0.5">Define the fields required when executing this workflow</p>
          </div>
          <button className="btn-secondary btn-sm" onClick={addSchemaField}>+ Add Field</button>
        </div>

        {form.input_schema.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-gray-700 rounded-lg">
            <p className="text-gray-500 text-sm">No input fields defined. Click "Add Field" to start.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {form.input_schema.map((field, idx) => (
              <SchemaFieldRow key={idx} field={field} index={idx} onChange={updateSchemaField} onRemove={removeSchemaField} />
            ))}
          </div>
        )}
      </div>

      {/* Steps — only show when editing an existing workflow */}
      {isEdit && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-white">Steps</h2>
              <p className="text-xs text-gray-500 mt-0.5">Steps execute in order. Set rules to control routing.</p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => setStepModal('add')}>+ Add Step</button>
          </div>

          {steps.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-gray-700 rounded-lg">
              <p className="text-gray-500 text-sm">No steps yet. Add steps to define the workflow execution path.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/30 hover:border-gray-600/50 transition-colors group">
                  <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                    {step.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{step.name}</span>
                      <StepTypeBadge type={step.step_type} />
                    </div>
                    {step.rules?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{step.rules.length} rule{step.rules.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => navigate(`/workflows/${id}/steps/${step.id}/rules`)}
                    >
                      Edit Rules
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => setStepModal(step)}>Edit</button>
                    <button className="btn-danger btn-sm" onClick={() => handleDeleteStep(step.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isEdit && (
        <div className="card p-4 mb-6 border-yellow-700/30 bg-yellow-900/10">
          <p className="text-sm text-yellow-400">
            💡 Save the workflow first, then you can add steps and configure rules.
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
          ) : (
            isEdit ? '💾 Save Changes' : '🚀 Create Workflow'
          )}
        </button>
        <button className="btn-secondary" onClick={() => navigate('/')}>Cancel</button>
      </div>

      {/* Step Modal */}
      {stepModal && (
        <StepModal
          step={stepModal === 'add' ? null : stepModal}
          onSave={stepModal === 'add' ? handleAddStep : handleEditStep}
          onClose={() => setStepModal(null)}
        />
      )}
    </div>
  )
}
