import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { StageCard, Terms } from '../components/VizStage.jsx'
import {
  BPE_MAX_MERGES, CORPUS_MAX_LENGTH, DEFAULT_OPTIONS, MAX_DOCS, PII_LABELS, PREFERENCE_SAMPLE,
  SAMPLE_CORPUS, SFT_SAMPLE, SHINGLE_SIZE,
  buildChat, makeTokenizer, packSequences, runPipeline, trainBpe,
} from '../utils/llmData.js'
import { chunkColor } from '../utils/rag.js'
import { useTitle } from '../utils/useTitle.js'

// 실행하면 단계가 하나씩 차례로 나타난다 (수집 → 필터링 → 중복 제거 → 마스킹 → 토큰화 → 패킹 → 지시 데이터)
const TOTAL_STAGES = 7
const STAGE_DELAY_MS = 450
const PREVIEW_BLOCKS = 6
const NEXT_TOKEN_ROWS = 12
const NEXT_TOKEN_CONTEXT = 6

function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

const pct = (v) => `${Math.round(v * 100)}%`

// 단계별 전문용어 설명 (카드 하단에 보여 준다). settings는 위쪽 설정 카드용
const TERMS = {
  settings: [
    ['품질 필터', '규칙(휴리스틱)으로 저품질 문서를 버리는 것. 실제로는 길이·기호 비율·반복 외에 품질 분류 모델의 점수도 함께 쓴다.'],
    ['유사도 기준', `두 문서를 ${SHINGLE_SIZE}글자 조각으로 나눈 집합의 Jaccard 유사도가 이 값 이상이면 뒤 문서를 중복으로 보고 지운다.`],
  ],
  1: [
    ['사전학습 (Pre-training)', '대량의 일반 텍스트로 다음 토큰 예측을 학습해 언어 능력 자체를 익히는 단계. 학습 데이터의 대부분이 여기에 쓰인다.'],
    ['코퍼스 (Corpus)', '학습에 쓰는 문서 모음. 웹 크롤링(Common Crawl), 위키백과, 책, 논문, 코드 저장소 등을 섞어 수 조 토큰 규모로 만든다.'],
  ],
  2: [
    ['정제 (Cleaning)', 'HTML 태그·스크립트·메뉴처럼 본문이 아닌 부분을 걷어 내고 공백을 정리하는 것.'],
    ['휴리스틱 필터', '길이, 기호 비율, 단어 반복처럼 계산하기 쉬운 기준으로 스팸·광고·깨진 문서를 거르는 규칙.'],
    ['언어 식별', '문서가 어떤 언어인지 판별해 원하는 언어만 남기는 것. 여기서는 글자 중 한글 비율로 판단한다(실제로는 fastText 같은 분류기).'],
  ],
  3: [
    ['중복 제거 (Deduplication)', '같거나 거의 같은 문서를 지우는 것. 중복이 많으면 모델이 그 내용을 통째로 외우고(암기) 학습 비용도 낭비된다.'],
    ['Shingle (n-gram)', `문서를 ${SHINGLE_SIZE}글자씩 한 칸씩 밀며 자른 조각의 집합. 조각이 많이 겹칠수록 비슷한 문서다.`],
    ['Jaccard 유사도', '두 집합의 교집합 크기 ÷ 합집합 크기. 1이면 같고 0이면 겹치는 조각이 없다.'],
    ['MinHash', '문서가 수십억 개면 모든 쌍을 비교할 수 없어, 해시로 Jaccard 유사도를 빠르게 근사하는 방법(LSH와 함께 쓴다). 여기서는 문서가 적어 정확한 값을 계산한다.'],
  ],
  4: [
    ['PII', 'Personally Identifiable Information(개인 식별 정보). 이메일·전화번호·주민등록번호처럼 사람을 특정할 수 있는 정보로, 모델이 외워 다시 출력하지 않도록 지우거나 바꾼다.'],
    ['마스킹', '찾은 개인정보를 <EMAIL> 같은 자리표시 글자로 바꾸는 것. 문장 구조는 남기고 정보만 없앤다.'],
  ],
  5: [
    ['BPE', 'Byte Pair Encoding. 글자 단위에서 시작해 가장 자주 붙어 나오는 쌍을 하나의 토큰으로 합치기를 반복해 어휘를 만드는 방법.'],
    ['어휘 (Vocabulary)', '토크나이저가 아는 토큰 목록. 실제 모델은 보통 3만~20만 개다. 클수록 같은 글을 더 적은 토큰으로 나타낸다.'],
    ['▁ (단어 시작)', 'SentencePiece 방식처럼 공백 뒤 단어의 시작을 나타내는 표시. 토큰을 이어 붙이고 ▁를 공백으로 바꾸면 원문이 된다.'],
    ['<unk>', '어휘에 없는 글자. 실제 모델은 글자를 바이트로 쪼개는 byte fallback으로 어떤 글자도 표현한다.'],
  ],
  6: [
    ['컨텍스트 길이', '모델이 한 번에 보는 토큰 수. 실제 모델은 수천~수백만 토큰이다.'],
    ['시퀀스 패킹', '짧은 문서들을 <eos>로 구분해 이어 붙인 뒤 컨텍스트 길이로 잘라, 빈칸(패딩) 없이 꽉 채워 학습하는 방법.'],
    ['다음 토큰 예측', '앞 토큰들만 보고 바로 다음 토큰을 맞히는 학습 목표. 정답은 입력을 한 칸 민 것이라 사람이 라벨을 달 필요가 없다(자기 지도 학습).'],
  ],
  7: [
    ['SFT', 'Supervised Fine-Tuning(지도 미세 조정). 질문–모범 답변 쌍으로 대화 형식과 지시 따르기를 가르치는 단계.'],
    ['채팅 템플릿', '역할(system·user·assistant)을 특수 토큰으로 구분해 대화를 하나의 토큰열로 만드는 형식.'],
    ['손실 마스크', '오차(손실)를 어느 토큰에서 계산할지 정한 표시. 보통 assistant 답변만 학습하고 질문 부분은 맞히지 않아도 된다.'],
    ['선호 데이터 (RLHF·DPO)', '같은 질문에 대한 좋은 답(chosen)과 나쁜 답(rejected) 쌍. 모델이 사람이 선호하는 답을 더 높은 확률로 내도록 조정한다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 문서 번호 배지. 색은 문서마다 정해져 모든 단계에서 같다
function DocBadge({ index }) {
  return <span className="badge" style={{ background: chunkColor(index) }}>#{index + 1}</span>
}

// 토큰 칩. 특수 토큰은 어둡게, 어휘에 없는 글자는 점선, masked는 흐리게, train(손실 계산)은 초록으로
function Token({ token, color, masked, train }) {
  const cls = ['rag-token', token.special && 'llm-token-special', token.unk && 'llm-token-unk',
    masked && 'llm-token-masked', train && 'llm-token-train']
  return (
    <span className={cls.filter(Boolean).join(' ')} style={color ? { '--chunk-color': color } : undefined}
          title={`ID ${token.id}${token.unk ? ' (<unk>: 어휘에 없음)' : ''}`}>
      {token.text}
    </span>
  )
}

// 필터 통과 문서끼리의 유사도 표. 기준 이상인 칸은 테두리로 표시한다
function SimilarityMatrix({ docs, matrix, threshold }) {
  return (
    <div className="table-responsive">
      <table className="llm-heatmap small font-monospace mb-0">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">문서</span></th>
            {docs.map((d) => <th key={d.index} scope="col"><DocBadge index={d.index} /></th>)}
          </tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={d.index}>
              <th scope="row"><DocBadge index={d.index} /></th>
              {docs.map((e, j) => {
                if (i === j) return <td key={e.index} className="text-body-tertiary">—</td>
                const v = matrix[i][j]
                // 글자는 늘 어둡게 두므로 배경은 60%까지만 진하게 해 대비를 지킨다
                return (
                  <td key={e.index} className={v >= threshold ? 'llm-dup' : ''}
                      style={{ background: `rgba(176,42,55,${v * 0.6})` }}
                      title={`#${d.index + 1} ↔ #${e.index + 1}: ${v.toFixed(3)}`}>
                    {v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 상단 요약: 단계가 지나갈 때마다 남은 문서·토큰 수가 채워진다
function Funnel({ stage, rawCount, passedCount, finalCount, tokenCount }) {
  const items = [
    ['원시 문서', rawCount, 1],
    ['필터 통과', passedCount, 2],
    ['중복 제거 후', finalCount, 3],
    ['학습 토큰', tokenCount, 6],
  ]
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3 small">
      {items.map(([label, value, from], i) => (
        <div key={label} className="d-flex align-items-center gap-2">
          {i > 0 && <span className="text-body-tertiary" aria-hidden="true">→</span>}
          <div className="border rounded px-2 py-1 bg-body-tertiary">
            {label} <strong>{stage >= from ? value.toLocaleString() : '…'}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}

// LLM 학습 데이터 구축 과정 시각화 (로그인 불필요, 계산은 모두 브라우저에서 한다)
export default function LlmDataVisualizer() {
  useTitle('LLM 학습 데이터 시각화')
  const [input, setInput] = useState(SAMPLE_CORPUS)
  const [corpus, setCorpus] = useState('')
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [stage, setStage] = useState(0)
  const [mergeCount, setMergeCount] = useState(100)
  const [contextLen, setContextLen] = useState(32)
  const [selected, setSelected] = useState(0)

  // 큰 입력이면 BPE 재학습이 수백 ms 걸리므로, 슬라이더를 끄는 동안에는 손잡이부터 움직이고 계산은 뒤따르게 한다
  const deferredOptions = useDeferredValue(options)
  const pipeline = useMemo(() => (corpus ? runPipeline(corpus, deferredOptions) : null), [corpus, deferredOptions])
  const bpe = useMemo(() => (pipeline ? trainBpe(pipeline.finalDocs.map((d) => d.pii.masked)) : null), [pipeline])
  const merges = Math.min(mergeCount, bpe?.merges.length ?? 0)
  const tokenizer = useMemo(() => (bpe ? makeTokenizer(bpe, merges) : null), [bpe, merges])
  const docTokens = useMemo(
    () => pipeline?.finalDocs.map((d) => ({ doc: d.index, tokens: tokenizer.encode(d.pii.masked) })) ?? [],
    [pipeline, tokenizer],
  )
  const packed = useMemo(() => (tokenizer ? packSequences(docTokens, contextLen, tokenizer) : null), [docTokens, contextLen, tokenizer])
  const chat = useMemo(() => (tokenizer ? buildChat(tokenizer, SFT_SAMPLE) : []), [tokenizer])

  useEffect(() => {
    if (!corpus || stage >= TOTAL_STAGES) return
    const timer = setTimeout(() => setStage(stage + 1), STAGE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [corpus, stage])

  // 실행하면 맨 위로 올려 1단계부터 순서대로 보게 한다
  const run = (text) => {
    setCorpus(text.slice(0, CORPUS_MAX_LENGTH))
    setSelected(0)
    setStage(1)
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }

  const setOption = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value)
    setOptions((o) => ({ ...o, [key]: value }))
    setSelected(0)
  }

  const docs = pipeline?.docs ?? []
  const finalDocs = pipeline?.finalDocs ?? []
  const htmlExample = docs.find((d) => d.htmlRemoved)
  const removedDups = pipeline?.passed.filter((d) => d.dup) ?? []
  const piiDocs = finalDocs.filter((d) => d.pii.hits)
  const sel = Math.min(selected, Math.max(0, finalDocs.length - 1))
  const selDoc = finalDocs[sel]
  const selTokens = docTokens[sel]?.tokens ?? []
  const firstBlock = packed?.blocks[0] ?? []
  const trainCount = chat.filter((t) => t.train).length

  return (
    <div className="container my-3 pb-5">
      <h4 className="border-bottom pb-2">LLM 학습 데이터 구축 과정 시각화</h4>
      <p className="text-body-secondary small">
        수집한 문서가 정제·필터링 → 중복 제거 → 개인정보 마스킹 → 토큰화 → 시퀀스 패킹을 거쳐 사전학습 데이터가 되고,
        대화 형식의 지시·선호 데이터로 미세 조정 데이터가 만들어지는 과정을 보여 줍니다.
        모든 계산은 브라우저에서 하는 학습용 축소판이며, 입력한 글은 서버로 보내지 않습니다.
      </p>

      {/* 코퍼스 입력: 실행 버튼을 눌러야 아래 단계가 다시 계산된다 */}
      <div className="card mb-3">
        <div className="card-body">
          <label className="form-label small mb-1" htmlFor="llm-corpus">
            수집한 문서 (문서는 <code>---</code> 줄로 나누고, 첫 줄에 <code>[출처]</code>를 쓸 수 있음 · 최대 {MAX_DOCS}개)
          </label>
          <textarea id="llm-corpus" className="form-control font-monospace small" rows={8} value={input}
                    maxLength={CORPUS_MAX_LENGTH} onChange={(e) => setInput(e.target.value)} />
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={!input.trim()} onClick={() => run(input)}>
              파이프라인 실행
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={input === SAMPLE_CORPUS}
                    onClick={() => setInput(SAMPLE_CORPUS)}>
              예시 문서로 되돌리기
            </button>
            <small className="text-body-secondary ms-auto">
              {input.length.toLocaleString()} / {CORPUS_MAX_LENGTH.toLocaleString()}자
            </small>
          </div>
        </div>
      </div>

      {/* 필터·중복 제거 설정: 바꾸면 아래 단계가 바로 다시 계산된다 */}
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="llm-min-length">최소 길이: {options.minLength}자</label>
            <input id="llm-min-length" type="range" className="form-range" min="0" max="200" step="10"
                   value={options.minLength} onChange={setOption('minLength')} />
          </div>
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="llm-symbol">기호 비율 상한: {pct(options.maxSymbolRatio)}</label>
            <input id="llm-symbol" type="range" className="form-range" min="0.02" max="0.5" step="0.02"
                   value={options.maxSymbolRatio} onChange={setOption('maxSymbolRatio')} />
          </div>
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="llm-unique">고유 단어 하한: {pct(options.minUniqueRatio)}</label>
            <input id="llm-unique" type="range" className="form-range" min="0" max="0.9" step="0.05"
                   value={options.minUniqueRatio} onChange={setOption('minUniqueRatio')} />
          </div>
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="llm-dedup">유사도 기준: {options.dedupThreshold.toFixed(2)}</label>
            <input id="llm-dedup" type="range" className="form-range" min="0.3" max="1" step="0.05"
                   value={options.dedupThreshold} onChange={setOption('dedupThreshold')} />
          </div>
          <div className="col-12 col-md-auto">
            <div className="form-check mb-2">
              <input id="llm-korean" type="checkbox" className="form-check-input"
                     checked={options.koreanOnly} onChange={setOption('koreanOnly')} />
              <label className="form-check-label small" htmlFor="llm-korean">한국어 문서만</label>
            </div>
          </div>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS.settings} />
        </div>
      </div>

      {!pipeline && (
        <p className="text-center text-body-secondary py-5">
          예시 문서가 들어 있습니다. 그대로 또는 고쳐서 <strong>파이프라인 실행</strong>을 눌러 보세요.
        </p>
      )}

      {pipeline && (
        <Funnel stage={stage} rawCount={docs.length} passedCount={pipeline.passed.length}
                finalCount={finalDocs.length} tokenCount={packed?.total ?? 0} />
      )}

      {pipeline && stage >= 1 && (
        <Stage step="1" title={`원시 데이터 수집 — ${docs.length}개 문서`}
               desc="웹 페이지·책·코드·위키 등에서 문서를 모은다. 이 단계의 데이터에는 HTML 찌꺼기, 광고, 중복 글, 개인정보가 그대로 섞여 있다.">
          <div className="row g-2">
            {docs.map((d) => (
              <div key={d.index} className="col-12 col-md-6">
                <div className="border rounded p-2 h-100">
                  <div className="d-flex align-items-center gap-2 small mb-1">
                    <DocBadge index={d.index} />
                    <span className="text-body-secondary">{d.source}</span>
                    <span className="text-body-secondary ms-auto">{d.raw.length}자</span>
                  </div>
                  <pre className="llm-doc mb-0">{d.raw}</pre>
                </div>
              </div>
            ))}
          </div>
        </Stage>
      )}

      {pipeline && stage >= 2 && (
        <Stage step="2" title={`정제·품질 필터링 — ${pipeline.passed.length}개 통과`}
               desc="HTML 태그를 걷어 낸 뒤 문서마다 품질 지표를 계산해 기준에 못 미치는 문서를 버린다. 빨간 값이 걸린 기준이다.">
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-3">
              <thead>
                <tr>
                  <th scope="col">문서</th>
                  <th scope="col" className="text-end">길이</th>
                  <th scope="col" className="text-end">한글 비율</th>
                  <th scope="col" className="text-end">기호 비율</th>
                  <th scope="col" className="text-end">고유 단어</th>
                  <th scope="col">결과</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const failed = new Set(d.fails.map((f) => f.key))
                  const cell = (key, text) => (
                    <td className={`text-end font-monospace ${failed.has(key) ? 'text-danger fw-bold' : ''}`}>{text}</td>
                  )
                  return (
                    <tr key={d.index} className={d.fails.length ? 'table-light' : ''}>
                      <td className="text-nowrap"><DocBadge index={d.index} /> <span className="text-body-secondary">{d.source}</span></td>
                      {cell('length', d.metrics.length)}
                      {cell('koRatio', pct(d.metrics.koRatio))}
                      {cell('symbolRatio', pct(d.metrics.symbolRatio))}
                      {cell('uniqueRatio', pct(d.metrics.uniqueRatio))}
                      <td className="text-nowrap">
                        {d.fails.length
                          ? <span className="badge text-bg-danger">제거: {d.fails.map((f) => f.label).join(', ')}</span>
                          : <span className="badge text-bg-success">통과</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {htmlExample && (
            <div className="row g-2">
              <div className="col-12 col-md-6">
                <div className="small fw-bold mb-1"><DocBadge index={htmlExample.index} /> 정제 전</div>
                <pre className="llm-doc border rounded p-2 mb-0">{htmlExample.raw}</pre>
              </div>
              <div className="col-12 col-md-6">
                <div className="small fw-bold mb-1">HTML 제거·공백 정리 후</div>
                <pre className="llm-doc border rounded p-2 mb-0 bg-body-tertiary">{htmlExample.cleaned}</pre>
              </div>
            </div>
          )}
        </Stage>
      )}

      {pipeline && stage >= 3 && (
        <Stage step="3" title={`중복 제거 — ${removedDups.length}개 제거`}
               desc={`필터를 통과한 문서끼리 ${SHINGLE_SIZE}글자 조각 집합의 Jaccard 유사도를 계산한다(공백·문장부호·대소문자는 무시). 앞에서부터 남긴 문서와 완전히 같거나 기준(${options.dedupThreshold.toFixed(2)}) 이상 비슷하면 뒤 문서를 지운다. 테두리 칸이 기준을 넘은 쌍이다.`}>
          {pipeline.passed.length > 1
            ? <SimilarityMatrix docs={pipeline.passed} matrix={pipeline.matrix} threshold={options.dedupThreshold} />
            : <p className="small text-body-secondary mb-0">비교할 문서가 2개 이상 있어야 합니다.</p>}
          {removedDups.length > 0 && (
            <ul className="list-unstyled small mt-3 mb-0">
              {removedDups.map((d) => (
                <li key={d.index} className="mb-1">
                  <DocBadge index={d.index} /> 제거 — <DocBadge index={d.dup.of} /> 문서와{' '}
                  {d.dup.type === 'exact' ? '내용이 완전히 같음' : `거의 같음 (유사도 ${d.dup.score.toFixed(2)})`}
                </li>
              ))}
            </ul>
          )}
        </Stage>
      )}

      {pipeline && stage >= 4 && (
        <Stage step="4" title={`개인정보 마스킹 — ${piiDocs.reduce((n, d) => n + d.pii.hits, 0)}건`}
               desc="남은 문서에서 이메일·전화번호·주민등록번호 패턴을 찾아 자리표시 글자로 바꾼다.">
          {piiDocs.length === 0 && <p className="small text-body-secondary mb-0">개인정보 패턴이 발견되지 않았습니다.</p>}
          {piiDocs.map((d) => (
            <div key={d.index} className="border rounded p-2 mb-2 small">
              <div className="mb-1"><DocBadge index={d.index} /></div>
              <div className="llm-doc mb-1">
                {d.pii.parts.map((p, i) => (p.type
                  ? <mark key={i} className="llm-pii" title={PII_LABELS[p.type]}><del>{p.text}</del> → {p.tag}</mark>
                  : <span key={i}>{p.text}</span>))}
              </div>
            </div>
          ))}
        </Stage>
      )}

      {pipeline && stage >= 5 && (
        <Stage step="5" title={`토큰화 (BPE 학습) — 어휘 ${tokenizer.vocabSize}개`}
               desc="남은 문서로 토크나이저를 직접 학습한다. 글자 하나하나에서 시작해 가장 자주 붙어 나오는 쌍을 합치는 규칙을 순서대로 배운다. 병합 횟수를 늘리면 어휘가 커지고 같은 글이 더 적은 토큰이 된다.">
          {finalDocs.length === 0 ? (
            <p className="small text-body-secondary mb-0">남은 문서가 없어 토크나이저를 학습할 수 없습니다. 필터 기준을 낮춰 보세요.</p>
          ) : (
            <>
              <label className="form-label small mb-1" htmlFor="llm-merges">
                병합 횟수: {merges} / 학습된 규칙 {bpe.merges.length}개 (최대 {BPE_MAX_MERGES})
              </label>
              <input id="llm-merges" type="range" className="form-range mb-2" min="0" max={bpe.merges.length}
                     value={merges} onChange={(e) => setMergeCount(Number(e.target.value))} />
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <div className="small fw-bold mb-1">배운 병합 규칙 (순서대로)</div>
                  <ol className="llm-merges small font-monospace border rounded py-1 mb-0">
                    {bpe.merges.slice(0, merges).map((m, i) => (
                      <li key={i}>{m.a} + {m.b} → <strong>{m.token}</strong> <span className="text-body-secondary">({m.freq}회)</span></li>
                    ))}
                    {merges === 0 && <li className="text-body-secondary">글자 단위 그대로</li>}
                  </ol>
                </div>
                <div className="col-12 col-md-8">
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {finalDocs.map((d, i) => (
                      <button key={d.index} type="button"
                              className={`btn btn-sm rag-chunk-btn ${i === sel ? 'active' : ''}`}
                              style={{ '--chunk-color': chunkColor(d.index) }}
                              aria-pressed={i === sel} onClick={() => setSelected(i)}>
                        #{d.index + 1}
                      </button>
                    ))}
                  </div>
                  <div className="small mb-2">
                    <DocBadge index={selDoc.index} /> 글자 <strong>{selDoc.pii.masked.length}</strong> →
                    토큰 <strong>{selTokens.length}</strong>개
                    (토큰당 {(selDoc.pii.masked.length / Math.max(1, selTokens.length)).toFixed(2)}자)
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {selTokens.map((t, i) => <Token key={i} token={t} color={chunkColor(selDoc.index)} />)}
                  </div>
                </div>
              </div>
            </>
          )}
        </Stage>
      )}

      {pipeline && stage >= 6 && packed && (
        <Stage step="6" title={`시퀀스 패킹 — ${packed.blocks.length}개 블록`}
               desc="토큰화한 문서를 <eos>로 구분해 한 줄로 이은 뒤 컨텍스트 길이만큼 자른다. 블록 하나가 학습 샘플 하나이며, 문서 경계와 블록 경계는 맞지 않아도 된다. 마지막 블록의 빈칸은 <pad>로 채운다.">
          <label className="form-label small mb-1" htmlFor="llm-context">컨텍스트 길이: {contextLen}토큰</label>
          <input id="llm-context" type="range" className="form-range mb-2" min="8" max="128" step="8"
                 value={contextLen} onChange={(e) => setContextLen(Number(e.target.value))} />
          <div className="small mb-2">
            전체 토큰 <strong>{packed.total}</strong>개 → {contextLen}토큰 블록 <strong>{packed.blocks.length}</strong>개
            (패딩 {packed.padCount}개)
          </div>
          {packed.blocks.length === 0 && <p className="small text-body-secondary mb-0">남은 문서가 없어 만들 블록이 없습니다.</p>}
          {packed.blocks.slice(0, PREVIEW_BLOCKS).map((block, b) => (
            <div key={b} className="d-flex gap-2 mb-2">
              <span className="badge text-bg-secondary align-self-start llm-block-label">블록 {b + 1}</span>
              <div className="d-flex flex-wrap gap-1">
                {block.map((t, i) => <Token key={i} token={t} color={t.doc === null ? undefined : chunkColor(t.doc)} />)}
              </div>
            </div>
          ))}
          {packed.blocks.length > PREVIEW_BLOCKS && (
            <p className="small text-body-secondary">… 외 {packed.blocks.length - PREVIEW_BLOCKS}개 블록</p>
          )}

          <div className="small fw-bold mt-3 mb-1">블록 1로 만든 학습 문제: 앞 토큰을 보고 다음 토큰 맞히기</div>
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">위치</th>
                  <th scope="col">모델이 보는 입력 (앞 토큰들)</th>
                  <th scope="col">정답 (다음 토큰)</th>
                </tr>
              </thead>
              <tbody>
                {firstBlock.slice(0, Math.min(NEXT_TOKEN_ROWS, firstBlock.length - 1)).map((_, i) => {
                  const from = Math.max(0, i + 1 - NEXT_TOKEN_CONTEXT)
                  const target = firstBlock[i + 1]
                  return (
                    <tr key={i}>
                      <td className="font-monospace">{i + 1}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-1 align-items-center">
                          {from > 0 && <span className="text-body-tertiary">…</span>}
                          {firstBlock.slice(from, i + 1).map((t, j) => <Token key={j} token={t} masked />)}
                        </div>
                      </td>
                      <td><Token token={target} color={target.doc === null ? undefined : chunkColor(target.doc)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Stage>
      )}

      {pipeline && stage >= 7 && (
        <Stage step="7" title="지시·선호 데이터 (미세 조정)"
               desc="사전학습이 끝난 모델이 대화하도록 가르치는 데이터다. 질문과 모범 답변을 채팅 템플릿으로 하나의 토큰열로 만들고, 손실은 assistant 답변 토큰에서만 계산한다.">
          {finalDocs.length === 0 && (
            <p className="small text-body-secondary mb-2">남은 문서가 없어 어휘가 비어 있으므로 글자가 모두 &lt;unk&gt;로 표시됩니다.</p>
          )}
          <div className="small mb-2">
            전체 <strong>{chat.length}</strong>토큰 중 학습(손실 계산) <strong>{trainCount}</strong>토큰
            <span className="ms-2"><span className="rag-token llm-token-train">학습</span> <span className="rag-token llm-token-masked">학습 안 함</span></span>
          </div>
          <div className="d-flex flex-wrap gap-1 mb-3">
            {chat.map((t, i) => <Token key={i} token={t} masked={!t.train} train={t.train} />)}
          </div>

          <div className="small fw-bold mb-1">선호 데이터 한 쌍 (RLHF·DPO)</div>
          <div className="border rounded p-2 small mb-2"><strong>질문</strong> {PREFERENCE_SAMPLE.prompt}</div>
          <div className="row g-2">
            <div className="col-12 col-md-6">
              <div className="border border-success rounded p-2 small h-100">
                <span className="badge text-bg-success mb-1">chosen (선호)</span>
                <div>{PREFERENCE_SAMPLE.chosen}</div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="border border-danger rounded p-2 small h-100">
                <span className="badge text-bg-danger mb-1">rejected (비선호)</span>
                <div>{PREFERENCE_SAMPLE.rejected}</div>
              </div>
            </div>
          </div>
          <p className="small text-body-secondary mt-2 mb-0">{PREFERENCE_SAMPLE.note}</p>
        </Stage>
      )}
    </div>
  )
}
