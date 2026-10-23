import { useMemo, useState } from 'react'
import { ChunkBadge, QueryInput, RagPage } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import {
  KB_CHUNKS, KB_DOCS, LATENCY, answer, answerText, bodyOf, cacheLookup, denseEmbed, diffChunks, latency, rankRows, scoreAll,
} from '../utils/ragModel.js'

const K = 3
const DOC_MAX_LENGTH = 600
const HOURS_DOC = KB_DOCS.find((d) => d.id === 'hours')
const STAGE_COLORS = { embed: '#6f42c1', search: '#0b5ed7', rerank: '#b35309', prefill: '#0f766e', decode: '#c2185b' }
const PERM_PRESETS = ['보존서고 자료는 어떻게 신청하나요?', '지하 2층에는 무엇이 있나요?']
const CACHE_SEED = ['책은 몇 권까지 빌릴 수 있나요?', '열람실은 몇 시까지 하나요?', '주차는 무료인가요?']
const CACHE_PRESETS = ['책 몇 권 빌릴 수 있어요?', '전자책은 몇 권까지 빌릴 수 있나요?', '주차비 내야 하나요?']

// 캐시에 미리 저장해 둔 질문·답 (화면을 처음 받을 때 한 번 만든다)
const CACHE = CACHE_SEED.map((q) => ({ q, vector: denseEmbed(q), a: answerText(answer(q)) }))

