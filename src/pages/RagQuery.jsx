import { useState } from 'react'
import { ResultRow, QueryInput, RagPage } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import {
  CONCEPTS, EVAL_SET, RRF_K, analyzeQuery, expandTerms, normalizeTerm, rankRows, scoreAll, splitQuery, suggestFilter, termsOf,
} from '../utils/ragModel.js'
import { tokenize } from '../utils/rag.js'

const TOP = 4
const PRESETS = [
  '책을 늦게 돌려주면 어떻게 되나요?',
  '연체료는 얼마고 전자책은 몇 권까지 빌려요?',
  '차를 가져가면 주차비가 얼마예요?',
  '아이와 함께 갈 만한 프로그램이 있나요?',
]

const TERMS = {
  1: [
    ['형태소 분석', '말을 뜻을 가진 가장 작은 단위로 나누고 조사·어미를 떼는 것. 한국어 키워드 검색은 이것 없이는 \'책을\'과 \'책은\'을 다른 말로 본다. 여기서는 조사 목록으로 흉내 냈다.'],
    ['불용어 (Stopword)', '\'수\', \'어떻게\'처럼 거의 모든 질문에 나와 검색에 도움이 안 되는 말. 검색어에서 뺀다.'],
  ],
  2: [
    ['질의 확장 (Query expansion)', '질문에 동의어·관련어를 덧붙여 다른 표현으로 쓰인 문서도 찾게 하는 것. 사전을 쓰거나 LLM에게 만들게 한다.'],
    ['어휘 불일치', '질문은 \'늦게 돌려주면\', 문서는 \'연체\'처럼 같은 뜻을 다른 말로 쓰는 문제. 키워드 검색의 가장 큰 약점이다.'],
  ],
  3: [
    ['멀티 쿼리 (Multi-query)', '한 질문을 여러 하위 질문으로 나눠 각각 검색하고 결과를 합치는 것. 질문 하나에 주제가 둘 이상일 때 한쪽만 찾는 문제를 줄인다.'],
    ['HyDE', 'Hypothetical Document Embeddings. LLM에게 그럴듯한 가상 답변을 먼저 쓰게 하고, 질문 대신 그 답변을 임베딩해 검색하는 방법. 질문보다 문서와 문체가 비슷해 잘 맞는다.'],
  ],
  4: [
    ['메타데이터 필터', '분류·날짜·권한 같은 메타데이터 조건으로 검색 대상을 먼저 줄이는 것. 정확해지지만 필터를 잘못 고르면 정답이 아예 빠진다.'],
    ['셀프 쿼리 (Self-query)', 'LLM이 질문을 읽고 검색어와 필터 조건(예: 분류 = 전자책)을 함께 만들어 내는 방식.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

function relevantOf(query) {
  return EVAL_SET.find((it) => it.q === query)?.relevant ?? []
}

function TopList({ rows, keyName, relevant, digits = 2 }) {
  if (!rows.length) return <p className="small text-body-secondary mb-0">맞는 청크가 없습니다.</p>
  const max = Math.max(1e-9, ...rows.map((r) => r[keyName]))
  return (
    <ol className="list-group list-group-flush mb-0">
      {rows.map((r, i) => (
        <ResultRow key={r.chunk.id} rank={i + 1} chunk={r.chunk} score={r[keyName]} max={max} digits={digits}
                   good={relevant.includes(r.chunk.docId)} />
      ))}
    </ol>
  )
}

// 4. 질의 변환 (로그인 불필요)
export default function RagQuery() {
  const [query, setQuery] = useState(PRESETS[0])
  const [useFilter, setUseFilter] = useState(true)
  const q = analyzeQuery(query)
  const tokens = tokenize(query)
  const relevant = relevantOf(query)

  const plain = rankRows(scoreAll(query).rows, 'bm25').filter((r) => r.bm25 > 0).slice(0, TOP)
  const expanded = rankRows(scoreAll(query, { expand: true }).rows, 'bm25').filter((r) => r.bm25 > 0).slice(0, TOP)

  const subs = splitQuery(query)
  const subResults = subs.map((s) => ({ s, rows: rankRows(scoreAll(s).rows, 'rrf').slice(0, 2) }))
  // 하위 질문 결과를 RRF로 합친다
  const fused = new Map()
  subs.forEach((s) => rankRows(scoreAll(s).rows, 'rrf').forEach((r, i) => {
    const prev = fused.get(r.chunk.id) ?? { chunk: r.chunk, score: 0 }
    fused.set(r.chunk.id, { ...prev, score: prev.score + 1 / (RRF_K + i + 1) })
  }))
  const multi = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, TOP)
  const single = rankRows(scoreAll(query).rows, 'rrf').slice(0, TOP)

  const filter = suggestFilter(q)
  const filtered = filter ? rankRows(scoreAll(query, { filter }).rows, 'rrf').slice(0, TOP) : []

  return (
    <RagPage path="/rag/query"
             intro="사람이 쓰는 질문은 검색하기 좋은 모양이 아닙니다. 조사가 붙고, 문서와 다른 말을 쓰고, 한 문장에 여러 가지를 묻습니다. 검색 전에 질문을 다듬으면 같은 검색기로도 결과가 좋아집니다.">
      <QueryInput value={query} onChange={setQuery} presets={PRESETS} />

      <Stage step="1" title={`정규화 — 토큰 ${tokens.length}개 → 검색어 ${q.terms.length}개`}
             desc="질문을 토큰으로 나누고 조사·어미를 떼어 문서의 낱말과 맞춘다. 취소선은 불용어로 빠진 토큰이다.">
        <div className="d-flex flex-wrap gap-2 small">
          {tokens.map((t, i) => {
            const terms = termsOf(t)
            const norm = normalizeTerm(t)
            return (
              <span key={i} className="border rounded px-2 py-1">
                {terms.length ? (
                  <>{t}{norm !== t && <> → <strong>{norm}</strong></>}</>
                ) : <span className="text-decoration-line-through text-body-secondary">{t}</span>}
              </span>
            )
          })}
        </div>
      </Stage>

      <Stage step="2" title={`동의어 확장 — 개념 ${q.concepts.length}개 추가`}
             desc="개념 사전에서 질문의 표현이 속한 개념을 찾아 그 대표어를 검색어에 덧붙인다. 키워드 검색(BM25) 결과가 어떻게 바뀌는지 비교해 보세요.">
        <div className="d-flex flex-wrap gap-1 small mb-3">
          {q.concepts.length ? q.concepts.map((c) => (
            <span key={c} className="badge text-bg-primary" title={`사전: ${CONCEPTS[c].join(', ')}`}>+ {c}</span>
          )) : <span className="text-body-secondary">사전에서 찾은 개념이 없습니다.</span>}
          <span className="ms-2 text-body-secondary">최종 검색어: {expandTerms(q).join(', ') || '없음'}</span>
        </div>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">원래 검색어로 BM25</div>
            <TopList rows={plain} keyName="bm25" relevant={relevant} />
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">확장한 검색어로 BM25</div>
            <TopList rows={expanded} keyName="bm25" relevant={relevant} />
          </div>
        </div>
      </Stage>

      <Stage step="3" title={`질문 쪼개기 — 하위 질문 ${subs.length}개`}
             desc="'그리고'·물음표·쉼표 등에서 질문을 나눠 각각 하이브리드 검색하고, 결과 순위를 RRF로 합친다. 주제가 둘인 질문(두 번째 예시)에서 차이가 크다.">
        <div className="row g-3 mb-3">
          {subResults.map(({ s, rows }, i) => (
            <div key={i} className="col-12 col-md-6">
              <div className="small fw-bold mb-1">하위 질문 {i + 1}: {s}</div>
              <TopList rows={rows} keyName="rrf" relevant={relevant} digits={4} />
            </div>
          ))}
        </div>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">통째로 한 번 검색</div>
            <TopList rows={single} keyName="rrf" relevant={relevant} digits={4} />
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">하위 질문 결과를 합침</div>
            <TopList rows={multi} keyName="score" relevant={relevant} digits={4} />
          </div>
        </div>
      </Stage>

      <Stage step="4" title="메타데이터 필터 추출"
             desc="질문에 분류를 대표하는 말이 있으면 그 분류의 문서만 검색하도록 필터를 붙인다. 후보가 줄어 정확해지지만, 필터가 틀리면 정답이 아예 빠지므로 끌 수 있게 해 둔다.">
        {filter ? (
          <>
            <div className="form-check form-switch mb-2 small">
              <input id="q-filter" type="checkbox" className="form-check-input" role="switch" checked={useFilter}
                     onChange={(e) => setUseFilter(e.target.checked)} />
              <label className="form-check-label" htmlFor="q-filter">
                필터 적용: <code>분류 = {filter.value}</code> (질문의 &lsquo;{filter.because}&rsquo; 개념에서 추출)
              </label>
            </div>
            <TopList rows={useFilter ? filtered : single} keyName="rrf" relevant={relevant} digits={4} />
          </>
        ) : (
          <p className="small text-body-secondary mb-0">이 질문에서는 분류 필터를 추출하지 못했습니다. 주차·전자책·행사 예시를 눌러 보세요.</p>
        )}
      </Stage>
    </RagPage>
  )
}
