// LLM 구축 과정 화면들이 함께 쓰는 틀(제목·이전/다음 버튼)과 그림(히트맵·막대·선 그래프·단어 칩)
import { Link } from 'react-router'
import { SPECIALS, VOCAB, pct } from '../utils/llmModel.js'
import { LLM_STEPS, stepTitle } from '../utils/llmSteps.js'
import { useTitle } from '../utils/useTitle.js'

// 화면 공통 틀: 단계 제목·소개 → 내용 → 이전/다음 단계 버튼
export function LlmPage({ path, intro, children }) {
  const step = LLM_STEPS.find((s) => s.path === path)
  useTitle(`LLM ${stepTitle(step)}`)
  return (
    <div className="container my-3 pb-5">
      <h4 className="border-bottom pb-2">{stepTitle(step)}</h4>
      <p className="text-body-secondary small">
        {intro} 모든 계산은 브라우저에서 하는 학습용 축소판입니다.
      </p>
      {children}
      <LlmStepNav path={path} />
    </div>
  )
}

export function LlmStepNav({ path }) {
  const i = LLM_STEPS.findIndex((s) => s.path === path)
  const prev = LLM_STEPS[i - 1]
  const next = LLM_STEPS[i + 1]
  return (
    <nav className="d-flex flex-wrap gap-2 mt-4 pt-3 border-top" aria-label="LLM 구축 단계 이동">
      {prev && <Link className="btn btn-outline-secondary btn-sm" to={prev.path}>← {stepTitle(prev)}</Link>}
      {next && <Link className="btn btn-primary btn-sm ms-auto" to={next.path}>{stepTitle(next)} →</Link>}
    </nav>
  )
}

// 단어 칩. 특수 토큰은 어둡게 칠한다
export function WordChip({ id, className = '', title, style }) {
  const special = id < SPECIALS.length
  return (
    <span className={`rag-token ${special ? 'llm-token-special' : ''} ${className}`} title={title} style={style}>
      {VOCAB.list[id]}
    </span>
  )
}

const POS = [176, 42, 55]
const NEG = [11, 94, 215]
const SEQ = [20, 108, 67]

// 값 → 배경색. 숫자를 함께 쓰는 칸은 글자가 어두우므로 60%까지만 진하게 한다
function heatColor(v, limit, sequential, withText) {
  if (!Number.isFinite(v)) return undefined
  const a = Math.min(1, Math.abs(v) / limit) * (withText ? 0.6 : 1)
  const [r, g, b] = sequential ? SEQ : v >= 0 ? POS : NEG
  return `rgba(${r},${g},${b},${a.toFixed(3)})`
}

// 행렬 히트맵. sequential이면 0~최대(초록), 아니면 음수 파랑·양수 빨강. -Infinity 칸은 마스크로 표시한다
export function Heatmap({ rows, rowLabels, colLabels, max, sequential = false, showValues = false, digits = 2, label, activeRow }) {
  const finite = rows.flat().filter(Number.isFinite)
  const limit = max ?? Math.max(1e-9, ...finite.map(Math.abs))
  return (
    <div className="table-responsive">
      <table className={`llm-grid small font-monospace mb-0 ${showValues ? 'llm-grid-values' : ''}`} aria-label={label}>
        {colLabels && (
          <thead>
            <tr>
              {rowLabels && <th scope="col"><span className="visually-hidden">행</span></th>}
              {colLabels.map((c, j) => <th key={j} scope="col">{c}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i === activeRow ? 'llm-grid-active' : ''}>
              {rowLabels && <th scope="row" className="text-nowrap text-end">{rowLabels[i]}</th>}
              {row.map((v, j) => (
                <td key={j} className={Number.isFinite(v) ? '' : 'llm-grid-masked'}
                    style={{ background: heatColor(v, limit, sequential, showValues) }}
                    title={Number.isFinite(v) ? v.toFixed(3) : '마스크 (−∞)'}>
                  {showValues && (Number.isFinite(v) ? v.toFixed(digits) : '−∞')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 가로 막대 목록. tone: muted(흐리게)·success·danger, 없으면 기본 파랑. label이 없으면 막대와 값만 그린다
export function Bars({ items, max, format = pct }) {
  const limit = max ?? Math.max(1e-9, ...items.map((it) => Math.abs(it.value)))
  return (
    <div className="llm-bars small">
      {items.map((it) => (
        <div key={it.key} className={`llm-bar-row ${it.label == null ? 'llm-bar-nolabel' : ''} ${it.tone === 'muted' ? 'llm-bar-muted' : ''}`}>
          {it.label != null && (
            <div className="llm-bar-label text-truncate" title={typeof it.label === 'string' ? it.label : undefined}>{it.label}</div>
          )}
          <div className="llm-bar-track">
            <div className={`llm-bar-fill ${it.tone ? `llm-bar-${it.tone}` : ''}`}
                 style={{ width: `${Math.min(100, (Math.abs(it.value) / limit) * 100)}%` }} />
          </div>
          <div className="llm-bar-value font-monospace">{format(it.value)}</div>
        </div>
      ))}
    </div>
  )
}

const CHART_W = 600
const PAD = { left: 44, right: 12, top: 10, bottom: 24 }

// 선 그래프. series: [{ label, color, points: [y, …] }], x는 0부터 xMax까지
export function LineChart({ series, xMax, yMax, height = 180, format = (v) => v.toFixed(2), label, marker }) {
  const w = CHART_W - PAD.left - PAD.right
  const h = height - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (i / Math.max(1, xMax)) * w
  const top = Math.max(yMax, 1e-9) // 0으로 나누지 않게
  const y = (v) => PAD.top + h - (Math.min(v, top) / top) * h
  return (
    <figure className="mb-0">
      <svg className="llm-chart" viewBox={`0 0 ${CHART_W} ${height}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y(yMax * f)} y2={y(yMax * f)} className="llm-chart-grid" />
            <text x={PAD.left - 6} y={y(yMax * f) + 4} textAnchor="end" className="llm-chart-text">{format(yMax * f)}</text>
          </g>
        ))}
        <text x={PAD.left} y={height - 6} className="llm-chart-text">0</text>
        <text x={CHART_W - PAD.right} y={height - 6} textAnchor="end" className="llm-chart-text">{xMax}</text>
        {marker !== undefined && (
          <line x1={x(marker)} x2={x(marker)} y1={PAD.top} y2={PAD.top + h} className="llm-chart-marker" />
        )}
        {series.map((s) => s.points.length > 0 && (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
                    points={s.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
      </svg>
      <figcaption className="d-flex flex-wrap gap-3 small text-body-secondary">
        {series.map((s) => (
          <span key={s.label}><span className="llm-legend" style={{ background: s.color }} /> {s.label}</span>
        ))}
      </figcaption>
    </figure>
  )
}
