import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Zap, Eye, EyeOff, Check, Sparkles, Server, Key, Globe, Cpu } from 'lucide-react'
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
  const [isSaving, setIsSaving] = useState(false)
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

  const save = async () => {
    setIsSaving(true)
    // Simulate save delay for better UX
    await new Promise(resolve => setTimeout(resolve, 500))
    setConfig({
      provider: selectedProvider as any,
      api_key: apiKey.trim() || undefined,
      model: effectiveModel,
      base_url: baseUrl.trim() || undefined,
    })
    nav('/pipeline')
  }

  const getProviderIcon = (providerId: string) => {
    switch(providerId) {
      case 'openai': return '🤖'
      case 'anthropic': return '🧠'
      case 'google': return '🔬'
      case 'ollama': return '🦙'
      case 'custom': return '⚙️'
      default: return '💡'
    }
  }

  return (
    <div className={s.page}>
      <div className={s.gradientBg} />
      
      <div className={s.header}>
        <div className={s.logo}>
          <div className={s.logoIcon}>
            <Zap size={20} />
          </div>
          <span>QA Pipeline</span>
        </div>
        <div className={s.headerContent}>
          <div className={s.badge}>
            <Sparkles size={12} />
            <span>AI-Powered Testing</span>
          </div>
          <h1 className={s.title}>Configure your LLM</h1>
          <p className={s.sub}>Choose a provider and customize your AI testing experience</p>
        </div>
      </div>

      <div className={s.container}>
        <div className={s.card}>
          {/* Provider Selection */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <Server size={16} />
              <label className={s.label}>AI Provider</label>
            </div>
            <div className={s.providerGrid}>
              {providers.map(p => (
                <button
                  key={p.id}
                  className={`${s.providerBtn} ${selectedProvider === p.id ? s.active : ''}`}
                  onClick={() => handleProviderChange(p.id)}
                >
                  <div className={s.providerIcon}>
                    {getProviderIcon(p.id)}
                  </div>
                  <div className={s.providerInfo}>
                    <span className={s.providerName}>{p.name}</span>
                    {!p.requires_key && (
                      <span className={s.badge}>
                        <Cpu size={10} />
                        local
                      </span>
                    )}
                  </div>
                  {selectedProvider === p.id && (
                    <div className={s.checkmark}>
                      <Check size={14} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* API Key Field */}
          {current?.requires_key && (
            <div className={`${s.section} ${s.fadeIn}`}>
              <div className={s.sectionHeader}>
                <Key size={16} />
                <label className={s.label}>API Key</label>
              </div>
              <div className={s.inputWrapper}>
                <input
                  className={s.input}
                  type={showKey ? 'text' : 'password'}
                  placeholder={`Enter your ${current.name} API key`}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <button className={s.eyeBtn} onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className={s.inputHint}>
                Your API key is stored locally and never shared
              </p>
            </div>
          )}

          {/* Base URL Fields */}
          {(selectedProvider === 'custom' || selectedProvider === 'ollama') && (
            <div className={`${s.section} ${s.fadeIn}`}>
              <div className={s.sectionHeader}>
                <Globe size={16} />
                <label className={s.label}>
                  Base URL
                  {selectedProvider === 'custom' && <span className={s.required}>*</span>}
                </label>
              </div>
              <input
                className={s.input}
                type="text"
                placeholder={selectedProvider === 'custom'
                  ? 'https://your-api-endpoint.com/v1'
                  : 'http://localhost:11434'}
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
              />
              {selectedProvider === 'ollama' && (
                <p className={s.inputHint}>
                  Default: http://localhost:11434
                </p>
              )}
            </div>
          )}

          {/* Model Selection */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <Cpu size={16} />
              <label className={s.label}>Model</label>
            </div>
            <select
              className={s.select}
              value={selectedModel}
              onChange={e => { setSelectedModel(e.target.value); setCustomModel('') }}
            >
              {current?.models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Custom Model */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <Sparkles size={16} />
              <label className={s.label}>
                Custom Model
                <span className={s.optional}>Optional</span>
              </label>
            </div>
            <input
              className={s.input}
              type="text"
              placeholder="Enter custom model name (overrides selection)"
              value={customModel}
              onChange={e => setCustomModel(e.target.value)}
            />
          </div>

          {/* Config Preview */}
          <div className={s.preview}>
            <div className={s.previewHeader}>
              <span className={s.previewLabel}>Active Configuration</span>
              <div className={s.previewStatus}>
                <div className={s.statusDot} />
                <span>Ready</span>
              </div>
            </div>
            <div className={s.previewContent}>
              <code className={s.previewCode}>
                {selectedProvider} / {effectiveModel || '—'}
                {baseUrl && ` @ ${baseUrl}`}
              </code>
            </div>
          </div>

          {/* Continue Button */}
          <button 
            className={`${s.saveBtn} ${isSaving ? s.loading : ''}`} 
            onClick={save} 
            disabled={!canContinue() || isSaving}
          >
            {isSaving ? (
              <>
                <div className={s.spinner} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Continue to Pipeline</span>
                <ChevronRight size={18} />
              </>
            )}
          </button>
          
          {!canContinue() && current?.requires_key && !apiKey && (
            <div className={s.errorMessage}>
              <span>⚠️ API key is required to continue</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}