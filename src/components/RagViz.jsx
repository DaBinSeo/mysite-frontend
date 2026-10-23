// RAG 구축 과정 화면들이 함께 쓰는 틀(제목·이전/다음 버튼)과 작은 부품(청크 배지·질문 입력·결과 목록·산점도)
import { useId } from 'react'
import { RAG_STEPS } from '../utils/ragSteps.js'
import { docColor } from '../utils/ragModel.js'
import { StepNav, StepPage } from './VizStage.jsx'

const RAG_QUERY_MAX_LENGTH = 100

export function RagPage({ path, intro, children }) {
  return <StepPage steps={RAG_STEPS} prefix="RAG" path={path} intro={intro}>{children}</StepPage>
}

// 자체 틀을 쓰는 화면(청킹·임베딩·벡터 저장)의 이전/다음 버튼
export function RagStepNav({ path }) {
  return <StepNav steps={RAG_STEPS} prefix="RAG" path={path} />
}

// 청크 배지: 같은 문서의 청크는 같은 색. 마우스를 올리면 문서 제목이 보인다
export function ChunkBadge({ chunk, className = '' }) {
  return (
    <span className={`badge font-monospace ${className}`} style={{ background: docColor(chunk.docId) }} title={chunk.title}>
      {chunk.id}
    </span>
  )
}

// 질문 입력칸 + 예시 질문 버튼
export function QueryInput({ value, onChange, presets = [], label = '질문' }) {
  const id = useId()
  return (
    <div className="card mb-3">
      <div className="card-body">
        <label className="form-label small mb-1" htmlFor={id}>{label}</label>
        <input id={id} className="form-control form-control-sm mb-2" value={value} maxLength={RAG_QUERY_MAX_LENGTH}
               onChange={(e) => onChange(e.target.value)} placeholder="도서관 이용에 대해 물어보세요" />
        <div className="d-flex flex-wrap gap-1 align-items-center">
          <span className="small text-body-secondary me-1">예시</span>
          {presets.map((p) => (
            <button key={p} type="button" className={`btn btn-sm ${p === value ? 'btn-secondary' : 'btn-outline-secondary'}`}
                    aria-pressed={p === value} onClick={() => onChange(p)}>{p}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// 검색 결과 한 줄: 순위 · 청크 배지 · 본문 · 점수 막대. good이면 정답 문서 표시
export function ResultRow({ rank, chunk, score, max = 1, digits = 3, good, muted, extra }) {
  return (
    <li className={`list-group-item px-2 py-1 small ${muted ? 'opacity-50' : ''}`}>
      <div className="d-flex align-items-center gap-2">
        <span className="text-body-secondary font-monospace rag-rank">{rank}</span>
        <ChunkBadge chunk={chunk} />
        {good && <span className="badge text-bg-success" title="평가 세트의 정답 문서">정답</span>}
        {extra}
        {score != null && (
          <span className="ms-auto d-flex align-items-center gap-2">
            <span className="rag-mini-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, score / max)) * 100}%`, background: docColor(chunk.docId) }} />
            </span>
            <span className="font-monospace rag-score">{score.toFixed(digits)}</span>
          </span>
        )}
      </div>
      <div className="text-body-secondary text-truncate" title={chunk.text}>{chunk.text}</div>
    </li>
  )
}

// 2차원 산점도. points: [{ key, x, y, color, label, title, dim, ring }], marks: 중심점(×), star: 질문 위치
export function Scatter({ points, marks = [], star, lines = [], label, height = 300 }) {
  if (!points.length) return null
  const W = 480
  const H = height
  const PAD = 24
  const all = [...points, ...marks, ...(star ? [star] : [])]
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = (x) => (maxX === minX ? W / 2 : PAD + ((x - minX) / (maxX - minX)) * (W - PAD * 2))
  const sy = (y) => (maxY === minY ? H / 2 : H - PAD - ((y - minY) / (maxY - minY)) * (H - PAD * 2))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-100 border rounded bg-body-tertiary" role="img" aria-label={label}>
      {lines.map((l, i) => (
        <line key={i} x1={sx(l.from.x)} y1={sy(l.from.y)} x2={sx(l.to.x)} y2={sy(l.to.y)}
              stroke="#212529" strokeDasharray="4 3" strokeOpacity="0.6" />
      ))}
      {points.map((p) => (
        <g key={p.key} opacity={p.dim ? 0.3 : 1}>
          {p.ring && <circle cx={sx(p.x)} cy={sy(p.y)} r="15" fill="none" stroke="#212529" strokeWidth="2" />}
          <circle cx={sx(p.x)} cy={sy(p.y)} r="10" fill={p.color} />
          <text x={sx(p.x)} y={sy(p.y)} dy="0.35em" textAnchor="middle" fontSize="9" fill="#fff">{p.label}</text>
          <title>{p.title}</title>
        </g>
      ))}
      {marks.map((m) => (
        <g key={m.key} opacity={m.dim ? 0.3 : 1}>
          <text x={sx(m.x)} y={sy(m.y)} dy="0.35em" textAnchor="middle" fontSize="22" fontWeight="bold" fill={m.color}>×</text>
          <title>{m.title}</title>
        </g>
      ))}
      {star && (
        <g>
          <text x={sx(star.x)} y={sy(star.y)} dy="0.35em" textAnchor="middle" fontSize="24">★</text>
          <title>{star.title}</title>
        </g>
      )}
    </svg>
  )
}

// 0~1 값 표시용 작은 배지(지표 표에서 씀). 높을수록 진한 초록
export function ScoreCell({ value, digits = 2 }) {
  return (
    <td className="font-monospace text-end" style={{ background: `rgba(20,108,67,${(value * 0.45).toFixed(3)})` }}>
      {value.toFixed(digits)}
    </td>
  )
}
