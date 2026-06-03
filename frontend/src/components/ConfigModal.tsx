import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { useStore } from '../store/session'
import { getProviders } from '../api/client'
import s from './ConfigModal.module.css'

const FALLBACK = [
  { id: 'custom', name: 'Custom (Q-Solutions)', requires_key: true, default_model: 'Qwen3-VL:latest', models: ['Qwen3-VL:latest','gemma4:e4b'], default_base_url: 'https://ollama-api.q-solutions.pk/v1', requires_base_url: true },
  { id: 'openai', name: 'OpenAI', requires_key: true, default_model: 'gpt-4o', models: ['gpt-4o','gpt-4o-mini'], requires_base_url: false },
  { id: 'gemini', name: 'Google Gemini', requires_key: true, default_model: 'gemini-2.0-flash', models: ['gemini-2.0-flash','gemini-1.5-pro'], requires_base_url: false },
  { id: 'openrouter', name: 'OpenRouter', requires_key: true, default_model: 'meta-llama/llama-3.1-70b-instruct', models: ['meta-llama/llama-3.1-70b-instruct'], requires_base_url: false },
  { id: 'ollama', name: 'Ollama (local)', requires_key: false, default_model: 'llama3.1', models: ['llama3.1','mistral','gemma2'], requires_base_url: false },
]

export default function ConfigModal() {
  const { config, setConfig, setConfigOpen } = useStore()
  const [providers, setProviders] = useState(FALLBACK)
  const [provider, setProvider] = useState(config.provider || 'custom')
  const [apiKey, setApiKey] = useState(config.api_key || '')
  const [baseUrl, setBaseUrl] = useState(config.base_url || 'https://ollama-api.q-solutions.pk/v1')
  const [model, setModel] = useState(config.model || 'Qwen3-VL:latest')
  const [customModel, setCustomModel] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    getProviders().then(p => { if (p?.length) setProviders(p) }).catch(() => {})
  }, [])

  const cur = providers.find(p => p.id === provider) as any
  const effectiveModel = customModel.trim() || model

  const save = () => {
    setConfig({ provider, api_key: apiKey || undefined, model: effectiveModel, base_url: baseUrl || undefined })
    setConfigOpen(false)
  }

  return (
    <div className={s.overlay} onClick={() => setConfigOpen(false)}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.title}>LLM Configuration</span>
          <button className={s.closeBtn} onClick={() => setConfigOpen(false)}><X size={15} /></button>
        </div>

        <div className={s.body}>
          <label className={s.label}>Provider</label>
          <div className={s.grid}>
            {providers.map(p => (
              <button key={p.id} className={`${s.provBtn} ${provider === p.id ? s.active : ''}`}
                onClick={() => { setProvider(p.id); setModel((p as any).default_model || ''); setBaseUrl((p as any).default_base_url || ''); setCustomModel('') }}>
                {p.name}
                {!p.requires_key && <span className={s.localTag}>local</span>}
              </button>
            ))}
          </div>

          {cur?.requires_key && (
            <div className={s.field}>
              <label className={s.label}>API Key</label>
              <div className={s.inputRow}>
                <input className={s.input} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={`${cur.name} API key`} />
                <button className={s.eyeBtn} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
              </div>
            </div>
          )}

          {(provider === 'custom' || provider === 'ollama') && (
            <div className={s.field}>
              <label className={s.label}>Base URL {provider === 'custom' && <span style={{color:'var(--red)'}}>*</span>}</label>
              <input className={s.input} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div className={s.field}>
            <label className={s.label}>Model</label>
            <select className={s.input} value={model} onChange={e => { setModel(e.target.value); setCustomModel('') }}>
              {cur?.models?.map((m: string) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className={s.field}>
            <label className={s.label}>Custom model <span className={s.opt}>(overrides above)</span></label>
            <input className={s.input} value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="e.g. gemma4:e4b" />
          </div>

          <div className={s.preview}>
            <span className={s.previewLabel}>Active:</span>
            <code className={s.previewCode}>{provider} / {effectiveModel}{baseUrl ? ` → ${baseUrl}` : ''}</code>
          </div>
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={() => setConfigOpen(false)}>Cancel</button>
          <button className={s.saveBtn} onClick={save}>Save configuration</button>
        </div>
      </div>
    </div>
  )
}