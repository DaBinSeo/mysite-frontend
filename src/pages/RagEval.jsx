import { useMemo, useState } from 'react'
import { Bars } from '../components/VizCharts.jsx'
import { ChunkBadge, RagPage, ScoreCell } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { EVAL_METHODS, EVAL_SET, answer, answerText, docTitle, evaluateMethod, splitSentences, supportOf } from '../utils/ragModel.js'

const SUPPORT_OK = 0.75
const METHOD_KEYS = Object.keys(EVAL_METHODS)
// 1번 질문에 대해 그럴듯하지만 틀린 내용이 섞인 답변(충실도 검사 예시)
const FAKE_ANSWER = '한 사람이 한 번에 최대 5권까지 빌릴 수 있습니다. 대출 기간은 14일입니다. 연체하면 하루에 100원씩 연체료를 냅니다.'

const TERMS = {
  1: [
    ['평가 세트 (Golden set)', '실제 사용자 질문과 정답 문서·정답 내용을 사람이 표시해 둔 모음. 검색기나 청크 크기를 바꿀 때마다 같은 세트로 점수를 비교한다.'],
  ],
  2: [
    ['Hit@k / Recall@k', 'Hit@k는 상위 k개에 정답 문서가 하나라도 있는 질문의 비율, Recall@k는 정답 문서 중 상위 k개 안에 들어온 비율.'],
    ['MRR', 'Mean Reciprocal Rank. 첫 정답이 나온 순위의 역수(1위 = 1, 2위 = 0.5, 3위 = 0.33…)의 평균. 정답이 얼마나 위에 있는지 본다.'],
    ['nDCG@k', '정답이 위에 있을수록 점수를 더 주는 지표(순위가 내려갈수록 1/log₂(순위+1)로 깎음)를 이상적인 순서의 점수로 나눈 값. 정답 청크가 여러 개일 때 순서 전체의 품질을 본다.'],
  ],
  3: [
    ['실패 분석', '평균 점수만 보지 말고 틀린 질문을 하나씩 봐야 한다. 어휘 불일치(→ 질의 확장·벡터), 고유명사 누락(→ BM25), 청크 경계(→ 청킹) 등 원인마다 고칠 곳이 다르다.'],
  ],
  4: [
    ['충실도 (Faithfulness)', '답변의 각 문장이 근거에 실제로 있는 내용인지. 근거 밖의 내용이 섞이면 환각이다.'],
    ['정답성 (Correctness)', '답변에 정답 내용(여기서는 꼭 있어야 할 말)이 들어 있는지. 충실하지만 엉뚱한 근거를 쓰면 정답성이 낮다.'],
    ['LLM-as-a-judge', '실제 서비스에서는 다른 LLM에게 "이 문장이 근거에 있는가"를 채점시키는 방식(RAGAS 등)을 많이 쓴다. 여기서는 핵심어 겹침으로 흉내 냈다.'],
  ],
}

