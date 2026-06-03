import s from './Markdown.module.css'

interface Props { content: string }

export default function Markdown({ content }: Props) {
  if (!content?.trim()) return <p className={s.empty}>No content yet.</p>

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { elements.push(<div key={i} className={s.spacer} />); i++; continue }
    if (trimmed === '---') { elements.push(<hr key={i} className={s.hr} />); i++; continue }
    if (trimmed.startsWith('# ')) { elements.push(<h1 key={i} className={s.h1}>{trimmed.slice(2)}</h1>); i++; continue }
    if (trimmed.startsWith('## ')) { elements.push(<h2 key={i} className={s.h2}>{trimmed.slice(3)}</h2>); i++; continue }
    if (trimmed.startsWith('### ')) { elements.push(<h3 key={i} className={s.h3}>{trimmed.slice(4)}</h3>); i++; continue }
    if (trimmed.startsWith('#### ')) { elements.push(<h4 key={i} className={s.h4}>{trimmed.slice(5)}</h4>); i++; continue }

    // Table rows
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }
      elements.push(<TableBlock key={`table-${i}`} lines={tableLines} />)
      continue
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className={s.ul}>
          {items.map((item, j) => <li key={j} className={s.li}>{renderInline(item)}</li>)}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\./.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\./.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s*/, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className={s.ol}>
          {items.map((item, j) => <li key={j} className={s.li}>{renderInline(item)}</li>)}
        </ol>
      )
      continue
    }

    elements.push(<p key={i} className={s.p}>{renderInline(trimmed)}</p>)
    i++
  }

  return <div className={s.root}>{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className='font-medium'>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 4 }}>{part.slice(1, -1)}</code>
    return part
  })
}

function TableBlock({ lines }: { lines: string[] }) {
  const rows = lines.map(l => l.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim()))
  const header = rows[0] || []
  const isSep = (r: string[]) => r.every(c => /^[-:]+$/.test(c))
  const body = rows.slice(1).filter(r => !isSep(r))

  return (
    <div style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--border)', fontWeight: 500, color: 'var(--text)', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '5px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: ci === 0 ? 'var(--text)' : 'var(--muted)', verticalAlign: 'top' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}