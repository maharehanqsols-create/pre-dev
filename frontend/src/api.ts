import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' })

// Better error extraction
api.interceptors.response.use(
  res => res,
  err => {
    const detail = err.response?.data?.detail
    if (detail) {
      err.message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
    return Promise.reject(err)
  }
)

export interface LLMConfig {
  provider: 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'custom'
  api_key?: string
  model?: string
  base_url?: string
}

export interface PRD {
  id: number
  user_story: string
  content: string
  status: 'draft' | 'approved' | 'dropped'
  created_at: string
  updated_at: string
}

export interface GherkinStep {
  keyword: string
  text: string
}

export interface TestCase {
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
  risks: string[]
  limitations: string[]
  status: 'pending' | 'approved' | 'rejected'
  reject_reason?: string
  created_at: string
}

export interface Provider {
  id: string
  name: string
  requires_key: boolean
  default_model: string
  models: string[]
  default_base_url?: string
  requires_base_url?: boolean
}

// PRD APIs
export const generatePRD = (user_story: string, config: LLMConfig) =>
  api.post<PRD>('/api/prd/generate', { user_story, config }).then(r => r.data)

export const updatePRD = (id: number, content: string) =>
  api.put<PRD>(`/api/prd/${id}`, { content }).then(r => r.data)

export const approvePRD = (id: number) =>
  api.post<PRD>(`/api/prd/${id}/approve`).then(r => r.data)

export const dropPRD = (id: number) =>
  api.post<PRD>(`/api/prd/${id}/drop`).then(r => r.data)

export const regeneratePRD = (id: number, user_story: string, config: LLMConfig) =>
  api.post<PRD>(`/api/prd/${id}/regenerate`, { user_story, config }).then(r => r.data)

export const listPRDs = () =>
  api.get<PRD[]>('/api/prd/').then(r => r.data)

// Test Case APIs
export const generateTests = (prd_id: number, config: LLMConfig) =>
  api.post<TestCase[]>('/api/tests/generate', { prd_id, config }).then(r => r.data)

export const listTests = (prd_id: number) =>
  api.get<TestCase[]>(`/api/tests/prd/${prd_id}`).then(r => r.data)

export const approveTest = (id: number) =>
  api.post<TestCase>(`/api/tests/${id}/approve`).then(r => r.data)

export const rejectTest = (id: number, reason: string) =>
  api.post<TestCase>(`/api/tests/${id}/reject`, { reason }).then(r => r.data)

export const updateTest = (id: number, data: Partial<TestCase>) =>
  api.put<TestCase>(`/api/tests/${id}`, data).then(r => r.data)

export const regenerateTest = (id: number, config: LLMConfig, tc: TestCase, prd_content: string) =>
  api.post<TestCase>(`/api/tests/${id}/regenerate`, {
    config,
    scenario_id: tc.scenario_id,
    scenario_title: tc.scenario_title,
    scenario_category: tc.scenario_category,
    prd_content,
  }).then(r => r.data)

export const getProviders = () =>
  api.get<{ providers: Provider[] }>('/api/providers').then(r => r.data.providers)