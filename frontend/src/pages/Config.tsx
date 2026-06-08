import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Check } from 'lucide-react'
import { useStore } from '../store/session'
import s from './ConfigModal.module.css'

const PROVIDERS = [
  { id: 'custom',     name: 'Q-Solutions',   requiresKey: true,  requiresUrl: true,  defaultModel: 'Qwen3-VL:latest', defaultUrl: 'https://ollama-api.q-solutions.pk/v1', models: ['Qwen3-VL:latest', 'gemma4:e4b'] },
  { id: 'openai',     name: 'OpenAI',        requiresKey: true,  requiresUrl: false, defaultModel: 'gpt-4o',          defaultUrl: '', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'gemini',     name: 'Gemini',        requiresKey: true,  requiresUrl: false, defaultModel: 'gemini-2.0-flash', defaultUrl: '', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'openrouter', name: 'OpenRouter',    requiresKey: true,  requiresUrl: false, defaultModel: 'meta-llama/llama-3.1-70b-instruct', defaultUrl: '', models: ['meta-llama/llama-3.1-70b-instruct', 'anthropic/claude-sonnet-4-5', 'mistralai/mistral-large'] },
  { id: 'ollama',     name: 'Ollama (local)',requiresKey: false, requiresUrl: false, defaultModel: 'llama3.1',        defaultUrl: '', models: ['llama3.1', 'mistral', 'codellama', 'gemma2'] },
]

export default function ConfigModal() {
  const { config, setConfig, setConfigOpen } = useStore()

  const [provider,     setProvider]     = useState(config.provider || 'custom')
  const [apiKey,       setApiKey]       = useState(config.api_key || '')
  const [baseUrl,      setBaseUrl]      = useState(config.base_url || '')
  const [model,        setModel]        = useState(config.model || '')
  const [customModel,  setCustomModel]  = useState('')
  const [showKey,      setShowKey]      = useState(false)
  const [saved,        setSaved]        = useState(false)

  const cur = PROVIDERS.find(p => p.id === provider)!

  // When provider changes, reset model/url to defaults
  const handleProviderChange = (id: string) => {
    const p = PROVIDERS.find(x => x.id === id)!
    setProvider(id)
    setModel(p.defaultModel)
    setBaseUrl(p.defaultUrl)
    setCustomModel('')
    setApiKey('')
  }

  const effectiveModel = customModel.trim() || model

  const canSave = () => {
    if (cur.requiresKey && !apiKey.trim()) return false
    if (cur.requiresUrl && !baseUrl.trim()) return false
    if (!effectiveModel) return false
    return true
  }

  const save = () => {
    setConfig({
      provider,
      api_key:  cur.requiresKey ? (apiKey.trim() || undefined) : undefined,
      model:    effectiveModel,
      base_url: baseUrl.trim() || undefined,
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); setConfigOpen(false) }, 900)
  }

  return (
    <div className={s.overlay} onClick={() => setConfigOpen(false)}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.title}>LLM Configuration</span>
          <button className={s.closeBtn} onClick={() => setConfigOpen(false)}><X size={15} /></button>
        </div>

        <div className={s.body}>
          {/* Provider grid */}
          <div className={s.field}>
            <label className={s.label}>Provider</label>
            <div className={s.providerGrid}>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  className={`${s.provBtn} ${provider === p.id ? s.active : ''}`}
                  onClick={() => handleProviderChange(p.id)}
                >
                  {p.name}
                  {!p.requiresKey && <span className={s.localTag}>local</span>}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          {cur.requiresKey && (
            <div className={s.field}>
              <label className={s.label}>
                API Key <span className={s.required}>*</span>
              </label>
              <div className={s.inputRow}>
                <input
                  className={s.input}
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={`Enter ${cur.name} API key`}
                />
                <button className={s.eyeBtn} onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          {(provider === 'custom' || provider === 'ollama') && (
            <div className={s.field}>
              <label className={s.label}>
                Base URL {cur.requiresUrl && <span className={s.required}>*</span>}
              </label>
              <input
                className={s.input}
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={cur.defaultUrl || 'http://localhost:11434'}
              />
            </div>
          )}

          {/* Model select */}
          <div className={s.field}>
            <label className={s.label}>Model</label>
            <select
              className={s.input}
              value={model}
              onChange={e => { setModel(e.target.value); setCustomModel('') }}
            >
              {cur.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Custom model override */}
          <div className={s.field}>
            <label className={s.label}>
              Custom model <span className={s.opt}>(overrides above)</span>
            </label>
            <input
              className={s.input}
              value={customModel}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="e.g. gemma4:e4b or gpt-4o-2024-11-20"
            />
          </div>

          {/* Preview */}
          <div className={s.preview}>
            <span className={s.previewLabel}>Active config:</span>
            <code className={s.previewCode}>
              {provider} / {effectiveModel || '—'}{baseUrl ? ` → ${baseUrl}` : ''}
            </code>
          </div>
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={() => setConfigOpen(false)}>Cancel</button>
          <button className={s.saveBtn} onClick={save} disabled={!canSave()}>
            {saved ? <><Check size={13} /> Saved!</> : 'Save configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}