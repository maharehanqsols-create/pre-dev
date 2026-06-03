import { CheckCircle, RefreshCw } from 'lucide-react'
import type { Session } from '../../store/session'
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
  onRegenTC: (tc: any) => void
}

export default function ChatPanel({
  session,
  loading,
  loadingMsg,
  chatEndRef,
  onApprovePRD,
  onGenerateTests,
}: Props) {
  return (
    <div className={s.chatPanel}>
      <div className={s.messages}>
        {session.messages.map((msg, i) => (
          <div key={i} className={`${s.message} ${s[msg.role]}`}>
            {msg.role === 'assistant' && (
              <div className={s.avatar}>
                <span>⚡</span>
              </div>
            )}
            <div className={s.bubble}>
              <p className={s.content}>{msg.content}</p>
              {msg.type === 'prd_ready' && (
                <div className={s.actions}>
                  <button
                    className={`${s.btn} ${s.primary}`}
                    onClick={onApprovePRD}
                    disabled={loading}
                  >
                    <CheckCircle size={14} />
                    Approve PRD
                  </button>
                  <button
                    className={`${s.btn} ${s.secondary}`}
                    disabled={loading}
                  >
                    <RefreshCw size={14} />
                    Regenerate
                  </button>
                  <button
                    className={`${s.btn} ${s.secondary}`}
                    onClick={onGenerateTests}
                    disabled={loading}
                  >
                    Generate Tests
                  </button>
                </div>
              )}
              <span className={s.time}>
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
        {loading && (
          <div className={`${s.message} ${s.assistant}`}>
            <div className={s.avatar}>
              <span>⚡</span>
            </div>
            <div className={s.bubble}>
              <div className={s.loading}>
                <div className={s.spinner}></div>
                <p>{loadingMsg}</p>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  )
}
