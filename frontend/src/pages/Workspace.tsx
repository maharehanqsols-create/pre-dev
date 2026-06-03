import { useState, useRef, useEffect } from 'react'
import { Plus, Settings, Trash2, Send, Loader, FileText, TestTube, Menu, X, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore, type Session, type TCRecord } from '../store/session'
import { generatePRD, regeneratePRD, approvePRD, generateTests, approveTest, rejectTest, regenerateTest } from '../api/client'
import ChatPanel from '../components/chat/ChatPanel'
import PRDPanel from '../components/prd/PRDPanel'
import TestCasePanel from '../components/testcases/TestCasePanel'
import ConfigModal from '../components/ConfigModal'
import s from './Workspace.module.css'

type RightTab = 'prd' | 'testcases'

export default function Workspace() {
  const nav = useNavigate()
  const { sessions, activeSessionId, config, configOpen, setConfigOpen,
    createSession, setActiveSession, deleteSession,
    addMessage, updateSession, addPRDVersion, updateTC, getActiveSession } = useStore()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [rightTab, setRightTab] = useState<RightTab>('prd')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const session = getActiveSession()

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [session?.messages.length, loading])

  const currentPRD = session?.prdVersions.at(-1)

  // Example user stories
  const exampleStories = [
    { icon: '🔐', title: 'Password Reset', story: 'As a user, I want to reset my password so I can regain access to my account' },
    { icon: '👥', title: 'User Registration', story: 'As a new user, I want to create an account so I can access the platform' },
    { icon: '💳', title: 'Checkout Flow', story: 'As a buyer, I want to checkout with my saved payment method to complete purchase faster' },
  ]

  const handleExampleClick = (story: string) => {
    setInput(story)
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')

    let sess: Session
    if (!session) {
      sess = createSession(text)
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

  const doGeneratePRD = async (sess: Session, story: string) => {
    setLoading(true)
    setLoadingMsg('✨ Generating PRD…')
    addMessage(sess.id, { role: 'user', content: story, type: 'text' })
    try {
      const prd = await generatePRD(story, config)
      addPRDVersion(sess.id, {
        prdId: prd.id,
        content: prd.content,
        label: 'PRD v1',
        createdAt: prd.created_at,
      })
      updateSession(sess.id, { stage: 'prd_generated', currentPrdId: prd.id })
      addMessage(sess.id, {
        role: 'assistant',
        content: 'PRD has been generated. Review it, give feedback, or approve to proceed.',
        type: 'prd_ready',
        prdId: prd.id,
        prdVersion: 1,
      })
      setRightTab('prd')
    } catch (e: any) {
      addMessage(sess.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const doRegenPRD = async (sess: Session, feedback: string, prdId: number) => {
    setLoading(true)
    setLoadingMsg('🔄 Regenerating PRD with your feedback…')
    try {
      const story = sess.userStory || sess.messages.find(m => m.role === 'user')?.content || ''
      const promptWithFeedback = `${story}\n\nUser feedback: ${feedback}`
      const prd = await regeneratePRD(prdId, promptWithFeedback, config)
      const version = sess.prdVersions.length + 1
      addPRDVersion(sess.id, {
        prdId: prd.id,
        content: prd.content,
        label: `PRD v${version}`,
        createdAt: prd.created_at,
      })
      updateSession(sess.id, { currentPrdId: prd.id })
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
      setLoadingMsg('')
    }
  }

  const handleApprovePRD = async () => {
    if (!session?.currentPrdId) return
    setLoading(true)
    setLoadingMsg('✓ Approving PRD…')
    try {
      await approvePRD(session.currentPrdId)
      updateSession(session.id, { stage: 'prd_approved' })
      addMessage(session.id, {
        role: 'assistant',
        content: '✓ PRD approved! Ready to generate test cases.',
        type: 'status',
      })
    } catch (e: any) {
      addMessage(session.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const handleGenerateTests = async () => {
    if (!session?.currentPrdId) return
    setLoading(true)
    setLoadingMsg('🧪 Generating scenarios → risks → test cases…')
    try {
      if (session.stage !== 'prd_approved') {
        await approvePRD(session.currentPrdId)
        updateSession(session.id, { stage: 'prd_approved' })
      }
      const tcs = await generateTests(session.currentPrdId, config)
      const mapped: TCRecord[] = tcs.map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        category: t.scenario_category,
        status: t.status,
        tags: t.tags,
        preconditions: t.preconditions,
        gherkin_steps: t.gherkin_steps,
        risks: t.risks,
        limitations: t.limitations,
        scenario_id: t.scenario_id,
        scenario_title: t.scenario_title,
        scenario_category: t.scenario_category,
      }))
      updateSession(session.id, { stage: 'tests_generated', testCases: mapped })
      addMessage(session.id, {
        role: 'assistant',
        content: `✓ ${mapped.length} test cases generated. Review below.`,
        type: 'tests_ready',
        tcIds: mapped.map(t => t.id),
      })
      setRightTab('testcases')
    } catch (e: any) {
      addMessage(session.id, { role: 'assistant', content: `❌ Error: ${e.message}`, type: 'text' })
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

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
    if (tc) updateTC(session.id, { ...tc, status: 'rejected' })
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
      status: 'pending',
    })
  }

  return (
    <div className={s.workspaceContainer}>
      {/* Left Sidebar */}
      <aside className={`${s.sidebar} ${sidebarOpen ? s.open : s.closed}`}>
        <div className={s.sidebarHeader}>
          <div className={s.logo}>
            <Zap size={24} className={s.logoIcon} />
            <span className={s.logoText}>QA Pipeline</span>
          </div>
          <button
            className={s.toggleBtn}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle sidebar"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <div className={s.sessionControls}>
          <button
            className={s.newSessionBtn}
            onClick={() => {
              createSession('New Session')
              setInput('')
            }}
          >
            <Plus size={18} />
            <span>New Session</span>
          </button>
          <button
            className={s.settingsBtn}
            onClick={() => setConfigOpen(!configOpen)}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>

        <div className={s.sessionList}>
          <p className={s.sessionListLabel}>Sessions</p>
          {sessions.length === 0 ? (
            <div className={s.emptyState}>No sessions yet</div>
          ) : (
            sessions.map(sess => (
              <div
                key={sess.id}
                className={`${s.sessionCard} ${sess.id === activeSessionId ? s.active : ''}`}
                onClick={() => setActiveSession(sess.id)}
              >
                <div className={s.sessionInfo}>
                  <p className={s.sessionName}>{sess.userStory || 'Untitled'}</p>
                  <span className={`${s.stageBadge} ${s[`stage${sess.stage}`]}`}>
                    {sess.stage.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  className={s.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(sess.id)
                  }}
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className={s.sidebarFooter}>
          <button
            className={s.logoutBtn}
            onClick={() => nav('/config')}
          >
            <Settings size={16} />
            <span>LLM Config</span>
          </button>
        </div>
      </aside>

      {/* Center Chat Panel */}
      <main className={s.mainPanel}>
        {!session ? (
          <div className={s.emptyState}>
            <div className={s.emptyHeader}>
              <div className={s.emptyIcon}>⚡</div>
              <h2 className={s.emptyTitle}>QA Intelligence Pipeline</h2>
              <p className={s.emptySubtitle}>Transform user stories into production-ready test assets</p>
            </div>

            <div className={s.examplesGrid}>
              {exampleStories.map((ex, i) => (
                <button
                  key={i}
                  className={s.exampleCard}
                  onClick={() => handleExampleClick(ex.story)}
                >
                  <span className={s.exampleIcon}>{ex.icon}</span>
                  <p className={s.exampleTitle}>{ex.title}</p>
                  <p className={s.exampleText}>{ex.story}</p>
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

        {/* Input Area */}
        <div className={s.inputArea}>
          <div className={s.inputWrapper}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={session ? 'Add feedback or request changes…' : 'Describe a user story…'}
              className={s.input}
              disabled={loading}
            />
            <button
              className={`${s.sendBtn} ${loading ? s.loading : ''}`}
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              {loading ? (
                <Loader size={18} className={s.spinning} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          {loadingMsg && <p className={s.loadingMsg}>{loadingMsg}</p>}
        </div>
      </main>

      {/* Right Artifact Panel */}
      <aside className={s.artifactPanel}>
        <div className={s.panelTabs}>
          <button
            className={`${s.tab} ${rightTab === 'prd' ? s.active : ''}`}
            onClick={() => setRightTab('prd')}
          >
            <FileText size={16} />
            <span>PRD</span>
          </button>
          <button
            className={`${s.tab} ${rightTab === 'testcases' ? s.active : ''}`}
            onClick={() => setRightTab('testcases')}
          >
            <TestTube size={16} />
            <span>Test Cases</span>
          </button>
        </div>

        <div className={s.panelContent}>
          {rightTab === 'prd' && session && (
            <PRDPanel
              session={session}
              currentPRD={currentPRD}
              onApprove={handleApprovePRD}
              onRegenerate={() => {}}
              loading={loading}
            />
          )}
          {rightTab === 'testcases' && session && (
            <TestCasePanel
              testCases={session.testCases}
              onApprove={handleApproveTC}
              onReject={handleRejectTC}
              onRegenerate={handleRegenTC}
              loading={loading}
            />
          )}
          {!session && (
            <div className={s.panelEmpty}>
              <p>Start a session to see artifacts</p>
            </div>
          )}
        </div>
      </aside>

      {/* Config Modal */}
      {configOpen && <ConfigModal />}
    </div>
  )
}
