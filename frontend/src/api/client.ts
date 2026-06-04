/**
 * API Client — QA Pipeline
 *
 * Key addition: streamGeneratePRD() and streamGenerateTests()
 * These use Server-Sent Events (SSE) to show live progress
 * and avoid 524 timeout errors on long user stories.
 */

import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface LLMConfig {
  provider: string
  api_key?: string
  model?: string
  base_url?: string
}

export interface PRDResponse {
  id: number
  user_story: string
  content: string
  modules: string[]       // new: module names if complex story
  is_complex: boolean     // new: was it split?
  status: 'draft' | 'approved' | 'dropped'
  created_at: string
  updated_at: string
}

export interface GherkinStep {
  keyword: string   // Given | When | Then | And | But
  text: string
}

export interface RiskDetail {
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  mitigation: string
}

export interface TestCaseResponse {
  id: number
  prd_id: number
  scenario_id: string
  scenario_title: string
  scenario_category: string
  title: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  tags: string[]
  preconditions: string[]
  gherkin_steps: GherkinStep[]
  risks: RiskDetail[]           // now structured
  edge_notes: string[]          // new: boundary conditions / gotchas
  limitations: string[]
  status: 'pending' | 'approved' | 'rejected'
  reject_reason?: string
  created_at: string
  updated_at: string
}

// ─── SSE Event types ─────────────────────────────────────────────

export interface ProgressEvent {
  step: number
  total: number
  message: string
  // PRD-specific
  modules?: string[]
  is_complex?: boolean
  current_module?: string
  module_index?: number
  module_total?: number
  // Tests-specific
  scenario_count?: number
  tc_count?: number
}

export interface PRDCompleteEvent extends PRDResponse {}

export interface TestsCompleteEvent {
  count: number
  message: string
  test_cases: TestCaseResponse[]
}

export interface ErrorEvent {
  message: string
}

// ─────────────────────────────────────────────────────────────────
// SSE helper
// ─────────────────────────────────────────────────────────────────

/**
 * Consumes an SSE stream from a POST endpoint.
 * FastAPI's StreamingResponse sends:
 *   event: progress\ndata: {...}\n\n
 *   event: complete\ndata: {...}\n\n
 *   event: error\ndata: {...}\n\n
 */
async function consumeSSE<TComplete>(
  url: string,
  body: unknown,
  onProgress: (e: ProgressEvent) => void,
): Promise<TComplete> {
  const response = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  return new Promise<TComplete>((resolve, reject) => {
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE messages (terminated by \n\n)
          const messages = buffer.split('\n\n')
          buffer = messages.pop() ?? ''   // keep incomplete last chunk

          for (const msg of messages) {
            if (!msg.trim()) continue

            const lines = msg.split('\n')
            let eventType = 'message'
            let dataStr = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                dataStr = line.slice(6).trim()
              }
            }

            if (!dataStr) continue

            try {
              const data = JSON.parse(dataStr)

              if (eventType === 'progress') {
                onProgress(data as ProgressEvent)
              } else if (eventType === 'complete') {
                resolve(data as TComplete)
                return
              } else if (eventType === 'error') {
                reject(new Error((data as ErrorEvent).message))
                return
              }
            } catch (parseErr) {
              console.warn('SSE parse error:', parseErr, 'raw:', dataStr)
            }
          }
        }

        reject(new Error('SSE stream ended without a complete event'))
      } catch (err) {
        reject(err)
      }
    }

    pump()
  })
}

// ─────────────────────────────────────────────────────────────────
// PRD API
// ─────────────────────────────────────────────────────────────────

/**
 * Generate PRD with streaming progress (recommended — no timeout).
 * onProgress is called with step updates so UI can show what's happening.
 */
export async function streamGeneratePRD(
  userStory: string,
  config: LLMConfig,
  onProgress: (e: ProgressEvent) => void,
): Promise<PRDCompleteEvent> {
  return consumeSSE<PRDCompleteEvent>(
    '/api/prd/generate/stream',
    { user_story: userStory, config },
    onProgress,
  )
}

/**
 * Standard (non-streaming) PRD generation.
 * May timeout (524) for long/complex user stories.
 * Use streamGeneratePRD() instead for production.
 */
export async function generatePRD(
  userStory: string,
  config: LLMConfig,
): Promise<PRDResponse> {
  const { data } = await axios.post(`${BASE}/api/prd/generate`, {
    user_story: userStory,
    config,
  })
  return data
}

export async function regeneratePRD(
  prdId: number,
  userStory: string,
  config: LLMConfig,
): Promise<PRDResponse> {
  const { data } = await axios.post(`${BASE}/api/prd/${prdId}/regenerate`, {
    user_story: userStory,
    config,
  })
  return data
}

export async function approvePRD(prdId: number): Promise<PRDResponse> {
  const { data } = await axios.post(`${BASE}/api/prd/${prdId}/approve`)
  return data
}

export async function updatePRD(prdId: number, content: string): Promise<PRDResponse> {
  const { data } = await axios.put(`${BASE}/api/prd/${prdId}`, { content })
  return data
}

export async function getPRD(prdId: number): Promise<PRDResponse> {
  const { data } = await axios.get(`${BASE}/api/prd/${prdId}`)
  return data
}

// ─────────────────────────────────────────────────────────────────
// Test Cases API
// ─────────────────────────────────────────────────────────────────

/**
 * Generate test cases with streaming progress (recommended — no timeout).
 */
export async function streamGenerateTests(
  prdId: number,
  config: LLMConfig,
  onProgress: (e: ProgressEvent) => void,
): Promise<TestsCompleteEvent> {
  return consumeSSE<TestsCompleteEvent>(
    '/api/tests/generate/stream',
    { prd_id: prdId, config },
    onProgress,
  )
}

/**
 * Standard (non-streaming) test case generation.
 * May timeout for large PRDs with many scenarios.
 * Use streamGenerateTests() instead for production.
 */
export async function generateTests(
  prdId: number,
  config: LLMConfig,
): Promise<TestCaseResponse[]> {
  const { data } = await axios.post(`${BASE}/api/tests/generate`, {
    prd_id: prdId,
    config,
  })
  return data
}

export async function approveTest(id: number): Promise<TestCaseResponse> {
  const { data } = await axios.post(`${BASE}/api/tests/${id}/approve`)
  return data
}

export async function rejectTest(id: number, reason: string): Promise<TestCaseResponse> {
  const { data } = await axios.post(`${BASE}/api/tests/${id}/reject`, { reason })
  return data
}

export async function regenerateTest(
  id: number,
  config: LLMConfig,
  tc: { scenario_id: string; scenario_title: string; scenario_category: string },
  prdContent: string,
): Promise<TestCaseResponse> {
  const { data } = await axios.post(`${BASE}/api/tests/${id}/regenerate`, {
    config,
    scenario_id:       tc.scenario_id,
    scenario_title:    tc.scenario_title,
    scenario_category: tc.scenario_category,
    prd_content:       prdContent,
  })
  return data
}

export async function getTestsByPRD(prdId: number): Promise<TestCaseResponse[]> {
  const { data } = await axios.get(`${BASE}/api/tests/prd/${prdId}`)
  return data
}