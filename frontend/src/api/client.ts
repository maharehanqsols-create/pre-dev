import axios from 'axios'
import type { LLMConfig, TCRecord } from '../store/session'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' })

api.interceptors.response.use(
  r => r,
  err => {
    const detail = err.response?.data?.detail
    if (detail) err.message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    return Promise.reject(err)
  }
)

export const generatePRD = (user_story: string, config: LLMConfig) =>
  api.post('/api/prd/generate', { user_story, config }).then(r => r.data)

export const regeneratePRD = (prd_id: number, user_story: string, config: LLMConfig) =>
  api.post(`/api/prd/${prd_id}/regenerate`, { user_story, config }).then(r => r.data)

export const updatePRD = (prd_id: number, content: string) =>
  api.put(`/api/prd/${prd_id}`, { content }).then(r => r.data)

export const approvePRD = (prd_id: number) =>
  api.post(`/api/prd/${prd_id}/approve`).then(r => r.data)

export const generateTests = (prd_id: number, config: LLMConfig) =>
  api.post('/api/tests/generate', { prd_id, config }).then(r => r.data)

export const approveTest = (id: number) =>
  api.post(`/api/tests/${id}/approve`).then(r => r.data)

export const rejectTest = (id: number, reason: string) =>
  api.post(`/api/tests/${id}/reject`, { reason }).then(r => r.data)

export const regenerateTest = (id: number, config: LLMConfig, tc: TCRecord, prd_content: string) =>
  api.post(`/api/tests/${id}/regenerate`, {
    config,
    scenario_id: tc.scenario_id,
    scenario_title: tc.scenario_title,
    scenario_category: tc.scenario_category,
    prd_content,
  }).then(r => r.data)

export const getProviders = () =>
  api.get('/api/providers').then(r => r.data.providers)