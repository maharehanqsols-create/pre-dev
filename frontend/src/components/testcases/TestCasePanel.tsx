import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { TCRecord } from '../../store/session'
import s from './TestCasePanel.module.css'

interface Props {
  testCases: TCRecord[]
  onApprove: (id: number) => void
  onReject: (id: number, reason: string) => void
  onRegenerate: (tc: TCRecord) => void
  loading: boolean
}

export default function TestCasePanel({
  testCases,
  onApprove,
  onReject,
  onRegenerate,
  loading,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const stats = {
    total: testCases.length,
    approved: testCases.filter(t => t.status === 'approved').length,
    pending: testCases.filter(t => t.status === 'pending').length,
    rejected: testCases.filter(t => t.status === 'rejected').length,
  }

  const handleReject = (id: number) => {
    if (rejectReason.trim()) {
      onReject(id, rejectReason)
      setRejectingId(null)
      setRejectReason('')
    }
  }

  if (testCases.length === 0) {
    return (
      <div className={s.empty}>
        <p>Generate test cases to see them here</p>
      </div>
    )
  }

  return (
    <div className={s.tcPanel}>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.label}>Total</span>
          <span className={s.value}>{stats.total}</span>
        </div>
        <div className={s.stat}>
          <span className={s.label}>✓</span>
          <span className={`${s.value} ${s.approved}`}>{stats.approved}</span>
        </div>
        <div className={s.stat}>
          <span className={s.label}>⏱</span>
          <span className={`${s.value} ${s.pending}`}>{stats.pending}</span>
        </div>
        <div className={s.stat}>
          <span className={s.label}>✕</span>
          <span className={`${s.value} ${s.rejected}`}>{stats.rejected}</span>
        </div>
      </div>

      <div className={s.list}>
        {testCases.map(tc => (
          <div key={tc.id} className={`${s.card} ${s[tc.status]}`}>
            <button
              className={s.header}
              onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            >
              <div className={s.headerLeft}>
                <div className={`${s.priorityBadge} ${s[`priority${tc.priority}`]}`}>
                  {tc.priority.slice(0, 1)}
                </div>
                <div className={s.headerText}>
                  <p className={s.title}>{tc.title}</p>
                  <p className={s.category}>{tc.category}</p>
                </div>
              </div>
              <div className={s.statusIndicator}>
                {tc.status === 'approved' && <CheckCircle size={14} className={s.success} />}
                {tc.status === 'pending' && <div className={`${s.dot} ${s.pending}`} />}
                {tc.status === 'rejected' && <XCircle size={14} className={s.danger} />}
              </div>
              {expandedId === tc.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expandedId === tc.id && (
              <div className={s.content}>
                {tc.preconditions.length > 0 && (
                  <div className={s.section}>
                    <h4 className={s.sectionTitle}>Preconditions</h4>
                    <ul className={s.list2}>
                      {tc.preconditions.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {tc.gherkin_steps.length > 0 && (
                  <div className={s.section}>
                    <h4 className={s.sectionTitle}>Gherkin Steps</h4>
                    <div className={s.gherkin}>
                      {tc.gherkin_steps.map((step, i) => (
                        <div key={i} className={s.step}>
                          <span className={s.keyword}>{step.keyword}</span>
                          <span className={s.stepText}>{step.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tc.tags.length > 0 && (
                  <div className={s.section}>
                    <h4 className={s.sectionTitle}>Tags</h4>
                    <div className={s.tags}>
                      {tc.tags.map((tag, i) => (
                        <span key={i} className={s.tag}>
                          @{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tc.risks.length > 0 && (
                  <div className={s.section}>
                    <h4 className={s.sectionTitle}>Risks</h4>
                    <div className={s.riskBox}>
                      {tc.risks.map((risk, i) => (
                        <p key={i} className={s.riskItem}>
                          ⚠️ {risk}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {tc.status === 'rejected' && (
                  <div className={s.section}>
                    <h4 className={s.sectionTitle}>Rejection Reason</h4>
                    <div className={s.errorBox}>
                      <p>Rejected - Review and regenerate</p>
                    </div>
                  </div>
                )}

                <div className={s.actions}>
                  {tc.status !== 'approved' && (
                    <button
                      className={`${s.btn} ${s.success}`}
                      onClick={() => onApprove(tc.id)}
                      disabled={loading}
                    >
                      <CheckCircle size={14} />
                      Approve
                    </button>
                  )}
                  {tc.status !== 'rejected' && rejectingId !== tc.id && (
                    <button
                      className={`${s.btn} ${s.danger}`}
                      onClick={() => setRejectingId(tc.id)}
                      disabled={loading}
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  )}
                  <button
                    className={`${s.btn} ${s.secondary}`}
                    onClick={() => onRegenerate(tc)}
                    disabled={loading}
                  >
                    <RefreshCw size={14} />
                    Regenerate
                  </button>
                </div>

                {rejectingId === tc.id && (
                  <div className={s.rejectForm}>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why this test case needs changes..."
                      className={s.textarea}
                      rows={3}
                    />
                    <div className={s.rejectActions}>
                      <button
                        className={`${s.btn} ${s.danger}`}
                        onClick={() => handleReject(tc.id)}
                        disabled={!rejectReason.trim() || loading}
                      >
                        Confirm Reject
                      </button>
                      <button
                        className={`${s.btn} ${s.secondary}`}
                        onClick={() => {
                          setRejectingId(null)
                          setRejectReason('')
                        }}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
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
