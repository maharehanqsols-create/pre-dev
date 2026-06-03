import { CheckCircle, RefreshCw, Download, Copy } from 'lucide-react'
import type { Session } from '../../store/session'
import s from './PRDPanel.module.css'

interface Props {
  session: Session
  currentPRD: any
  onApprove: () => void
  onRegenerate: () => void
  loading: boolean
}

export default function PRDPanel({
  session,
  currentPRD,
  onApprove,
  onRegenerate,
  loading,
}: Props) {
  if (!currentPRD) {
    return (
      <div className={s.empty}>
        <p>Generate a PRD to see it here</p>
      </div>
    )
  }

  const getStatus = () => {
    if (session.stage === 'prd_approved') return 'approved'
    return 'draft'
  }

  const status = getStatus()

  return (
    <div className={s.prdPanel}>
      <div className={s.header}>
        <div className={s.info}>
          <h3 className={s.title}>{currentPRD.label}</h3>
          <span className={`${s.badge} ${s[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <div className={s.actions}>
          <button
            className={s.iconBtn}
            title="Copy"
            onClick={() => {
              navigator.clipboard.writeText(currentPRD.content)
            }}
          >
            <Copy size={16} />
          </button>
          <button
            className={s.iconBtn}
            title="Download"
            onClick={() => {
              const element = document.createElement('a')
              element.setAttribute(
                'href',
                'data:text/plain;charset=utf-8,' + encodeURIComponent(currentPRD.content)
              )
              element.setAttribute('download', `${currentPRD.label}.md`)
              element.style.display = 'none'
              document.body.appendChild(element)
              element.click()
              document.body.removeChild(element)
            }}
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className={s.content}>
        <div className={s.markdown}>
          {currentPRD.content.split('\n').map((line: string, i: number) => {
            if (line.startsWith('# ')) {
              return (
                <h2 key={i} className={s.h2}>
                  {line.slice(2)}
                </h2>
              )
            }
            if (line.startsWith('## ')) {
              return (
                <h3 key={i} className={s.h3}>
                  {line.slice(3)}
                </h3>
              )
            }
            if (line.startsWith('- ')) {
              return (
                <li key={i} className={s.li}>
                  {line.slice(2)}
                </li>
              )
            }
            if (line.startsWith('| ')) {
              return (
                <code key={i} className={s.code}>
                  {line}
                </code>
              )
            }
            if (line.trim()) {
              return (
                <p key={i} className={s.p}>
                  {line}
                </p>
              )
            }
            return null
          })}
        </div>
      </div>

      <div className={s.versionHistory}>
        <p className={s.historyLabel}>Version History</p>
        <div className={s.versions}>
          {session.prdVersions.map((prd, i) => (
            <div key={i} className={`${s.version} ${prd.prdId === currentPRD.prdId ? s.active : ''}`}>
              <span className={s.versionLabel}>{prd.label}</span>
              <span className={s.versionDate}>
                {new Date(prd.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {session.stage === 'prd_generated' && (
        <div className={s.footer}>
          <button className={`${s.btn} ${s.primary}`} onClick={onApprove} disabled={loading}>
            <CheckCircle size={16} />
            Approve PRD
          </button>
          <button className={`${s.btn} ${s.secondary}`} onClick={onRegenerate} disabled={loading}>
            <RefreshCw size={16} />
            Regenerate
          </button>
        </div>
      )}
    </div>
  )
}
