import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { TCRecord } from '../store/session'
import s from './TestCasePanel.module.css'

interface Props {
  testCases: TCRecord[]
  onApprove: (id: number) => void
  onReject: (id: number, reason: string) => void
  onRegenerate: (tc: TCRecord) => void
  loading: boolean
}

export default function TestCasePanel({ testCases, onApprove, onReject, onRegenerate, loading }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [busy, setBusy] = useState<number | null>(null)

  const stats = {
    total:    testCases.length,
    approved: testCases.filter(t => t.status === 'approved').length,
    pending:  testCases.filter(t => t.status === 'pending').length,
    rejected: testCases.filter(t => t.status === 'rejected').length,
  }

  const filtered = filter === 'all' ? testCases : testCases.filter(t => t.status === filter)

  const handleApprove = async (id: number) => {
    setBusy(id); await onApprove(id); setBusy(null)
  }
  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) return
    setBusy(id); await onReject(id, rejectReason); setBusy(null)
    setRejectingId(null); setRejectReason('')
  }
  const handleRegen = async (tc: TCRecord) => {
    setBusy(tc.id); await onRegenerate(tc); setBusy(null)
  }

  if (testCases.length === 0) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>🧪</div>
        <p>No test cases yet</p>
        <span>Approve a PRD and click "Generate Tests"</span>
      </div>
    )
  }

  return (
    <div className={s.panel}>
      {/* Stats */}
      <div className={s.stats}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            className={`${s.statBtn} ${filter === f ? s.activeFilter : ''} ${f !== 'all' ? s[f] : ''}`}
            onClick={() => setFilter(f)}
          >
            <span className={s.statNum}>
              {f === 'all' ? stats.total : stats[f]}
            </span>
            <span className={s.statLabel}>{f === 'all' ? 'Total' : f.charAt(0).toUpperCase() + f.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className={s.list}>
        {filtered.map(tc => (
          <div key={tc.id} className={`${s.card} ${s[tc.status]}`}>
            {/* Card header */}
            <button
              className={s.cardHeader}
              onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            >
              <div className={`${s.pri} ${s[`pri${tc.priority}`]}`}>{tc.priority[0]}</div>
              <div className={s.cardInfo}>
                <span className={s.cardTitle}>{tc.title}</span>
                <span className={s.cardMeta}>
                  {tc.scenario_category} · {tc.scenario_id}
                </span>
              </div>
              <div className={s.cardRight}>
                {tc.status === 'approved' && <CheckCircle size={13} className={s.iconGreen} />}
                {tc.status === 'pending'  && <div className={`${s.dot} ${s.dotAmber}`} />}
                {tc.status === 'rejected' && <XCircle size={13} className={s.iconRed} />}
                {expandedId === tc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {expandedId === tc.id && (
              <div className={s.cardBody}>
                {/* Tags */}
                {tc.tags?.length > 0 && (
                  <div className={s.tags}>
                    {tc.tags.map((t, i) => <span key={i} className={s.tag}>{t}</span>)}
                  </div>
                )}

                {/* Preconditions */}
                {tc.preconditions?.length > 0 && (
                  <div className={s.section}>
                    <div className={s.sectionLabel}>Preconditions</div>
                    {tc.preconditions.map((p, i) => (
                      <div key={i} className={s.precond}>• {p}</div>
                    ))}
                  </div>
                )}

                {/* Gherkin */}
                {tc.gherkin_steps?.length > 0 && (
                  <div className={s.section}>
                    <div className={s.sectionLabel}>Test Steps</div>
                    <div className={s.gherkin}>
                      {tc.gherkin_steps.map((step, i) => (
                        <div key={i} className={s.step}>
                          <span className={s.kw} data-kw={step.keyword}>{step.keyword}</span>
                          <span className={s.stepText}>{step.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Edge Notes */}
                {tc.edge_notes?.length > 0 && (
                  <div className={s.section}>
                    <div className={s.sectionLabel}>Edge Cases & Gotchas</div>
                    {tc.edge_notes.map((n, i) => (
                      <div key={i} className={s.edgeNote}>
                        <AlertTriangle size={11} /> {n}
                      </div>
                    ))}
                  </div>
                )}

                {/* Risks */}
                {tc.risks?.length > 0 && (
                  <div className={s.section}>
                    <div className={s.sectionLabel}>Risks</div>
                    <div className={s.risksBox}>
                      {tc.risks.map((r, i) => (
                        <div key={i} className={s.riskItem}>
                          <span className={s.riskSev} data-sev={typeof r === 'string' ? 'MEDIUM' : r.severity}>
                            {typeof r === 'string' ? 'RISK' : r.severity}
                          </span>
                          <div className={s.riskContent}>
                            <span className={s.riskDesc}>
                              {typeof r === 'string' ? r : r.description}
                            </span>
                            {typeof r !== 'string' && r.mitigation && (
                              <span className={s.riskMit}>↳ {r.mitigation}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection reason */}
                {tc.status === 'rejected' && tc.reject_reason && (
                  <div className={s.rejectReasonBox}>
                    <XCircle size={12} /> {tc.reject_reason}
                  </div>
                )}

                {/* Reject form */}
                {rejectingId === tc.id && (
                  <div className={s.rejectForm}>
                    <textarea
                      className={s.rejectTextarea}
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Why is this test case being rejected?"
                      rows={2} autoFocus
                    />
                    <div className={s.rejectFormActions}>
                      <button className={s.confirmReject} onClick={() => handleReject(tc.id)} disabled={!rejectReason.trim()}>
                        Confirm Reject
                      </button>
                      <button className={s.cancelReject} onClick={() => { setRejectingId(null); setRejectReason('') }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className={s.actions}>
                  <button className={s.regenAction} onClick={() => handleRegen(tc)} disabled={loading || busy === tc.id}>
                    <RefreshCw size={12} className={busy === tc.id ? s.spin : ''} /> Regenerate
                  </button>
                  {tc.status !== 'rejected' && rejectingId !== tc.id && (
                    <button className={s.rejectAction} onClick={() => setRejectingId(tc.id)} disabled={loading || busy === tc.id}>
                      <XCircle size={12} /> Reject
                    </button>
                  )}
                  {tc.status !== 'approved' && (
                    <button className={s.approveAction} onClick={() => handleApprove(tc.id)} disabled={loading || busy === tc.id}>
                      <CheckCircle size={12} /> Approve
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}