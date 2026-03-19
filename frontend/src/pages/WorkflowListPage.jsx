import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { workflowsApi } from '../api'
import { ActiveBadge } from '../components/Badges'

export default function WorkflowListPage() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await workflowsApi.list({ page, limit: 10, search })
      setWorkflows(res.data.workflows || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      setError(e.error || 'Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete workflow "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await workflowsApi.delete(id)
      fetchWorkflows()
    } catch (e) {
      alert(e.error || 'Failed to delete workflow')
    } finally {
      setDeleting(null)
    }
  }

  const pages = Math.ceil(total / 10)

  return (
    <div className="p-8 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-gray-400 text-sm mt-1">{total} workflow{total !== 1 ? 's' : ''} total</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/workflows/create')}>
          <span>+</span> Create Workflow
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          className="input max-w-sm"
          placeholder="Search by workflow name..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
        {search && (
          <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}>
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-gray-500">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Loading workflows...
            </div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : workflows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-white mb-2">No workflows yet</h3>
            <p className="text-gray-400 text-sm mb-6">Create your first workflow to get started</p>
            <button className="btn-primary" onClick={() => navigate('/workflows/create')}>
              + Create Workflow
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="table-header">ID</th>
                  <th className="table-header">Name</th>
                  <th className="table-header">Steps</th>
                  <th className="table-header">Version</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Created</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {workflows.map(wf => (
                  <tr key={wf.id} className="hover:bg-gray-800/30 transition-colors group">
                    <td className="table-cell font-mono text-xs text-gray-500">
                      {wf.id.slice(0, 8)}…
                    </td>
                    <td className="table-cell">
                      <span className="font-medium text-white">{wf.name}</span>
                      {wf.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{wf.description}</p>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{wf._count?.steps ?? 0}</span>
                    </td>
                    <td className="table-cell">
                      <span className="badge badge-blue">v{wf.version}</span>
                    </td>
                    <td className="table-cell">
                      <ActiveBadge isActive={wf.is_active} />
                    </td>
                    <td className="table-cell text-gray-500 text-xs">
                      {new Date(wf.created_at).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => navigate(`/workflows/${wf.id}/execute`)}
                        >
                          ▶ Execute
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          disabled={deleting === wf.id}
                          onClick={() => handleDelete(wf.id, wf.name)}
                        >
                          {deleting === wf.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <span className="text-sm text-gray-400">
                  Page {page} of {pages} ({total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary btn-sm"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    ← Prev
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    disabled={page === pages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
