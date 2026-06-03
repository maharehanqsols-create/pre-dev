import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { LLMConfig } from './api'

interface ConfigCtx {
  config: LLMConfig
  setConfig: (c: LLMConfig) => void
  configured: boolean
}

const Ctx = createContext<ConfigCtx>({} as ConfigCtx)

export const ConfigProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [config, setConfig] = useState<LLMConfig>({
    provider: 'openai',
    api_key: '',
    model: 'gpt-4o',
    base_url: '',
  })

  const configured = (() => {
    if (!config.provider) return false
    if (config.provider === 'ollama') return true
    if (config.provider === 'openrouter') return Boolean(config.api_key && config.base_url)
    if (config.provider === 'custom') return Boolean(config.base_url)
    return Boolean(config.api_key)
  })()

  return (
    <Ctx.Provider
      value={{
        config,
        setConfig,
        configured,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useConfig = () => useContext(Ctx)