import { Check, RefreshCw, TestTube, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useState } from 'react'
import type { Session, TCRecord } from '../../store/session'
import s from './ChatPanel.module.css'

interface Props {
  session: Session
  loading: boolean
  loadingMsg: string
  chatEndRef: React.RefObject<HTMLDivElement | null>
  onApprovePRD: () => void
  onGenerateTests: () => void
  onApproveTC: (id: number) => void
  onRejectTC: (id: number, reason: string) => void
  onRegenTC: (tc: TCRecord) => void
}

export default function ChatPanel({
  session, loading, loadingMsg, chatEndRef,
  onApprovePRD, onGenerateTests, onApproveTC, onRejectTC, onRegenTC,
}: Props) {
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<number | null>(null)

  const toggleTC = (id: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleApprove = async (id: number) => {
    setBusy(id); await onApproveTC(id); setBusy(null)
  }
  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) return
    setBusy(id); await onRejectTC(id, rejectReason); setBusy(null)
    setRejectingId(null); setRejectReason('')
  }
  const handleRegen = async (tc: TCRecord) => {
    setBusy(tc.id); await onRegenTC(tc); setBusy(null)
  }

  return (
    <div className={s.panel}>
      <div className={s.messages}>
        {session.messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isProgress = msg.type === 'progress'

          if (isUser) return (
            <div key={i} className={s.userRow}>
              <span className={s.userMeta}>{fmt(msg.timestamp)}</span>
              <div className={s.userBubble}>{msg.content}</div>
            </div>
          )

          return (
            <div key={i} className={s.aiRow}>
              <div className={s.aiAvatar}>⚡</div>
              <div className={s.aiBody}>
                <span className={s.aiMeta}>QA AI · {fmt(msg.timestamp)}</span>

                {/* Progress message */}
                {isProgress && (
                  <div className={s.progressMsg}>
                    <div className={s.progressSpinner} />
                    <span>{msg.content}</span>
                  </div>
                )}

                {/* Plain text / status */}
                {(msg.type === 'text' || msg.type === 'status') && (
                  <div className={`${s.aiText} ${msg.type === 'status' ? s.statusText : ''}`}>
                    {msg.content}
                  </div>
                )}

                {/* PRD ready / updated */}
                {(msg.type === 'prd_ready' || msg.type === 'prd_updated') && (
                  <div className={s.artifact}>
                    <div className={s.artifactHeader}>
                      <span className={s.artifactIcon}>📄</span>
                      <span>{msg.type === 'prd_updated' ? 'PRD Updated' : 'PRD Generated'}</span>
                      {msg.prdVersion && <span className={s.vBadge}>v{msg.prdVersion}</span>}
                    </div>
                    <p className={s.artifactDesc}>{msg.content}</p>
                    <div className={s.hitlRow}>
                      <button className={`${s.hitlBtn} ${s.approveBtn}`} onClick={onApprovePRD} disabled={loading}>
                        <Check size={12} /> Approve PRD
                      </button>
                      <button className={`${s.hitlBtn} ${s.regenBtn}`} onClick={() => setShowFeedback(showFeedback === msg.id ? null : msg.id)} disabled={loading}>
                        <RefreshCw size={12} /> Regenerate
                      </button>
                      <button className={`${s.hitlBtn} ${s.testBtn}`} onClick={onGenerateTests} disabled={loading}>
                        <TestTube size={12} /> Generate Tests
                      </button>
                    </div>
                    {showFeedback === msg.id && (
                      <div className={s.feedbackBox}>
                        <textarea
                          className={s.feedbackInput}
                          placeholder="Describe changes… e.g. 'Add rate limiting and OTP flow'"
                          value={feedback}
                          onChange={e => setFeedback(e.target.value)}
                          rows={2} autoFocus
                        />
                        <div className={s.feedbackActions}>
                          <button className={s.cancelFb} onClick={() => setShowFeedback(null)}>Cancel</button>
                          <button className={s.sendFb} onClick={() => { setShowFeedback(null); setFeedback('') }} disabled={!feedback.trim()}>
                            Regenerate with feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tests ready */}
                {msg.type === 'tests_ready' && (
                  <div className={s.artifact}>
                    <div className={s.artifactHeader}>
                      <span className={s.artifactIcon}>🧪</span>
                      <span>{session.testCases.length} Test Cases Generated</span>
                      <span className={s.tcStats}>
                        {session.testCases.filter(t => t.status === 'approved').length} ✓ ·{' '}
                        {session.testCases.filter(t => t.status === 'pending').length} pending ·{' '}
                        {session.testCases.filter(t => t.status === 'rejected').length} ✗
                      </span>
                    </div>
                    <div className={s.tcList}>
                      {session.testCases.map(tc => (
                        <div key={tc.id} className={`${s.tcCard} ${s[tc.status]}`}>
                          <div className={s.tcHeader} onClick={() => toggleTC(tc.id)}>
                            <span className={s.tcPri} data-p={tc.priority}>{tc.priority}</span>
                            <span className={s.tcCat}>{tc.scenario_category}</span>
                            <span className={s.tcTitle}>{tc.title}</span>
                            <span className={`${s.tcDot} ${s[tc.status]}`} />
                            {expanded.has(tc.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </div>
                          {expanded.has(tc.id) && (
                            <div className={s.tcBody}>
                              {tc.preconditions?.length > 0 && (
                                <div className={s.tcSec}>
                                  <div className={s.tcSecLabel}>Preconditions</div>
                                  {tc.preconditions.map((p, i) => <div key={i} className={s.tcPrecond}>• {p}</div>)}
                                </div>
                              )}
                              <div className={s.gherkin}>
                                {tc.gherkin_steps?.map((step, i) => (
                                  <div key={i} className={s.step}>
                                    <span className={s.kw} data-kw={step.keyword}>{step.keyword}</span>
                                    <span className={s.stepText}>{step.text}</span>
                                  </div>
                                ))}
                              </div>
                              {tc.edge_notes?.length > 0 && (
                                <div className={s.tcSec}>
                                  <div className={s.tcSecLabel}>Edge Notes</div>
                                  {tc.edge_notes.map((n, i) => <div key={i} className={s.edgeNote}>⚠ {n}</div>)}
                                </div>
                              )}
                              {tc.risks?.length > 0 && (
                                <div className={s.risksBox}>
                                  {tc.risks.map((r, i) => (
                                    <div key={i} className={s.riskRow}>
                                      <span className={s.riskSev} data-sev={r.severity}>{r.severity}</span>
                                      <span className={s.riskDesc}>{r.description}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {tc.tags?.length > 0 && (
                                <div className={s.tags}>
                                  {tc.tags.map((t, i) => <span key={i} className={s.tag}>{t}</span>)}
                                </div>
                              )}
                              {rejectingId === tc.id && (
                                <div className={s.rejectForm}>
                                  <input className={s.rejectInput} placeholder="Rejection reason…"
                                    value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus />
                                  <button className={s.rejectConfirm} onClick={() => handleReject(tc.id)}>Confirm</button>
                                  <button className={s.rejectCancel} onClick={() => setRejectingId(null)}>Cancel</button>
                                </div>
                              )}
                              {tc.status !== 'approved' && (
                                <div className={s.tcActions}>
                                  <button className={s.tcBtn} onClick={() => handleRegen(tc)} disabled={busy === tc.id}>
                                    <RefreshCw size={11} /> Regen
                                  </button>
                                  <button className={`${s.tcBtn} ${s.tcReject}`} onClick={() => setRejectingId(tc.id)} disabled={busy === tc.id}>
                                    <X size={11} /> Reject
                                  </button>
                                  <button className={`${s.tcBtn} ${s.tcApprove}`} onClick={() => handleApprove(tc.id)} disabled={busy === tc.id}>
                                    <Check size={11} /> Approve
                                  </button>
                                </div>
                              )}
                              {tc.status === 'approved' && (
                                <div className={s.approvedBadge}><Check size={11} /> Approved</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {loading && !session.messages.some(m => m.type === 'progress') && (
          <div className={s.aiRow}>
            <div className={s.aiAvatar}>⚡</div>
            <div className={s.progressMsg}><div className={s.progressSpinner} /><span>{loadingMsg || 'Processing…'}</span></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  )
}

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}