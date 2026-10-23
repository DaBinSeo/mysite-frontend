import { useState } from 'react'
import { ChunkBadge, QueryInput, RagPage } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { EVAL_SET, keyTerms, mmr, rerank } from '../utils/ragModel.js'

const CANDIDATES = 10
const PRESETS = [
  '책을 잃어버리면 어떻게 하나요?',
  '연장은 몇 번까지 되나요?',
  '책 몇 권 빌릴 수 있어요?',
  '노트북 쓸 수 있는 자리가 있나요?',
]

const TERMS = {
  1: [
    ['2단계 검색 (Retrieve → Rerank)', '빠르지만 거친 검색으로 후보를 넉넉히(수십~수백 개) 뽑고, 느리지만 정확한 모델로 후보만 다시 채점한다. 둘 다 정확한 모델로 하기엔 청크가 너무 많기 때문이다.'],
  ],
  2: [
    ['바이 인코더 (Bi-encoder)', '질문과 청크를 따로 임베딩해 벡터만 비교한다. 청크 벡터를 미리 계산해 둘 수 있어 빠르지만, 둘을 함께 보지 못해 세밀한 관계를 놓친다(5단계 벡터 검색).'],
    ['크로스 인코더 (Cross-encoder)', '질문과 청크를 한 입력으로 붙여 모델에 넣고 관련도 점수 하나를 낸다. 단어 사이 관계까지 보므로 정확하지만, 후보마다 모델을 돌려야 해 느리다. 여기서는 핵심어 포함 비율(IDF 가중)과 근접도로 흉내 냈다.'],
  ],
  3: [
    ['MMR', 'Maximal Marginal Relevance. 다음 근거를 고를 때 λ × 관련도 − (1 − λ) × (이미 고른 근거와의 최대 유사도)가 가장 큰 것을 고른다. 같은 내용이 반복되는 근거를 줄여 프롬프트 자리를 아낀다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

function Move({ before, after }) {
  const d = before - after
  if (!d) return <span className="text-body-secondary">–</span>
  return d > 0 ? <span className="text-success fw-bold">▲{d}</span> : <span className="text-danger">▼{-d}</span>
}

// 6. 재순위화·다양성 (로그인 불필요)
export default function RagRerank() {
  const [query, setQuery] = useState(PRESETS[0])
  const [lambda, setLambda] = useState(0.7)
  const [k, setK] = useState(3)
  const { q, before, after } = rerank(query, { candidates: CANDIDATES })
  const need = keyTerms(q)
  const relevant = EVAL_SET.find((it) => it.q === query)?.relevant ?? []
  const picked = mmr(after, k, lambda)
  const plainTop = after.slice(0, k)
  const docCount = (items) => new Set(items.map((it) => it.chunk.docId)).size

  return (
    <RagPage path="/rag/rerank"
             intro="하이브리드 검색은 빠르지만 질문과 청크를 깊이 비교하지는 않습니다. 상위 후보만 골라 질문과 함께 다시 채점하면 순서가 바로잡히고, 마지막으로 비슷한 근거가 겹치지 않게 고르면 프롬프트에 넣을 최종 근거가 정해집니다.">
      <QueryInput value={query} onChange={setQuery} presets={PRESETS} />

      <Stage step="1" title={`후보 뽑기 — 하이브리드 상위 ${before.length}개`}
             desc="5단계 하이브리드 검색(RRF) 순서 그대로다. 리랭커는 이 후보 안에서만 순서를 바꾸므로, 여기에 없는 청크는 아무리 관련 있어도 되살아나지 않는다.">
        <div className="d-flex flex-wrap gap-1">
          {before.map((r) => (
            <span key={r.chunk.id} className="small">
              <span className="text-body-secondary me-1">{r.before}</span><ChunkBadge chunk={r.chunk} />
              {relevant.includes(r.chunk.docId) && <span className="badge text-bg-success ms-1">정답</span>}
            </span>
          ))}
        </div>
      </Stage>

      <Stage step="2" title="리랭커로 다시 채점"
             desc="질문의 핵심어·개념이 청크에 얼마나 들어 있는지(포함률, 드문 말일수록 가중), 맞은 낱말들이 얼마나 붙어 있는지(근접도)를 함께 본다. 점수 = 0.7 × 포함률 + 0.3 × 근접도.">
        <div className="small mb-2">
          핵심어: {need.map((t) => <span key={t} className="rag-token me-1">{t}</span>)}
        </div>
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-0">
            <thead className="text-nowrap">
              <tr><th>새 순위</th><th>변화</th><th>청크</th><th>맞은 핵심어</th><th className="text-end">포함률</th><th className="text-end">근접도</th><th className="text-end">점수</th></tr>
            </thead>
            <tbody>
              {after.map((r, i) => (
                <tr key={r.chunk.id} className={i < k ? '' : 'text-body-secondary'}>
                  <td className="fw-bold">{i + 1}</td>
                  <td className="text-nowrap"><Move before={r.before} after={i + 1} /></td>
                  <td>
                    <ChunkBadge chunk={r.chunk} />{relevant.includes(r.chunk.docId) && <span className="badge text-bg-success ms-1">정답</span>}
                    <div className="text-body-secondary rag-clip" title={r.chunk.text}>{r.chunk.text}</div>
                  </td>
                  <td>{r.matched.map((t) => <span key={t} className="badge text-bg-light border me-1">{t}</span>)}</td>
                  <td className="text-end font-monospace">{r.coverage.toFixed(2)}</td>
                  <td className="text-end font-monospace">{r.proximity.toFixed(2)}</td>
                  <td className="text-end font-monospace fw-bold">{r.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stage>

      <Stage step="3" title={`다양성 고려 선택 (MMR) — ${k}개 고르기`}
             desc="점수 순으로 위에서 k개를 자르면 같은 문서의 비슷한 청크만 들어갈 수 있다. MMR은 관련도가 높으면서 이미 고른 근거와 덜 비슷한 것을 하나씩 고른다.">
        <div className="row g-3 align-items-end mb-2">
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="rr-lambda">λ (관련도 비중): {lambda}</label>
            <input id="rr-lambda" type="range" className="form-range" min="0" max="1" step="0.1"
                   value={lambda} onChange={(e) => setLambda(Number(e.target.value))} />
          </div>
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="rr-k">고를 개수: {k}</label>
            <input id="rr-k" type="range" className="form-range" min="1" max="5"
                   value={k} onChange={(e) => setK(Number(e.target.value))} />
          </div>
        </div>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">점수 순 상위 {k}개 — 문서 {docCount(plainTop)}종</div>
            <ol className="small ps-3 mb-0">
              {plainTop.map((r) => <li key={r.chunk.id} className="mb-1"><ChunkBadge chunk={r.chunk} /> <span className="text-body-secondary">{r.chunk.text}</span></li>)}
            </ol>
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">MMR로 고른 {k}개 — 문서 {docCount(picked.map((p) => p.it))}종</div>
            <ol className="small ps-3 mb-0">
              {picked.map((p) => (
                <li key={p.it.chunk.id} className="mb-1">
                  <ChunkBadge chunk={p.it.chunk} />
                  <span className="font-monospace text-body-secondary ms-1" title="관련도(0~1로 맞춘 리랭커 점수) / 이미 고른 근거와의 최대 유사도">
                    관련 {p.rel.toFixed(2)} · 중복 {p.redundancy.toFixed(2)}
                  </span>
                  <div className="text-body-secondary">{p.it.chunk.text}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Stage>
    </RagPage>
  )
}
