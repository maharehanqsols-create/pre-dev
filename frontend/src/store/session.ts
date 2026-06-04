import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Stage = 'idle' | 'prd_generating' | 'prd_generated' | 'prd_approved' | 'tests_generating' | 'tests_generated'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type: 'text' | 'prd_ready' | 'prd_updated' | 'tests_ready' | 'status' | 'progress'
  timestamp: string
  prdId?: number
  prdVersion?: number
  tcIds?: number[]
}

export interface PRDVersion {
  version: number
  prdId: number
  content: string
  label: string
  modules: string[]
  isComplex: boolean
  createdAt: string
}

export interface RiskDetail {
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  mitigation: string
}

export interface GherkinStep {
  keyword: string
  text: string
}

export interface TCRecord {
  id: number
  title: string
  priority: string
  category: string
  status: 'pending' | 'approved' | 'rejected'
  tags: string[]
  preconditions: string[]
  gherkin_steps: GherkinStep[]
  risks: RiskDetail[]       // now structured
  edge_notes: string[]      // new
  limitations: string[]
  scenario_id: string
  scenario_title: string
  scenario_category: string
  reject_reason?: string
}

export interface Session {
  id: string
  userStory: string
  title: string
  stage: Stage
  messages: Message[]
  prdVersions: PRDVersion[]
  currentPrdId?: number
  testCases: TCRecord[]
  createdAt: string
  updatedAt: string
}

export interface LLMConfig {
  provider: string
  api_key?: string
  model?: string
  base_url?: string
}

interface Store {
  sessions: Session[]
  activeSessionId: string | null
  config: LLMConfig
  configOpen: boolean
  setConfig: (c: LLMConfig) => void
  setConfigOpen: (v: boolean) => void
  createSession: (userStory: string) => Session
  setActiveSession: (id: string) => void
  deleteSession: (id: string) => void
  addMessage: (sessionId: string, msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastMessage: (sessionId: string, content: string) => void
  updateSession: (sessionId: string, updates: Partial<Session>) => void
  addPRDVersion: (sessionId: string, v: Omit<PRDVersion, 'version'>) => void
  updateTC: (sessionId: string, tc: TCRecord) => void
  getActiveSession: () => Session | null
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      configOpen: false,
      config: {
        provider: 'custom',
        model: 'Qwen3-VL:latest',
        base_url: 'https://ollama-api.q-solutions.pk/v1',
      },

      setConfig: (c) => set({ config: c }),
      setConfigOpen: (v) => set({ configOpen: v }),

      createSession: (userStory) => {
        const id = `s-${Date.now()}`
        const session: Session = {
          id,
          userStory,
          title: userStory.slice(0, 55) + (userStory.length > 55 ? '…' : ''),
          stage: 'idle',
          messages: [],
          prdVersions: [],
          testCases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set(s => ({ sessions: [session, ...s.sessions], activeSessionId: id }))
        return session
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      deleteSession: (id) =>
        set(s => ({
          sessions: s.sessions.filter(x => x.id !== id),
          activeSessionId: s.activeSessionId === id
            ? (s.sessions.find(x => x.id !== id)?.id ?? null)
            : s.activeSessionId,
        })),

      addMessage: (sessionId, msg) => {
        const message: Message = {
          ...msg,
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
        }
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId
              ? { ...sess, messages: [...sess.messages, message], updatedAt: new Date().toISOString() }
              : sess
          ),
        }))
      },

      updateLastMessage: (sessionId, content) => {
        set(s => ({
          sessions: s.sessions.map(sess => {
            if (sess.id !== sessionId) return sess
            const msgs = [...sess.messages]
            if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
            return { ...sess, messages: msgs }
          }),
        }))
      },

      updateSession: (sessionId, updates) =>
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId
              ? { ...sess, ...updates, updatedAt: new Date().toISOString() }
              : sess
          ),
        })),

      addPRDVersion: (sessionId, v) =>
        set(s => ({
          sessions: s.sessions.map(sess => {
            if (sess.id !== sessionId) return sess
            const version = sess.prdVersions.length + 1
            return {
              ...sess,
              prdVersions: [...sess.prdVersions, { ...v, version }],
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      updateTC: (sessionId, tc) =>
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId
              ? {
                  ...sess,
                  testCases: sess.testCases.map(t => t.id === tc.id ? tc : t),
                  updatedAt: new Date().toISOString(),
                }
              : sess
          ),
        })),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find(s => s.id === activeSessionId) ?? null
      },
    }),
    { name: 'qa-pipeline-v3' }
  )
)