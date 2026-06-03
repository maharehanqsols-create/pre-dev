import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Zap, Eye, EyeOff } from 'lucide-react'
import { useConfig } from '../ConfigContext'
import { getProviders } from '../api'
import type { Provider } from '../api'
import s from './Config.module.css'

export default function ConfigPage() {
  const { config, setConfig } = useConfig()
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState(config.provider)
  const [apiKey, setApiKey] = useState(config.api_key || '')
  const [baseUrl, setBaseUrl] = useState(config.base_url || '')
  const [selectedModel, setSelectedModel] = useState(config.model || '')
  const [customModel, setCustomModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    getProviders().then(p => {
      setProviders(p)
      const cur = p.find(x => x.id === selectedProvider)
      if (cur) {
        if (!selectedModel) setSelectedModel(cur.default_model)
        if (!baseUrl && (cur as any).default_base_url) setBaseUrl((cur as any).default_base_url)
      }
    })
  }, [])

  const current = providers.find(p => p.id === selectedProvider)

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id as any)
    const p = providers.find(x => x.id === id)
    if (p) {
      setSelectedModel(p.default_model)
      setBaseUrl((p as any).default_base_url || '')
      setCustomModel('')
    }
  }

  const effectiveModel = customModel.trim() || selectedModel

  const canContinue = () => {
    if (!current) return false
    if (current.requires_key && !apiKey.trim()) return false
    if ((current as any).requires_base_url && !baseUrl.trim()) return false
    if (!effectiveModel) return false
    return true
  }

  const save = () => {
    setConfig({
      provider: selectedProvider as any,
      api_key: apiKey.trim() || undefined,
      model: effectiveModel,
      base_url: baseUrl.trim() || undefined,
    })
    nav('/pipeline')
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.logo}><Zap size={18} /><span>QA Pipeline</span></div>
        <h1 className={s.title}>Configure LLM</h1>
        <p className={s.sub}>Choose your AI provider to get started</p>
      </div>

      <div className={s.card}>
        <div>
          <label className={s.label}>Provider</label>
          <div className={s.providerGrid}>
            {providers.map(p => (
              <button
                key={p.id}
                className={`${s.providerBtn} ${selectedProvider === p.id ? s.active : ''}`}
                onClick={() => handleProviderChange(p.id)}
              >
                <span className={s.providerName}>{p.name}</span>
                {!p.requires_key && <span className={s.badge}>local</span>}
              </button>
            ))}
          </div>
        </div>

        {current?.requires_key && (
          <div className={s.field}>
            <label className={s.label}>API Key</label>
            <div className={s.inputRow}>
              <input
                className={s.input}
                type={showKey ? 'text' : 'password'}
                placeholder={`Enter your ${current.name} API key`}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button className={s.eyeBtn} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        )}

        {(selectedProvider === 'custom' || selectedProvider === 'ollama') && (
          <div className={s.field}>
            <label className={s.label}>
              Base URL{selectedProvider === 'custom' && <span className={s.required}> *</span>}
            </label>
            <input
              className={s.input}
              type="text"
              placeholder={selectedProvider === 'custom'
                ? 'https://ollama-api.q-solutions.pk/v1'
                : 'http://localhost:11434 (default)'}
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>
        )}

        <div className={s.field}>
          <label className={s.label}>Model</label>
          <select
            className={s.input}
            value={selectedModel}
            onChange={e => { setSelectedModel(e.target.value); setCustomModel('') }}
          >
            {current?.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className={s.field}>
          <label className={s.label}>
            Custom model name
            <span className={s.optional}> (optional — overrides above)</span>
          </label>
          <input
            className={s.input}
            type="text"
            placeholder="e.g. gemma4:e4b"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
          />
        </div>

        <div className={s.preview}>
          <span className={s.previewLabel}>Active config</span>
          <code className={s.previewCode}>
            {selectedProvider} | {effectiveModel || '—'}{baseUrl ? ` | ${baseUrl}` : ''}
          </code>
        </div>

        <button className={s.saveBtn} onClick={save} disabled={!canContinue()}>
          Continue <ChevronRight size={16} />
        </button>
        {!canContinue() && current?.requires_key && !apiKey && (
          <p className={s.hint}>API key required to continue</p>
        )}
      </div>
    </div>
  )
}