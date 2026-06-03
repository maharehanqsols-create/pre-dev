import { useState } from 'react'
import { Check, X, RefreshCw, ChevronDown, ChevronUp, FileText, TestTube } from 'lucide-react'
import type { Message, TCRecord } from '../../store/session'
import s from './ChatMessage.module.css'

interface Props {
  msg: Message
  onApprovePRD?: () => void
  onRegenPRD?: (feedback?: string) => void
  onGenerateTests?: () => void
  onApproveTC?: (id: number) => void
  onRejectTC?: (id: number, reason: string) => void
  onRegenTC?: (tc: TCRecord) => void
  testCases?: TCRecord[]
  prdContent?: string
}

export default function ChatMessage({
  msg, onApprovePRD, onRegenPRD, onGenerateTests,
  onApproveTC, onRejectTC, onRegenTC, testCases
}: Props) {
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0, 1]))
  const [loadingTc, setLoadingTc] = useState<number | null>(null)

  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const isUser = msg.role === 'user'

  const toggleTC = (idx: number) => {
    setExpanded(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  const handleRegenWithFeedback = () => {
    onRegenPRD?.(feedback)
    setFeedback('')
    setShowFeedback(false)
  }

  const handleRejectTC = async (id: number) => {
    if (!rejectReason.trim()) return
    setLoadingTc(id)
    await onRejectTC?.(id, rejectReason)
    setRejectingId(null)
    setRejectReason('')
    setLoadingTc(null)
  }

  const handleApproveTC = async (id: number) => {
    setLoadingTc(id)
    await onApproveTC?.(id)
    setLoadingTc(null)
  }

  const handleRegenTC = async (tc: TCRecord) => {
    setLoadingTc(tc.id)
    await onRegenTC?.(tc)
    setLoadingTc(null)
  }

  if (isUser) {
    return (
      <div className={s.userWrap}>
        <div className={s.userMeta}>{time}</div>
        <div className={s.userBubble}>{msg.content}</div>
      </div>
    )
  }

  return (
    <div className={s.aiBubbleWrap}>
      <div className={s.aiAvatar}>AI</div>
      <div className={s.aiContent}>
        <div className={s.aiMeta}>AI Assistant · {time}</div>

        {/* Plain text message */}
        {msg.type === 'text' && (
          <div className={s.aiText}>{msg.content}</div>
        )}

        {/* Status message */}
        {msg.type === 'status' && (
          <div className={s.statusMsg}>
            <span className={s.statusDot} />
            {msg.content}
          </div>
        )}

        {/* PRD ready / updated */}
        {(msg.type === 'prd_ready' || msg.type === 'prd_updated') && (
          <div className={s.artifact}>
            <div className={s.artifactHeader}>
              <FileText size={13} />
              <span>{msg.type === 'prd_updated' ? 'PRD updated' : 'PRD generated'}</span>
              {msg.prdVersion && <span className={s.versionBadge}>v{msg.prdVersion}</span>}
            </div>
            <p className={s.artifactDesc}>{msg.content}</p>

            {msg.type === 'prd_updated' && (
              <div className={s.changeList}>
                <span className={s.changeLabel}>Changes applied</span>
              </div>
            )}

            {/* HITL actions */}
            <div className={s.hitlRow}>
              <button className={`${s.hitlBtn} ${s.approve}`} onClick={onApprovePRD}>
                <Check size={12} /> Approve PRD
              </button>
              <button className={`${s.hitlBtn} ${s.regen}`} onClick={() => setShowFeedback(!showFeedback)}>
                <RefreshCw size={12} /> Regenerate
              </button>
              <button className={`${s.hitlBtn}`} onClick={onGenerateTests}>
                <TestTube size={12} /> Generate Tests
              </button>
            </div>

            {showFeedback && (
              <div className={s.feedbackBox}>
                <textarea
                  className={s.feedbackInput}
                  placeholder="Describe what to change… e.g. 'Add rate limiting, include OTP flow'"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  rows={2}
                  autoFocus
                />
                <div className={s.feedbackActions}>
                  <button className={s.cancelBtn} onClick={() => setShowFeedback(false)}>Cancel</button>
                  <button className={s.sendFeedbackBtn} onClick={handleRegenWithFeedback} disabled={!feedback.trim()}>
                    Regenerate with feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test cases ready */}
        {msg.type === 'tests_ready' && testCases && (
          <div className={s.artifact}>
            <div className={s.artifactHeader}>
              <TestTube size={13} />
              <span>{testCases.length} test cases generated</span>
              <span className={s.tcStats}>
                {testCases.filter(t => t.status === 'approved').length} approved ·{' '}
                {testCases.filter(t => t.status === 'pending').length} pending ·{' '}
                {testCases.filter(t => t.status === 'rejected').length} rejected
              </span>
            </div>

            <div className={s.tcList}>
              {testCases.map((tc, idx) => (
                <div key={tc.id} className={`${s.tcCard} ${s[tc.status]}`}>
                  <div className={s.tcHeader} onClick={() => toggleTC(idx)}>
                    <div className={s.tcLeft}>
                      <span className={s.tcPriority} data-p={tc.priority}>{tc.priority}</span>
                      <span className={s.tcCat}>{tc.scenario_category}</span>
                      <span className={s.tcTitle}>{tc.title}</span>
                    </div>
                    <div className={s.tcRight}>
                      <span className={`${s.tcStatus} ${s[tc.status]}`} />
                      {expanded.has(idx) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  </div>

                  {expanded.has(idx) && (
                    <div className={s.tcBody}>
                      {tc.preconditions?.length > 0 && (
                        <div className={s.tcSection}>
                          <div className={s.tcSectionLabel}>Preconditions</div>
                          {tc.preconditions.map((p, i) => <div key={i} className={s.tcPrecond}>• {p}</div>)}
                        </div>
                      )}
                      <div className={s.gherkin}>
                        {tc.gherkin_steps?.map((step, i) => (
                          <div key={i} className={s.gherkinStep}>
                            <span className={s.kw} data-kw={step.keyword}>{step.keyword}</span>
                            <span className={s.stepText}>{step.text}</span>
                          </div>
                        ))}
                      </div>
                      {tc.tags?.length > 0 && (
                        <div className={s.tags}>
                          {tc.tags.map(t => <span key={t} className={s.tag}>{t}</span>)}
                        </div>
                      )}

                      {rejectingId === tc.id && (
                        <div className={s.rejectForm}>
                          <input
                            className={s.rejectInput}
                            placeholder="Reason for rejection..."
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            autoFocus
                          />
                          <button className={s.rejectConfirm} onClick={() => handleRejectTC(tc.id)}>Confirm</button>
                          <button className={s.rejectCancel} onClick={() => setRejectingId(null)}>Cancel</button>
                        </div>
                      )}

                      {tc.status !== 'approved' && (
                        <div className={s.tcActions}>
                          <button className={s.tcBtn} onClick={() => handleRegenTC(tc)} disabled={loadingTc === tc.id}>
                            <RefreshCw size={11} className={loadingTc === tc.id ? s.spin : ''} /> Regen
                          </button>
                          <button className={`${s.tcBtn} ${s.rejectBtn}`} onClick={() => { setRejectingId(tc.id); setRejectReason('') }} disabled={loadingTc === tc.id}>
                            <X size={11} /> Reject
                          </button>
                          <button className={`${s.tcBtn} ${s.approveBtn}`} onClick={() => handleApproveTC(tc.id)} disabled={loadingTc === tc.id}>
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
}