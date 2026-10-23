import { useState } from 'react'
import { ChunkBadge, QueryInput, RagPage, ResultRow } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { BM25, EVAL_SET, RRF_K, idfOf, rankRows, scoreAll } from '../utils/ragModel.js'

const TOP = 5
const PRESETS = [
  '책을 늦게 돌려주면 어떻게 되나요?',
  'DVD도 대출되나요?',
  '차를 가져가면 주차비가 얼마예요?',
  '휴관일에도 책을 반납할 수 있나요?',
]

const TERMS = {
  1: [
    ['BM25', '키워드 검색의 표준 점수. 검색어가 청크에 많이 나올수록(TF), 다른 청크엔 드물수록(IDF) 점수가 높다. 너무 긴 청크는 길이로 나눠 불리하지 않게 한다.'],
    ['IDF', `Inverse Document Frequency. 그 말이 들어 있는 청크가 적을수록 커진다. '책'처럼 어디에나 있는 말보다 'DVD'처럼 드문 말이 중요하다. (k1 = ${BM25.k1}, b = ${BM25.b})`],
    ['희소 검색 (Sparse)', '어휘 크기만 한 벡터에서 대부분이 0인 표현(단어가 있으면 값이 있음)으로 검색하는 방식. BM25가 대표적이다.'],
  ],
  2: [
    ['밀집 검색 (Dense)', '임베딩 벡터(모든 칸에 값이 있음)의 코사인 유사도로 검색하는 방식. 표현이 달라도 뜻이 비슷하면 찾지만, 고유명사·숫자·코드처럼 정확히 같아야 하는 말에 약하다.'],
  ],
  3: [
    ['RRF', `Reciprocal Rank Fusion. 각 검색 결과의 순위 r마다 1/(k + r)을 더해 합친다(k = ${RRF_K}). 점수 단위가 다른 검색기도 순위만으로 공정하게 합칠 수 있다.`],
    ['가중합 (Weighted sum)', '각 점수를 0~1로 맞춘(min-max 정규화) 뒤 α × 벡터 + (1 − α) × BM25로 합친다. α를 질문 유형에 맞게 조절해야 한다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

const rankText = (r) => (Number.isFinite(r) ? r : '—')

// 5. 하이브리드 검색 (로그인 불필요)
export default function RagHybrid() {
  const [query, setQuery] = useState(PRESETS[0])
  const [fusion, setFusion] = useState('rrf')
  const [alpha, setAlpha] = useState(0.5)
  const { q, terms, rows } = scoreAll(query, { alpha })
  const relevant = EVAL_SET.find((it) => it.q === query)?.relevant ?? []
  const bm = rankRows(rows, 'bm25').filter((r) => r.bm25 > 0).slice(0, TOP)
  const vec = rankRows(rows, 'vector').slice(0, TOP)
  const fused = rankRows(rows, fusion)
  const maxBm = Math.max(1e-9, ...bm.map((r) => r.bm25))
  const shown = fused.filter((r, i) => i < TOP || r.bmRank <= TOP || r.vecRank <= TOP)

  return (
    <RagPage path="/rag/hybrid"
             intro="키워드 검색은 같은 단어를 정확히 찾고, 벡터 검색은 다른 말이라도 뜻이 비슷한 것을 찾습니다. 서로 놓치는 것이 달라서 둘을 함께 돌리고 순위를 합치면 한쪽만 쓸 때보다 안정적입니다. 예시마다 어느 쪽이 정답을 찾는지 비교해 보세요.">
      <QueryInput value={query} onChange={setQuery} presets={PRESETS} />

      <Stage step="1" title={`키워드 검색 (BM25) — ${bm.length}개 일치`}
             desc="조사를 뗀 검색어가 청크에 그대로 있어야 점수가 난다. 아래는 검색어별 IDF(드물수록 큼)다.">
        <div className="d-flex flex-wrap gap-1 small mb-2">
          {terms.length ? terms.map((t) => (
            <span key={t} className="border rounded px-2">{t} <span className="font-monospace text-body-secondary">{idfOf(t) ? idfOf(t).toFixed(2) : '색인에 없음'}</span></span>
          )) : <span className="text-body-secondary">검색어가 없습니다.</span>}
        </div>
        {bm.length ? (
          <ol className="list-group list-group-flush mb-0">
            {bm.map((r, i) => <ResultRow key={r.chunk.id} rank={i + 1} chunk={r.chunk} score={r.bm25} max={maxBm} digits={2} good={relevant.includes(r.chunk.docId)} />)}
          </ol>
        ) : <p className="small text-body-secondary mb-0">질문의 낱말이 들어 있는 청크가 하나도 없습니다. 키워드 검색만 쓰면 여기서 끝납니다.</p>}
      </Stage>

      <Stage step="2" title="벡터 검색 (코사인 유사도)"
             desc={`질문 임베딩과 모든 청크 벡터의 코사인 유사도를 계산한다. 질문에서 찾은 개념(${q.concepts.join(', ') || '없음'})이 벡터에 들어 있어 표현이 달라도 가까워진다.`}>
        <ol className="list-group list-group-flush mb-0">
          {vec.map((r, i) => <ResultRow key={r.chunk.id} rank={i + 1} chunk={r.chunk} score={r.vector} digits={3} good={relevant.includes(r.chunk.docId)} />)}
        </ol>
      </Stage>

      <Stage step="3" title={`순위 합치기 — ${fusion === 'rrf' ? 'RRF' : `가중합 (α = ${alpha})`}`}
             desc={`두 목록의 순위를 합쳐 최종 후보를 만든다. 한쪽에서만 높은 청크보다 양쪽에서 고르게 높은 청크가 위로 온다. 굵은 줄이 상위 ${TOP}개다.`}>
        <div className="d-flex flex-wrap align-items-end gap-3 mb-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="합치는 방법">
            <button type="button" className={`btn btn-outline-secondary ${fusion === 'rrf' ? 'active' : ''}`} aria-pressed={fusion === 'rrf'}
                    onClick={() => setFusion('rrf')}>RRF</button>
            <button type="button" className={`btn btn-outline-secondary ${fusion === 'weighted' ? 'active' : ''}`} aria-pressed={fusion === 'weighted'}
                    onClick={() => setFusion('weighted')}>가중합</button>
          </div>
          {fusion === 'weighted' && (
            <div className="flex-grow-1">
              <label className="form-label small mb-1" htmlFor="hy-alpha">α (벡터 비중): {alpha} — 0이면 BM25만, 1이면 벡터만</label>
              <input id="hy-alpha" type="range" className="form-range" min="0" max="1" step="0.1"
                     value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
            </div>
          )}
        </div>
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-0">
            <thead className="text-nowrap">
              <tr>
                <th>최종</th><th>청크</th><th className="text-end">BM25 순위</th><th className="text-end">벡터 순위</th>
                <th className="text-end">{fusion === 'rrf' ? 'RRF 점수' : '가중합 점수'}</th><th>계산</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const finalRank = fused.indexOf(r) + 1
                return (
                  <tr key={r.chunk.id} className={finalRank <= TOP ? 'fw-bold' : 'text-body-secondary'}>
                    <td>{finalRank}</td>
                    <td className="text-nowrap"><ChunkBadge chunk={r.chunk} />{relevant.includes(r.chunk.docId) && <span className="badge text-bg-success ms-1">정답</span>}</td>
                    <td className="text-end font-monospace">{rankText(r.bmRank)}</td>
                    <td className="text-end font-monospace">{r.vecRank}</td>
                    <td className="text-end font-monospace">{(fusion === 'rrf' ? r.rrf : r.weighted).toFixed(4)}</td>
                    <td className="font-monospace small text-nowrap fw-normal">
                      {fusion === 'rrf'
                        ? `${Number.isFinite(r.bmRank) ? `1/(${RRF_K}+${r.bmRank}) + ` : ''}1/(${RRF_K}+${r.vecRank})`
                        : `${alpha}×벡터 + ${(1 - alpha).toFixed(1)}×BM25`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Stage>
    </RagPage>
  )
}