const TERMS = {
  1: [
    ['증분 색인 (Incremental indexing)', '문서가 바뀌면 전체를 다시 만들지 않고, 바뀐 청크만 다시 임베딩해 바꿔 끼우는 것. 청크 내용의 해시로 바뀐 것을 찾는다.'],
    ['삭제 전파', '원본에서 지운 문서·청크를 인덱스에서도 지우는 것. 놓치면 없어진 규정이 계속 검색된다.'],
  ],
  2: [
    ['접근 제어 (ACL)', '청크마다 볼 수 있는 사용자·그룹을 메타데이터로 저장해 두고, 검색할 때 질문한 사람의 권한으로 거르는 것. LLM에게 "직원 문서는 말하지 마"라고 지시하는 것으로는 막을 수 없다.'],
    ['사전 필터 / 사후 필터', '권한으로 먼저 거른 뒤 top-k를 고르는 것(사전)과, top-k를 고른 뒤 거르는 것(사후). 사후 필터는 결과가 k개보다 적어질 수 있다.'],
  ],
  3: [
    ['시맨틱 캐시', '예전 질문과 뜻이 비슷한(임베딩 유사도가 기준 이상인) 질문이 오면 검색·생성 없이 저장한 답을 돌려주는 것. 비용과 지연 시간이 크게 줄지만, 기준이 낮으면 다른 질문에 엉뚱한 답을 준다.'],
    ['캐시 무효화', '문서가 바뀌면 그 문서를 근거로 만든 캐시 답도 지워야 한다.'],
  ],
  4: [
    ['지연 시간 (Latency)', '질문을 보내고 답을 받기까지의 시간. RAG에서는 대부분 LLM이 답을 한 토큰씩 생성하는 데 든다. 스트리밍으로 첫 글자를 빨리 보여 주면 체감 시간이 줄어든다.'],
    ['관측 (Observability)', '질문마다 검색된 청크·점수·프롬프트·답변·지연 시간을 기록해 두는 것. 나쁜 답이 나왔을 때 검색 문제인지 생성 문제인지 추적할 수 있다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

const DIFF_STATUS = {
  same: { label: '그대로 (벡터 재사용)', tone: 'light border' },
  new: { label: '새로 임베딩', tone: 'primary' },
  deleted: { label: '인덱스에서 삭제', tone: 'danger' },
}

// 9. 운영: 증분 색인·권한 필터·시맨틱 캐시·지연 시간 (로그인 불필요)
export default function RagOps() {
  const original = bodyOf(HOURS_DOC)
  const [edited, setEdited] = useState(original.replace('오후 10시까지, 주말', '오후 11시까지, 주말'))
  const [role, setRole] = useState('public')
  const [permQuery, setPermQuery] = useState(PERM_PRESETS[0])
  const [cacheQuery, setCacheQuery] = useState(CACHE_PRESETS[0])
  const [threshold, setThreshold] = useState(0.75)
  const [candidates, setCandidates] = useState(10)
  const [useRerank, setUseRerank] = useState(true)
  const [answerTokens, setAnswerTokens] = useState(80)
  const [hitRate, setHitRate] = useState(0.3)

  const diff = diffChunks(original, edited)
  const counts = Object.fromEntries(Object.keys(DIFF_STATUS).map((s) => [s, diff.rows.filter((r) => r.status === s).length]))

  // 사전 필터: 권한으로 거른 뒤 top-k / 사후 필터: 전체에서 top-k를 고른 뒤 권한으로 거름.
  // 단계마다 자기 입력이 바뀔 때만 다시 계산한다(문서 편집 중에 검색이 다시 돌지 않게)
  const { pre, post, permAnswer } = useMemo(() => ({
    pre: rankRows(scoreAll(permQuery, { role }).rows, 'rrf').slice(0, K),
    post: rankRows(scoreAll(permQuery, { role: 'staff' }).rows, 'rrf').slice(0, K)
      .map((r) => ({ ...r, blocked: role !== 'staff' && r.chunk.access !== 'public' })),
    permAnswer: answer(permQuery, { role }),
  }), [permQuery, role])

  const lookup = useMemo(() => cacheLookup(cacheQuery, CACHE, threshold), [cacheQuery, threshold])
  const fresh = useMemo(() => answerText(answer(cacheQuery)), [cacheQuery])
  const wrongHit = lookup.hit && lookup.hit.a !== fresh

  const contextTokens = 120 + K * 50
  const stages = latency({ candidates, useRerank, contextTokens, answerTokens })
  const full = stages.reduce((s, x) => s + x.ms, 0)
  const avg = hitRate * LATENCY.cache + (1 - hitRate) * full

  return (
    <RagPage path="/rag/ops"
             intro="만든 뒤에도 문서는 계속 바뀌고, 사용자마다 볼 수 있는 문서가 다르고, 같은 질문이 반복됩니다. 서비스로 운영할 때 필요한 네 가지 장치를 살펴봅니다.">
      <Stage step="1" title={`증분 색인 — 새로 임베딩 ${counts.new}개 · 재사용 ${counts.same}개 · 삭제 ${counts.deleted}개`}
             desc="운영 시간 문서를 고쳤다(평일 마감 10시 → 11시). 다시 청킹한 뒤 청크 내용의 해시를 이전과 비교해, 바뀐 청크만 임베딩하고 사라진 청크는 인덱스에서 지운다. 글자 수가 달라지면 청크 경계가 밀려 고치지 않은 뒤 문장까지 다시 임베딩될 수 있다(10시를 9시로 고쳐 보세요).">
        <textarea className="form-control form-control-sm mb-2" rows="4" value={edited} maxLength={DOC_MAX_LENGTH}
                  aria-label="운영 시간 문서 본문" onChange={(e) => setEdited(e.target.value)} />
        <div className="d-flex gap-2 mb-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEdited(original)}>원래대로</button>
          <button type="button" className="btn btn-outline-secondary btn-sm"
                  onClick={() => setEdited(`${original}\n설날과 추석 연휴에는 모든 시설이 쉽니다.`)}>문장 추가해 보기</button>
        </div>
        <ul className="list-unstyled small mb-0">
          {diff.rows.map((r, i) => (
            <li key={`${r.status}-${i}`} className={`d-flex gap-2 align-items-start mb-1 ${r.status === 'deleted' ? 'text-decoration-line-through text-body-secondary' : ''}`}>
              <span className={`badge text-bg-${DIFF_STATUS[r.status].tone} text-nowrap`}>{DIFF_STATUS[r.status].label}</span>
              <span className="font-monospace text-body-secondary text-nowrap">#{r.hash.toString(16).padStart(8, '0')}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </Stage>

      <Stage step="2" title="권한 필터 — 직원용 문서 지키기"
             desc="보존서고 지침은 직원만 볼 수 있는 문서다(1단계에서 붙인 공개 범위 메타데이터). 질문한 사람의 권한으로 검색 대상을 거른다.">
        <div className="btn-group btn-group-sm mb-2" role="group" aria-label="질문하는 사람">
          {[['public', '일반 이용자'], ['staff', '직원']].map(([value, label]) => (
            <button key={value} type="button" className={`btn btn-outline-secondary ${role === value ? 'active' : ''}`}
                    aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>
          ))}
        </div>
        <QueryInput value={permQuery} onChange={setPermQuery} presets={PERM_PRESETS} />
        <div className="row g-3 small">
          <div className="col-12 col-md-6">
            <div className="fw-bold mb-1">사전 필터 (권한으로 거른 뒤 top-{K}) — {pre.length}개</div>
            <ol className="ps-3 mb-0">
              {pre.map((r) => <li key={r.chunk.id}><ChunkBadge chunk={r.chunk} /> <span className="text-body-secondary">{r.chunk.text.slice(0, 40)}…</span></li>)}
            </ol>
          </div>
          <div className="col-12 col-md-6">
            <div className="fw-bold mb-1">사후 필터 (top-{K}를 고른 뒤 거름) — {post.filter((r) => !r.blocked).length}개</div>
            <ol className="ps-3 mb-0">
              {post.map((r) => (
                <li key={r.chunk.id} className={r.blocked ? 'text-decoration-line-through text-body-secondary' : ''}>
                  <ChunkBadge chunk={r.chunk} className={r.blocked ? 'opacity-50' : ''} />
                  {r.blocked && <span className="badge text-bg-danger ms-1">권한 없음</span>} {r.chunk.text.slice(0, 40)}…
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="border rounded p-2 small bg-body-tertiary mt-3">
          <strong>답변 ({role === 'staff' ? '직원' : '일반 이용자'})</strong>: {answerText(permAnswer)}
        </div>
      </Stage>

      <Stage step="3" title={lookup.hit ? `시맨틱 캐시 — 적중 (유사도 ${lookup.hit.sim.toFixed(2)})` : '시맨틱 캐시 — 적중 없음'}
             desc={`예전 질문 ${CACHE_SEED.length}개의 답을 저장해 두었다. 새 질문의 임베딩이 저장된 질문과 기준 이상 비슷하면 검색·생성을 건너뛰고 저장한 답을 준다. 두 번째 예시처럼 말은 비슷해도 답이 다른 질문에 주의하세요.`}>
        <label className="form-label small mb-1" htmlFor="ops-threshold">적중 기준 유사도: {threshold.toFixed(2)}</label>
        <input id="ops-threshold" type="range" className="form-range mb-2" min="0.5" max="0.99" step="0.01"
               value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        <QueryInput value={cacheQuery} onChange={setCacheQuery} presets={CACHE_PRESETS} label="새 질문" />
        <ul className="list-unstyled small mb-2">
          {lookup.scored.map((e) => (
            <li key={e.q} className="d-flex align-items-center gap-2 mb-1">
              <span className={`badge ${e === lookup.hit ? 'text-bg-success' : 'text-bg-light border'}`}>{e === lookup.hit ? '적중' : '저장됨'}</span>
              <span className="text-break">{e.q}</span>
              <span className="rag-mini-bar flex-grow-1" aria-hidden="true">
                <span style={{ width: `${Math.max(0, e.sim) * 100}%`, background: e.sim >= threshold ? '#146c43' : '#6c757d' }} />
              </span>
              <span className="font-monospace rag-score">{e.sim.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="row g-2 small">
          <div className="col-12 col-md-6">
            <div className="fw-bold">캐시가 준 답</div>
            <div className={`border rounded p-2 ${wrongHit ? 'border-danger' : ''}`}>{lookup.hit ? lookup.hit.a : '(적중 없음 → 검색·생성을 실행)'}</div>
          </div>
          <div className="col-12 col-md-6">
            <div className="fw-bold">새로 검색·생성한 답</div>
            <div className="border rounded p-2 bg-body-tertiary">{fresh}</div>
          </div>
        </div>
        {wrongHit && (
          <div className="alert alert-danger small mt-2 mb-0">
            캐시 답이 새로 만든 답과 다릅니다. 기준이 낮아 &lsquo;{lookup.hit.q}&rsquo;의 답을 다른 질문에 돌려줬습니다. 기준을 올려 보세요.
          </div>
        )}
      </Stage>

      <Stage step="4" title={`지연 시간 — 한 번에 ${Math.round(full)}ms, 캐시 포함 평균 ${Math.round(avg)}ms`}
             desc={`단계별 시간을 어림했다(질문 임베딩 ${LATENCY.embed}ms, 리랭커 후보당 ${LATENCY.rerankPer}ms, 답변 토큰당 ${LATENCY.decodePerToken}ms 가정). 실제 값은 모델과 장비마다 다르므로 비율만 보세요.`}>
        <div className="row g-3 align-items-end mb-3">
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="ops-cand">리랭커 후보 수: {candidates}</label>
            <input id="ops-cand" type="range" className="form-range" min="5" max="50" step="5" value={candidates}
                   onChange={(e) => setCandidates(Number(e.target.value))} disabled={!useRerank} />
          </div>
          <div className="col-6 col-md-3">
            <div className="form-check">
              <input id="ops-rerank" type="checkbox" className="form-check-input" checked={useRerank} onChange={(e) => setUseRerank(e.target.checked)} />
              <label className="form-check-label small" htmlFor="ops-rerank">재순위화 사용</label>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="ops-answer">답변 길이: {answerTokens}토큰</label>
            <input id="ops-answer" type="range" className="form-range" min="20" max="300" step="10" value={answerTokens}
                   onChange={(e) => setAnswerTokens(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="ops-hit">캐시 적중률: {Math.round(hitRate * 100)}%</label>
            <input id="ops-hit" type="range" className="form-range" min="0" max="0.9" step="0.1" value={hitRate}
                   onChange={(e) => setHitRate(Number(e.target.value))} />
          </div>
        </div>
        <div className="rag-budget mb-2" role="img" aria-label={`단계별 지연 시간, 합계 ${Math.round(full)}ms`}>
          {stages.filter((s) => s.ms > 0).map((s) => (
            <span key={s.key} style={{ width: `${(s.ms / full) * 100}%`, background: STAGE_COLORS[s.key] }} title={`${s.label} ${s.ms}ms`} />
          ))}
        </div>
        <ul className="list-unstyled small mb-0 d-flex flex-wrap gap-3">
          {stages.map((s) => (
            <li key={s.key} className={s.ms ? '' : 'text-body-secondary text-decoration-line-through'}>
              <span className="llm-legend me-1" style={{ background: STAGE_COLORS[s.key] }} />{s.label} <span className="font-monospace">{Math.round(s.ms)}ms</span>
            </li>
          ))}
        </ul>
        <p className="small text-body-secondary mt-2 mb-0">
          대부분의 시간은 답변 생성(토큰을 하나씩 만드는 일)에 듭니다. 근거 {KB_CHUNKS.length}개짜리 예시든 수백만 개든 검색 자체는 인덱스 덕분에 수십 ms 안에 끝납니다.
        </p>
      </Stage>
    </RagPage>
  )
}