// 답변 평가는 입력에 따라 바뀌지 않으므로 화면을 처음 받을 때 한 번만 계산한다
const GEN = EVAL_SET.map((it) => {
  const r = answer(it.q)
  const text = answerText(r)
  const support = r.sentences.length
    ? r.sentences.reduce((s, x) => s + supportOf(x.text, r.packed.map((p) => p.chunk.text)).score, 0) / r.sentences.length
    : 0
  return { it, text, correct: text.includes(it.expect), support, refused: r.refused }
})
const FIRST_CONTEXT = answer(EVAL_SET[0].q).packed.map((p) => p.chunk.text)

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 8. 평가 (로그인 불필요)
export default function RagEval() {
  const [k, setK] = useState(3)
  const [selected, setSelected] = useState(0)
  const [fake, setFake] = useState(FAKE_ANSWER)
  // 검색 채점은 k가 바뀔 때만 다시 한다(행 선택·답변 입력 때는 그대로)
  const results = useMemo(() => Object.fromEntries(METHOD_KEYS.map((m) => [m, evaluateMethod(m, k)])), [k])
  const item = EVAL_SET[selected]
  const fakeChecks = splitSentences(fake).map((s) => ({ s, ...supportOf(s, FIRST_CONTEXT) }))

  return (
    <RagPage path="/rag/eval"
             intro="RAG는 여러 단계가 엮여 있어서, 무엇을 바꿨을 때 좋아졌는지 감으로 알기 어렵습니다. 정답을 표시한 질문 모음으로 검색 단계와 생성 단계를 따로 채점합니다.">
      <Stage step="1" title={`평가 세트 — 질문 ${EVAL_SET.length}개`}
             desc="질문마다 정답 문서와 답에 꼭 있어야 할 말을 표시했다. 줄을 누르면 3단계에서 그 질문의 방식별 검색 결과를 본다.">
        <div className="table-responsive">
          <table className="table table-sm table-hover small align-middle mb-0">
            <thead className="text-nowrap"><tr><th>#</th><th>질문</th><th>정답 문서</th><th>꼭 있어야 할 말</th></tr></thead>
            <tbody>
              {EVAL_SET.map((it, i) => (
                <tr key={it.q} className={`rag-select-row ${i === selected ? 'table-active' : ''}`} onClick={() => setSelected(i)}>
                  <td>
                    {/* 키보드·스크린리더용 선택 버튼. 행 클릭은 마우스 편의용 */}
                    <button type="button" className="btn btn-link btn-sm p-0" aria-pressed={i === selected}
                            aria-label={`${i + 1}번 질문 결과 보기`} onClick={() => setSelected(i)}>{i + 1}</button>
                  </td>
                  <td>{it.q}</td><td>{it.relevant.map(docTitle).join(', ')}</td><td>{it.expect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stage>

      <Stage step="2" title={`검색 방식별 점수 (k = ${k})`}
             desc="같은 질문으로 네 가지 검색 방식을 채점했다. 청크가 정답 문서에 속하면 정답으로 본다. k를 바꿔 보세요.">
        <label className="form-label small mb-1" htmlFor="eval-k">k (상위 몇 개까지 볼지): {k}</label>
        <input id="eval-k" type="range" className="form-range mb-2" min="1" max="5" value={k} onChange={(e) => setK(Number(e.target.value))} />
        <div className="table-responsive mb-3">
          <table className="table table-sm small align-middle mb-0">
            <thead className="text-nowrap"><tr><th>방식</th><th className="text-end">Hit@{k}</th><th className="text-end">Recall@{k}</th><th className="text-end">MRR</th><th className="text-end">nDCG@{k}</th></tr></thead>
            <tbody>
              {METHOD_KEYS.map((m) => (
                <tr key={m}>
                  <th scope="row" className="fw-normal">{EVAL_METHODS[m]}</th>
                  <ScoreCell value={results[m].hit} /><ScoreCell value={results[m].recall} />
                  <ScoreCell value={results[m].mrr} /><ScoreCell value={results[m].ndcg} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small fw-bold mb-1">nDCG@{k}</div>
        <Bars items={METHOD_KEYS.map((m) => ({ key: m, label: EVAL_METHODS[m], value: results[m].ndcg }))} max={1}
              format={(v) => v.toFixed(2)} />
      </Stage>

      <Stage step="3" title={`질문별 결과 — ${selected + 1}. ${item.q}`}
             desc="표의 숫자는 첫 정답 청크가 나온 순위(— = 못 찾음)다. 아래는 고른 질문의 방식별 상위 3개 결과다.">
        <div className="table-responsive mb-3">
          <table className="table table-sm small align-middle mb-0">
            <thead className="text-nowrap"><tr><th>#</th>{METHOD_KEYS.map((m) => <th key={m} className="text-end">{EVAL_METHODS[m]}</th>)}</tr></thead>
            <tbody>
              {EVAL_SET.map((it, i) => (
                <tr key={it.q} className={i === selected ? 'table-active' : ''}>
                  <td title={it.q}>{i + 1}</td>
                  {METHOD_KEYS.map((m) => {
                    const r = results[m].per[i].firstHit
                    return (
                      <td key={m} className={`text-end font-monospace ${r === 1 ? 'text-success fw-bold' : r ? '' : 'text-danger'}`}>
                        {r ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row g-2">
          {METHOD_KEYS.map((m) => (
            <div key={m} className="col-12 col-md-6 col-lg-3 small">
              <div className="fw-bold mb-1">{EVAL_METHODS[m]}</div>
              <ol className="ps-3 mb-0">
                {results[m].per[selected].list.slice(0, 3).map((c) => (
                  <li key={c.id}><ChunkBadge chunk={c} />{item.relevant.includes(c.docId) && <span className="badge text-bg-success ms-1">정답</span>}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Stage>

      <Stage step="4" title={`답변 평가 — 정답 포함 ${GEN.filter((g) => g.correct).length}/${GEN.length}`}
             desc="전체 흐름(재순위화 → 상위 3개 → 답변)으로 만든 답을 채점했다. 정답 포함은 꼭 있어야 할 말이 들어 있는지, 충실도는 답변 문장의 핵심어가 근거 문장에 들어 있는 비율이다.">
        <div className="table-responsive mb-3">
          <table className="table table-sm small align-middle mb-0">
            <thead className="text-nowrap"><tr><th>#</th><th>답변</th><th className="text-center">정답 포함</th><th className="text-end">충실도</th></tr></thead>
            <tbody>
              {GEN.map((g, i) => (
                <tr key={g.it.q}>
                  <td>{i + 1}</td>
                  <td className="text-body-secondary">{g.text}</td>
                  <td className="text-center">{g.correct ? <span className="text-success fw-bold">○</span> : <span className="text-danger fw-bold">×</span>}</td>
                  <td className="text-end font-monospace">{g.refused ? '—' : g.support.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small fw-bold mb-1">충실도 검사 직접 해 보기 — 1번 질문의 근거로 검사</div>
        <p className="small text-body-secondary mb-1">
          그럴듯하지만 근거와 다른 내용이 섞인 답변입니다. 문장을 고쳐 보면서 근거에 없는 말(빨강)이 어떻게 잡히는지 보세요.
          핵심어의 {SUPPORT_OK * 100}% 이상이 한 근거 문장에 있으면 &lsquo;근거 있음&rsquo;으로 봅니다.
        </p>
        <textarea className="form-control form-control-sm mb-2" rows="3" value={fake} maxLength={300}
                  aria-label="검사할 답변" onChange={(e) => setFake(e.target.value)} />
        <ul className="list-unstyled small mb-0">
          {fakeChecks.map((c, i) => (
            <li key={i} className={`border rounded p-2 mb-1 ${c.score >= SUPPORT_OK ? 'border-success' : 'border-danger'}`}>
              <span className={`badge me-1 ${c.score >= SUPPORT_OK ? 'text-bg-success' : 'text-bg-danger'}`}>
                {c.score >= SUPPORT_OK ? '근거 있음' : '근거 없음'} {c.score.toFixed(2)}
              </span>
              {c.s}
              {c.missing.length > 0 && (
                <div className="mt-1">근거에 없는 말: {c.missing.map((m) => <span key={m} className="badge text-bg-danger me-1">{m}</span>)}</div>
              )}
              {c.best && <div className="text-body-secondary mt-1">가장 가까운 근거: {c.best}</div>}
            </li>
          ))}
        </ul>
      </Stage>
    </RagPage>
  )
}
