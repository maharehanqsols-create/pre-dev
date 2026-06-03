
import { useState } from 'react'
import { Zap, Settings, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useConfig } from '../ConfigContext'
import PRDSection from '../components/PRDSection'
import TestSection from '../components/TestSection'
import { generatePRD } from '../api'
import type { PRD } from '../api'
import s from './Pipeline.module.css'

type Stage = 'input' | 'prd' | 'tests'

export default function PipelinePage() {
  const { config, configured } = useConfig()
  const nav = useNavigate()

  const [stage, setStage] = useState<Stage>('input')
  const [userStory, setUserStory] = useState('')
  const [prd, setPrd] = useState<PRD | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const handleGenerate = async () => {
    if (!userStory.trim()) return

    setLoading(true)
    setError('')

    try {
      const result = await generatePRD(userStory, config)

      setPrd(result)
      setStage('prd')
    } catch (e: any) {
      console.error('PRD generation failed:', e)

      const detail = e?.response?.data?.detail

      let message = 'Something went wrong'

      if (typeof detail === 'string') {
        message = detail
      } else if (
        detail &&
        typeof detail === 'object'
      ) {
        if (detail.error && detail.type) {
          message = `${detail.type}: ${detail.error}`
        } else {
          message = JSON.stringify(detail, null, 2)
        }
      } else if (e?.response?.data) {
        message = JSON.stringify(
          e.response.data,
          null,
          2
        )
      } else if (e?.message) {
        message = e.message
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const onPRDApproved = (approved: PRD) => {
    setPrd(approved)
    setStage('tests')
  }

  return (
    <div className={s.layout}>
      {/* Sidebar */}
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <Zap size={16} />
          <span>QA Pipeline</span>
        </div>

        <div className={s.steps}>
          {(['input', 'prd', 'tests'] as Stage[]).map(
            (st, i) => {
              const labels = [
                'User Story',
                'PRD Review',
                'Test Cases',
              ]

              const done =
                (stage === 'prd' &&
                  st === 'input') ||
                (stage === 'tests' &&
                  (st === 'input' ||
                    st === 'prd'))

              const active = stage === st

              return (
                <div
                  key={st}
                  className={`${s.step} ${
                    active ? s.active : ''
                  } ${done ? s.done : ''}`}
                >
                  <div className={s.stepNum}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span>{labels[i]}</span>
                </div>
              )
            }
          )}
        </div>

        <button
          className={s.configBtn}
          onClick={() => nav('/')}
        >
          <Settings size={14} />
          <span>
            {config.provider}
            {' / '}
            {config.model?.split('/').pop()}
          </span>
        </button>
      </aside>

      {/* Main Content */}
      <main className={s.main}>
        {stage === 'input' && (
          <div className={s.inputStage}>
            <div className={s.stageHeader}>
              <h2>User Story</h2>
              <p>
                Describe the feature from the
                user's perspective
              </p>
            </div>

            <textarea
              className={s.storyInput}
              placeholder="As a homeowner, I want to invite contractors to my project so that they can view project details and submit quotes."
              value={userStory}
              onChange={(e) =>
                setUserStory(e.target.value)
              }
              rows={8}
            />

            {error && (
              <div className={s.error}>
                <strong>Error:</strong>
                <pre
                  style={{
                    marginTop: '8px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {error}
                </pre>
              </div>
            )}

            <div className={s.actions}>
              <span className={s.hint}>
                {userStory.length > 0
                  ? `${userStory.length} chars`
                  : 'Write a clear user story for best results'}
              </span>

              <button
                className={s.primaryBtn}
                onClick={handleGenerate}
                disabled={
                  loading ||
                  !userStory.trim() ||
                  !configured
                }
              >
                {loading ? (
                  <>
                    <span className={s.spinner} />
                    Generating PRD...
                  </>
                ) : (
                  <>
                    Generate PRD
                    <ChevronRight size={15} />
                  </>
                )}
              </button>
            </div>

            {!configured && (
              <div className={s.warning}>
                Configure your LLM provider
                first →{' '}
                <button
                  onClick={() => nav('/')}
                  className={s.inlineBtn}
                >
                  Settings
                </button>
              </div>
            )}
          </div>
        )}

        {stage === 'prd' && prd && (
          <PRDSection
            prd={prd}
            config={config}
            userStory={userStory}
            onApproved={onPRDApproved}
            onUpdated={setPrd}
          />
        )}

        {stage === 'tests' && prd && (
          <TestSection
            prd={prd}
            config={config}
          />
        )}
      </main>
    </div>
  )
}

