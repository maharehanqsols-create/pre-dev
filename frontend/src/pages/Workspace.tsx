import { useState, useRef, useEffect } from 'react'
import { Plus, Settings, Trash2, Send, Loader, FileText, TestTube, Menu, X, Zap } from 'lucide-react'
import { useStore, type Session, type TCRecord } from '../store/session'
import {
  streamGeneratePRD, streamGenerateTests,
  regeneratePRD, approvePRD,
  approveTest, rejectTest, regenerateTest,
  type ProgressEvent,
} from '../api/client'
import ChatPanel from '../components/chat/ChatPanel'
import PRDPanel from '../components/prd/PRDPanel'
import TestCasePanel from '../components/testcases/TestCasePanel'
import ConfigModal from '../components/ConfigModal'
import s from './Workspace.module.css'

type RightTab = 'prd' | 'testcases'

export default function Workspace() {
  const {
    sessions, activeSessionId, config, configOpen, setConfigOpen,
    createSession, setActiveSession, deleteSession,
    addMessage, updateLastMessage, updateSession, addPRDVersion, updateTC, getActiveSession,
  } = useStore()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [rightTab, setRightTab] = useState<RightTab>('prd')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const session = getActiveSession()

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages.length, loading])

  const currentPRD = session?.prdVersions.at(-1)

  const exampleStories = [
    { icon: '🔐', title: 'Password Reset', story: 'As a registered user, I want to reset my password via email OTP so that I can regain access to my account when I forget my password. The system should send a 6-digit OTP, expire it in 10 minutes, and lock the account after 3 failed attempts.' },
    { icon: '👥', title: 'User Registration', story: 'As a new visitor, I want to create an account with email verification so that I can access the platform. Include email uniqueness check, password strength validation, and a welcome email after successful registration.' },
    { icon: '💳', title: 'Checkout Flow', story: 'As a logged-in buyer, I want to checkout with my saved payment method and address so that I can complete my purchase faster. Support coupon codes, show order summary, handle payment failures, and send order confirmation email.' },
    { icon: '🔔', title: 'Notifications', story: 'As a user, I want to manage my notification preferences for email, SMS, and push notifications so that I only receive alerts I care about. Include per-channel toggles, frequency settings, and quiet hours.' },
  ]

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')

    if (!session) {
      const sess = createSession(text)
      await doGeneratePRD(sess, text)
    } else if (session.stage === 'idle') {
      addMessage(session.id, { role: 'user', content: text, type: 'text' })
      await doGeneratePRD(session, text)
    } else {
      addMessage(session.id, { role: 'user', content: text, type: 'text' })
      if (session.currentPrdId) {
        await doRegenPRD(session, text, session.currentPrdId)
      }
    }
  }

  // ── Streaming PRD generation ──────────────────────────────────

  const doGeneratePRD = async (sess: Session, story: string) => {
    setLoading(true)
    updateSession(sess.id, { stage: 'prd_generating' })

    // Add progress placeholder message
    addMessage(sess.id, {
      role: 'assistant',
      content: '⏳ Analyzing your user story…',
      type: 'progress',
    })

    try {
      const result = await streamGeneratePRD(
        story,
        config,
        (evt: ProgressEvent) => {
          setLoadingMsg(evt.message)
          updateLastMessage(sess.id, `⏳ ${evt.message}`)
        },
      )

      // Remove progress message, add real PRD message
      addMessage(sess.id, {
        role: 'assistant',
        content: result.is_complex
          ? `PRD generated across ${result.modules.length} modules: ${result.modules.join(', ')}. Review and approve to generate test cases.`
          : 'PRD generated. Review it on the right panel, give feedback here, or approve to generate test cases.',
        type: 'prd_ready',
        prdId: result.id,
        prdVersion: 1,
      })

      addPRDVersion(sess.id, {
        prdId: result.id,
        content: result.content,
        label: 'PRD v1',
        modules: result.modules,
        isComplex: result.is_complex,
        createdAt: result.created_at,
      })

      updateSession(sess.id, {
        stage: 'prd_generated',
        currentPrdId: result.id,
      })

      setRightTab('prd')
    } catch (e: any) {
      addMessage(sess.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
      updateSession(sess.id, { stage: 'idle' })
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const doRegenPRD = async (sess: Session, feedback: string, prdId: number) => {
    setLoading(true)
    addMessage(sess.id, { role: 'assistant', content: '⏳ Regenerating PRD with your feedback…', type: 'progress' })

    try {
      const story = sess.userStory || sess.messages.find(m => m.role === 'user')?.content || ''
      const prd = await regeneratePRD(prdId, `${story}\n\nFeedback: ${feedback}`, config)
      const version = sess.prdVersions.length + 1

      addPRDVersion(sess.id, {
        prdId: prd.id,
        content: prd.content,
        label: `PRD v${version}`,
        modules: prd.modules,
        isComplex: prd.is_complex,
        createdAt: prd.created_at,
      })

      updateSession(sess.id, { currentPrdId: prd.id, stage: 'prd_generated' })

      addMessage(sess.id, {
        role: 'assistant',
        content: `PRD updated to v${version} based on your feedback.`,
        type: 'prd_updated',
        prdId: prd.id,
        prdVersion: version,
      })

      setRightTab('prd')
    } catch (e: any) {
      addMessage(sess.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
    } finally {
      setLoading(false)
    }
  }

  // ── PRD Approve ───────────────────────────────────────────────

  const handleApprovePRD = async () => {
    if (!session?.currentPrdId) return
    setLoading(true)
    try {
      await approvePRD(session.currentPrdId)
      updateSession(session.id, { stage: 'prd_approved' })
      addMessage(session.id, {
        role: 'assistant',
        content: '✓ PRD approved! Click "Generate Tests" or type feedback to improve it further.',
        type: 'status',
      })
    } catch (e: any) {
      addMessage(session.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
    } finally {
      setLoading(false)
    }
  }

  // ── Streaming test generation ─────────────────────────────────

  const handleGenerateTests = async () => {
    if (!session?.currentPrdId) return
    setLoading(true)
    updateSession(session.id, { stage: 'tests_generating' })

    addMessage(session.id, {
      role: 'assistant',
      content: '⏳ Starting test generation pipeline…',
      type: 'progress',
    })

    try {
      // Auto-approve PRD if not already approved
      if (session.stage !== 'prd_approved' && session.stage !== 'tests_generated') {
        await approvePRD(session.currentPrdId)
        updateSession(session.id, { stage: 'prd_approved' })
      }

      const result = await streamGenerateTests(
        session.currentPrdId,
        config,
        (evt: ProgressEvent) => {
          setLoadingMsg(evt.message)
          updateLastMessage(session.id, `⏳ ${evt.message}`)
        },
      )

      const mapped: TCRecord[] = result.test_cases.map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        category: t.scenario_category,
        status: t.status,
        tags: t.tags,
        preconditions: t.preconditions,
        gherkin_steps: t.gherkin_steps,
        risks: t.risks,
        edge_notes: t.edge_notes || [],
        limitations: t.limitations,
        scenario_id: t.scenario_id,
        scenario_title: t.scenario_title,
        scenario_category: t.scenario_category,
        reject_reason: t.reject_reason,
      }))

      updateSession(session.id, { stage: 'tests_generated', testCases: mapped })

      addMessage(session.id, {
        role: 'assistant',
        content: `✓ ${mapped.length} test cases generated — review them in the panel on the right.`,
        type: 'tests_ready',
        tcIds: mapped.map(t => t.id),
      })

      setRightTab('testcases')
    } catch (e: any) {
      addMessage(session.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
      updateSession(session.id, { stage: 'prd_approved' })
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  // ── TC actions ────────────────────────────────────────────────

  const handleApproveTC = async (id: number) => {
    if (!session) return
    await approveTest(id)
    const tc = session.testCases.find(t => t.id === id)
    if (tc) updateTC(session.id, { ...tc, status: 'approved' })
  }

  const handleRejectTC = async (id: number, reason: string) => {
    if (!session) return
    await rejectTest(id, reason)
    const tc = session.testCases.find(t => t.id === id)
    if (tc) updateTC(session.id, { ...tc, status: 'rejected', reject_reason: reason })
  }

  const handleRegenTC = async (tc: TCRecord) => {
    if (!session || !currentPRD) return
    const updated = await regenerateTest(tc.id, config, tc, currentPRD.content)
    updateTC(session.id, {
      ...tc,
      title: updated.title,
      priority: updated.priority,
      tags: updated.tags,
      preconditions: updated.preconditions,
      gherkin_steps: updated.gherkin_steps,
      risks: updated.risks,
      edge_notes: updated.edge_notes || [],
      status: 'pending',
      reject_reason: undefined,
    })
  }

  return (
    <div className={s.workspaceContainer}>

      {/* ── Left Sidebar ── */}
      <aside className={`${s.sidebar} ${sidebarOpen ? s.open : s.closed}`}>
        <div className={s.sidebarHeader}>
          <div className={s.logo}>
            <Zap size={20} className={s.logoIcon} />
            <span className={s.logoText}>QA Pipeline</span>
          </div>
          <button className={s.toggleBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        <div className={s.sessionControls}>
          <button className={s.newSessionBtn} onClick={() => { createSession('New Session'); setInput('') }}>
            <Plus size={16} /><span>New Session</span>
          </button>
          <button className={s.settingsBtn} onClick={() => setConfigOpen(!configOpen)}>
            <Settings size={16} /><span>Settings</span>
          </button>
        </div>

        <div className={s.sessionList}>
          <p className={s.sessionListLabel}>Sessions</p>
          {sessions.length === 0
            ? <div className={s.emptyState}>No sessions yet</div>
            : sessions.map(sess => (
              <div
                key={sess.id}
                className={`${s.sessionCard} ${sess.id === activeSessionId ? s.active : ''}`}
                onClick={() => setActiveSession(sess.id)}
              >
                <div className={s.sessionInfo}>
                  <p className={s.sessionName}>{sess.userStory || 'Untitled'}</p>
                  <span className={`${s.stageBadge} ${s[`stage_${sess.stage}`]}`}>
                    {sess.stage.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  className={s.deleteBtn}
                  onClick={e => { e.stopPropagation(); deleteSession(sess.id) }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          }
        </div>

        <div className={s.sidebarFooter}>
          <button className={s.configFooterBtn} onClick={() => setConfigOpen(true)}>
            <Settings size={14} />
            <span>{config.provider} / {config.model?.split('/').pop()}</span>
          </button>
        </div>
      </aside>

      {/* ── Center Chat ── */}
      <main className={s.mainPanel}>
        {!session ? (
          <div className={s.emptyMain}>
            <div className={s.emptyHeader}>
              <div className={s.emptyIcon}>⚡</div>
              <h2 className={s.emptyTitle}>QA Intelligence Pipeline</h2>
              <p className={s.emptySubtitle}>Transform user stories into production-ready test assets with streaming AI</p>
            </div>
            <div className={s.examplesGrid}>
              {exampleStories.map((ex, i) => (
                <button key={i} className={s.exampleCard} onClick={() => setInput(ex.story)}>
                  <span className={s.exampleIcon}>{ex.icon}</span>
                  <p className={s.exampleTitle}>{ex.title}</p>
                  <p className={s.exampleText}>{ex.story.slice(0, 80)}…</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ChatPanel
            session={session}
            loading={loading}
            loadingMsg={loadingMsg}
            chatEndRef={chatEndRef}
            onApprovePRD={handleApprovePRD}
            onGenerateTests={handleGenerateTests}
            onApproveTC={handleApproveTC}
            onRejectTC={handleRejectTC}
            onRegenTC={handleRegenTC}
          />
        )}

        <div className={s.inputArea}>
          <div className={s.inputWrapper}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={session ? 'Add feedback or request changes… (Enter to send, Shift+Enter for newline)' : 'Describe a user story in detail…'}
              className={s.input}
              disabled={loading}
              rows={2}
            />
            <button
              className={`${s.sendBtn} ${loading ? s.loading : ''}`}
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              {loading ? <Loader size={16} className={s.spinning} /> : <Send size={16} />}
            </button>
          </div>
          {loadingMsg && (
            <div className={s.progressBar}>
              <div className={s.progressDot} />
              <p className={s.loadingMsg}>{loadingMsg}</p>
            </div>
          )}
        </div>
      </main>

      {/* ── Right Panel ── */}
      <aside className={s.artifactPanel}>
        <div className={s.panelTabs}>
          <button
            className={`${s.tab} ${rightTab === 'prd' ? s.active : ''}`}
            onClick={() => setRightTab('prd')}
          >
            <FileText size={14} /><span>PRD</span>
            {session?.prdVersions.length ? (
              <span className={s.tabBadge}>{session.prdVersions.length}</span>
            ) : null}
          </button>
          <button
            className={`${s.tab} ${rightTab === 'testcases' ? s.active : ''}`}
            onClick={() => setRightTab('testcases')}
          >
            <TestTube size={14} /><span>Test Cases</span>
            {session?.testCases.length ? (
              <span className={s.tabBadge}>{session.testCases.length}</span>
            ) : null}
          </button>
        </div>

        <div className={s.panelContent}>
          {rightTab === 'prd' && session
            ? <PRDPanel session={session} currentPRD={currentPRD} onApprove={handleApprovePRD} onGenerateTests={handleGenerateTests} loading={loading} />
            : rightTab === 'testcases' && session
            ? <TestCasePanel testCases={session.testCases} onApprove={handleApproveTC} onReject={handleRejectTC} onRegenerate={handleRegenTC} loading={loading} />
            : <div className={s.panelEmpty}><p>Start a session to see artifacts</p></div>
          }
        </div>
      </aside>

      {configOpen && <ConfigModal />}
    </div>
  )
}