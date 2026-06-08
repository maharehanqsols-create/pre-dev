import { CheckCircle, RefreshCw, Download, Copy, TestTube, Layers } from 'lucide-react'
import { useState } from 'react'
import type { Session, PRDVersion } from '../../store/session'
import s from './PRDPanel.module.css'

interface Props {
  session: Session
  currentPRD?: PRDVersion
  onApprove: () => void
  onGenerateTests: () => void
  loading: boolean
}

export default function PRDPanel({ session, currentPRD, onApprove, onGenerateTests, loading }: Props) {
  const [copied, setCopied] = useState(false)

  if (!currentPRD) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>📄</div>
        <p>Generate a PRD to see it here</p>
        <span>Type a user story in the chat</span>
      </div>
    )
  }

  const isApproved = session.stage === 'prd_approved' || session.stage === 'tests_generating' || session.stage === 'tests_generated'

  const copy = () => {
    navigator.clipboard.writeText(currentPRD.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(currentPRD.content)
    a.download = `${currentPRD.label}.md`
    a.click()
  }

  return (
    <div className={s.panel}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.label}>{currentPRD.label}</span>
          <span className={`${s.badge} ${isApproved ? s.approved : s.draft}`}>
            {isApproved ? '✓ Approved' : 'Draft'}
          </span>
          {currentPRD.isComplex && (
            <span className={s.modulesBadge}>
              <Layers size={10} /> {currentPRD.modules.length} modules
            </span>
          )}
        </div>
        <div className={s.headerActions}>
          <button className={s.iconBtn} onClick={copy} title="Copy">
            {copied ? '✓' : <Copy size={13} />}
          </button>
          <button className={s.iconBtn} onClick={download} title="Download">
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Modules list if complex */}
      {currentPRD.isComplex && currentPRD.modules.length > 0 && (
        <div className={s.modulesList}>
          {currentPRD.modules.map(m => (
            <span key={m} className={s.moduleChip}>{m}</span>
          ))}
        </div>
      )}

      {/* PRD Content */}
      <div className={s.content}>
        <MarkdownRenderer content={currentPRD.content} />
      </div>

      {/* Version History */}
      {session.prdVersions.length > 1 && (
        <div className={s.versions}>
          <p className={s.versionsLabel}>Version History</p>
          {session.prdVersions.map((v, i) => (
            <div key={i} className={`${s.version} ${v.prdId === currentPRD.prdId ? s.activeVersion : ''}`}>
              <span className={s.versionLabel}>{v.label}</span>
              <span className={s.versionDate}>{new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer actions */}
      {!isApproved && (
        <div className={s.footer}>
          <button className={s.approveBtn} onClick={onApprove} disabled={loading}>
            <CheckCircle size={14} /> Approve PRD
          </button>
          <button className={s.genTestsBtn} onClick={onGenerateTests} disabled={loading}>
            <TestTube size={14} /> Generate Tests
          </button>
        </div>
      )}
      {isApproved && (
        <div className={s.footer}>
          <button className={s.genTestsBtn} onClick={onGenerateTests} disabled={loading} style={{ flex: 1 }}>
            <TestTube size={14} /> {session.stage === 'tests_generated' ? 'Regenerate Tests' : 'Generate Tests'}
          </button>
        </div>
      )}
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className={s.markdown}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('# '))   return <h1 key={i} className={s.h1}>{line.slice(2)}</h1>
        if (line.startsWith('## '))  return <h2 key={i} className={s.h2}>{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className={s.h3}>{line.slice(4)}</h3>
        if (line.startsWith('#### '))return <h4 key={i} className={s.h4}>{line.slice(5)}</h4>
        if (line.startsWith('| '))   return <div key={i} className={s.table}>{line}</div>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <div key={i} className={s.li}>• {line.slice(2)}</div>
        if (/^\d+\. /.test(line))    return <div key={i} className={s.li}>{line}</div>
        if (line.startsWith('---'))  return <hr key={i} className={s.hr} />
        if (line.trim() === '')      return <div key={i} className={s.spacer} />
        return <p key={i} className={s.p}>{line}</p>
      })}
    </div>
  )
}