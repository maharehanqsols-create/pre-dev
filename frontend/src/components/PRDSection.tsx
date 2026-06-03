import { useState } from 'react'
import { Check, X, RefreshCw, Edit3, Eye } from 'lucide-react'
import type { PRD, LLMConfig } from '../api'
import { updatePRD, approvePRD, dropPRD, regeneratePRD } from '../api'
import s from './PRDSection.module.css'

interface Props {
  prd: PRD
  config: LLMConfig
  userStory: string
  onApproved: (prd: PRD) => void
  onUpdated: (prd: PRD) => void
}

export default function PRDSection({ prd, config, userStory, onApproved, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(prd.content)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const run = async (label: string, fn: () => Promise<PRD>, approve = false) => {
    setLoading(label)
    setError('')
    try {
      const result = await fn()
      onUpdated(result)
      setEditContent(result.content)
      if (approve) onApproved(result)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  const saveEdit = async () => {
    setEditing(false)
    await run('save', () => updatePRD(prd.id, editContent))
  }

  // Simple but reliable markdown renderer
  const renderContent = (text: string) => {
    if (!text || !text.trim()) {
      return <p className={s.empty}>No content generated. Try regenerating the PRD.</p>
    }

    return text.split('\n').map((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) return <div key={i} className={s.spacer} />
      if (trimmed === '---') return <hr key={i} className={s.hr} />
      if (trimmed.startsWith('# ')) return <h1 key={i} className={s.h1}>{trimmed.slice(2)}</h1>
      if (trimmed.startsWith('## ')) return <h2 key={i} className={s.h2}>{trimmed.slice(3)}</h2>
      if (trimmed.startsWith('### ')) return <h3 key={i} className={s.h3}>{trimmed.slice(4)}</h3>
      if (trimmed.startsWith('#### ')) return <h3 key={i} className={s.h3}>{trimmed.slice(5)}</h3>
      if (trimmed.startsWith('|')) return <div key={i} className={s.tableRow}>{trimmed}</div>
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return <div key={i} className={s.bullet}>• {trimmed.slice(2)}</div>
      }
      if (/^\d+\./.test(trimmed)) {
        return <div key={i} className={s.numbered}>{trimmed}</div>
      }
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        return <p key={i} className={s.bold}>{trimmed.replace(/\*\*/g, '')}</p>
      }
      return <p key={i} className={s.para}>{trimmed}</p>
    })
  }

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>PRD Review</h2>
          <p className={s.sub}>Review and edit the generated PRD before proceeding</p>
        </div>
        <div className={s.statusBadge} data-status={prd.status}>{prd.status}</div>
      </div>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.storyBox}>
        <span className={s.storyLabel}>User Story</span>
        <p>{userStory}</p>
      </div>

      {/* Debug: show content length */}
      {!prd.content?.trim() && (
        <div className={s.warning}>
          ⚠️ PRD content is empty. The model may have returned nothing. Try regenerating.
        </div>
      )}

      <div className={s.prdBox}>
        <div className={s.prdToolbar}>
          <span className={s.prdId}>PRD #{prd.id} · {prd.content?.length || 0} chars</span>
          <button
            className={s.iconBtn}
            onClick={() => { setEditing(!editing); setEditContent(prd.content) }}
          >
            {editing ? <><Eye size={14} /> Preview</> : <><Edit3 size={14} /> Edit</>}
          </button>
        </div>

        {editing ? (
          <div className={s.editWrap}>
            <textarea
              className={s.editArea}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
            />
            <button className={s.saveEditBtn} onClick={saveEdit}>
              Save changes
            </button>
          </div>
        ) : (
          <div className={s.prdContent}>
            {renderContent(prd.content || '')}
          </div>
        )}
      </div>

      <div className={s.actions}>
        <button
          className={s.regenBtn}
          onClick={() => run('regen', () => regeneratePRD(prd.id, userStory, config))}
          disabled={!!loading}
        >
          <RefreshCw size={14} className={loading === 'regen' ? s.spinning : ''} />
          {loading === 'regen' ? 'Regenerating...' : 'Regenerate'}
        </button>

        <div className={s.rightActions}>
          <button
            className={s.dropBtn}
            onClick={() => run('drop', () => dropPRD(prd.id))}
            disabled={!!loading}
          >
            <X size={14} /> Drop
          </button>
          <button
            className={s.approveBtn}
            onClick={() => run('approve', () => approvePRD(prd.id), true)}
            disabled={!!loading}
          >
            {loading === 'approve' ? <span className={s.spinner} /> : <Check size={14} />}
            Approve & Generate Tests
          </button>
        </div>
      </div>
    </div>
  )
}