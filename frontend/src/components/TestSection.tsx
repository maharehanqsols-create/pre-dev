import { useState, useEffect } from 'react'
import { Check, X, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react'
import type { PRD, LLMConfig, TestCase } from '../api'
import { generateTests, listTests, approveTest, rejectTest, regenerateTest } from '../api'
import s from './TestSection.module.css'

interface Props {
  prd: PRD
  config: LLMConfig
}

export default function TestSection({ prd, config }: Props) {
  const [tests, setTests] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState('')
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    listTests(prd.id).then(data => {
      if (data.length) { setTests(data); setGenerated(true) }
    })
  }, [prd.id])

  const generate = async () => {
    setLoading(true); setError('')
    try {
      const result = await generateTests(prd.id, config)
      setTests(result); setGenerated(true)
      setExpanded(new Set(result.slice(0, 3).map(t => t.id)))
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message)
    } finally { setLoading(false) }
  }

  const updateOne = (updated: TestCase) =>
    setTests(prev => prev.map(t => t.id === updated.id ? updated : t))

  const doApprove = async (id: number) => {
    setActionLoading(id)
    try { updateOne(await approveTest(id)) } finally { setActionLoading(null) }
  }

  const doReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    setActionLoading(rejectId)
    try {
      updateOne(await rejectTest(rejectId, rejectReason))
      setRejectId(null); setRejectReason('')
    } finally { setActionLoading(null) }
  }

  const doRegen = async (tc: TestCase) => {
    setActionLoading(tc.id)
    try { updateOne(await regenerateTest(tc.id, config, tc, prd.content)) }
    finally { setActionLoading(null) }
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const stats = {
    total: tests.length,
    approved: tests.filter(t => t.status === 'approved').length,
    rejected: tests.filter(t => t.status === 'rejected').length,
    pending: tests.filter(t => t.status === 'pending').length,
  }

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Test Cases</h2>
          <p className={s.sub}>Review, approve, reject or regenerate each test case</p>
        </div>
        {!generated && (
          <button className={s.genBtn} onClick={generate} disabled={loading}>
            {loading ? <><span className={s.spinner} /> Generating...</> : 'Generate Test Cases'}
          </button>
        )}
      </div>

      {error && <div className={s.error}>{error}</div>}

      {generated && (
        <div className={s.stats}>
          <div className={s.stat}><span className={s.statNum}>{stats.total}</span><span>Total</span></div>
          <div className={s.stat}><span className={s.statNum} style={{color:'var(--green)'}}>{stats.approved}</span><span>Approved</span></div>
          <div className={s.stat}><span className={s.statNum} style={{color:'var(--amber)'}}>{stats.pending}</span><span>Pending</span></div>
          <div className={s.stat}><span className={s.statNum} style={{color:'var(--red)'}}>{stats.rejected}</span><span>Rejected</span></div>
        </div>
      )}

      {loading && (
        <div className={s.loadingBox}>
          <span className={s.spinner} />
          <span>Generating sequentially: Scenarios → Risks → Limitations → Test Cases (1-2 min)...</span>
        </div>
      )}

      <div className={s.list}>
        {tests.map(tc => (
          <div key={tc.id} className={`${s.card} ${s[tc.status]}`}>
            <div className={s.cardHeader} onClick={() => toggleExpand(tc.id)}>
              <div className={s.cardLeft}>
                <span className={s.priority} data-p={tc.priority}>{tc.priority}</span>
                <span className={s.category}>{tc.scenario_category}</span>
                <span className={s.tcTitle}>{tc.title}</span>
              </div>
              <div className={s.cardRight}>
                <span className={s.statusDot} data-status={tc.status} />
                {expanded.has(tc.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            {expanded.has(tc.id) && (
              <div className={s.cardBody}>
                {tc.preconditions.length > 0 && (
                  <div className={s.section}>
                    <div className={s.sectionLabel}>Preconditions</div>
                    {tc.preconditions.map((p, i) => (
                      <div key={i} className={s.precond}>• {p}</div>
                    ))}
                  </div>
                )}

                <div className={s.section}>
                  <div className={s.sectionLabel}>Gherkin</div>
                  <div className={s.gherkin}>
                    {tc.gherkin_steps.map((step, i) => (
                      <div key={i} className={s.step}>
                        <span className={s.keyword} data-kw={step.keyword}>{step.keyword}</span>
                        <span className={s.stepText}>{step.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {tc.tags.length > 0 && (
                  <div className={s.tags}>
                    {tc.tags.map(tag => <span key={tag} className={s.tag}>{tag}</span>)}
                  </div>
                )}

                {tc.risks.length > 0 && (
                  <div className={s.risksBox}>
                    <div className={s.riskLabel}><AlertTriangle size={12} /> Risks</div>
                    {tc.risks.slice(0, 2).map((r, i) => <div key={i} className={s.riskItem}>{r}</div>)}
                  </div>
                )}

                {tc.reject_reason && (
                  <div className={s.rejectReasonBox}>
                    <Info size={12} /> Rejected: {tc.reject_reason}
                  </div>
                )}

                {rejectId === tc.id && (
                  <div className={s.rejectForm}>
                    <input
                      className={s.rejectInput}
                      placeholder="Reason for rejection..."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doReject()}
                      autoFocus
                    />
                    <button className={s.rejectConfirm} onClick={doReject}>Confirm</button>
                    <button className={s.rejectCancel} onClick={() => setRejectId(null)}>Cancel</button>
                  </div>
                )}

                {tc.status !== 'approved' && (
                  <div className={s.cardActions}>
                    <button
                      className={s.regenAction}
                      onClick={() => doRegen(tc)}
                      disabled={actionLoading === tc.id}
                    >
                      <RefreshCw size={12} className={actionLoading === tc.id ? s.spinning : ''} />
                      Regenerate
                    </button>
                    <button
                      className={s.rejectAction}
                      onClick={() => { setRejectId(tc.id); setRejectReason('') }}
                      disabled={actionLoading === tc.id}
                    >
                      <X size={12} /> Reject
                    </button>
                    <button
                      className={s.approveAction}
                      onClick={() => doApprove(tc.id)}
                      disabled={actionLoading === tc.id}
                    >
                      <Check size={12} /> Approve
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}