import { useState } from 'react'
import { Bars, LlmPage, WordChip } from '../components/LlmViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import {
  BOS, EOS, EVAL_ITEMS, PRETRAIN_CORPUS, VALID_CORPUS, VOCAB,
  choiceScore, corpusSequences, evaluate, getPretrainedModel, makeExamples, makeRng, ngramOverlap, splitWords, tokenLosses, pct,
} from '../utils/llmModel.js'

const INPUT_MAX_LENGTH = 80
const NGRAM = 4
const CONTAMINATION_RATIO = 0.5
const LETTERS = ['A', 'B', 'C', 'D']

const TERMS = {
  1: [
    ['퍼플렉시티 (Perplexity)', 'exp(평균 손실). 모델이 다음 토큰을 고를 때 평균적으로 몇 개 후보 사이에서 헷갈리는지로 읽을 수 있다. 낮을수록 좋다.'],
    ['검증 세트', '학습에 쓰지 않은 문장. 학습 문장의 퍼플렉시티만 낮고 검증 문장이 높으면 외운 것이다.'],
  ],
  2: [
    ['벤치마크', '정답이 있는 문제 모음으로 능력을 재는 시험. 예: MMLU(57과목 객관식), GSM8K(수학 서술형), HumanEval(코딩).'],
    ['로그 확률 채점', '보기마다 "질문 + 보기"를 모델에 넣어 보기 토큰들의 평균 로그 확률을 계산하고, 가장 높은 보기를 모델의 답으로 본다.'],
    ['LLM-as-a-judge', '정답이 하나로 정해지지 않는 서술형 답은 다른 강한 LLM에게 채점을 맡기거나 사람이 직접 비교 평가한다.'],
  ],
  3: [
    ['데이터 오염 (Contamination)', '평가 문제나 정답이 학습 데이터에 섞여 들어간 것. 모델이 풀지 않고 외워 맞히므로 점수가 실제 실력보다 높게 나온다.'],
    ['n-gram 겹침 검사', `평가 문장의 연속된 단어 ${NGRAM}개 묶음이 학습 데이터에 그대로 있는지 센다. 겹침 비율이 ${pct(CONTAMINATION_RATIO)} 이상이면 오염으로 표시했다.`],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 단어 순서를 섞은 문장 (시드가 같으면 늘 같은 결과)
function shuffled(text) {
  const words = splitWords(text)
  const rng = makeRng(3)
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words.join(' ')
}

const SAMPLES = [
  ['학습 문장', PRETRAIN_CORPUS[4]],
  ['처음 보는 문장', VALID_CORPUS[0]],
  ['단어 순서를 섞은 문장', shuffled(VALID_CORPUS[0])],
]

// 7. 평가 (로그인 불필요). 4단계와 같은 방식으로 사전 학습한 모델을 채점한다
export default function LlmEval() {
  const [text, setText] = useState(SAMPLES[1][1])
  const [selected, setSelected] = useState(0)
  const model = getPretrainedModel()

  const ids = [BOS, ...VOCAB.encode(text), EOS]
  const losses = tokenLosses(model, ids)
  const meanLoss = losses.reduce((s, t) => s + t.loss, 0) / losses.length
  // 모델은 모듈에 한 번만 만들어 두므로 아래 계산(문장 수십 개)은 렌더링마다 해도 가볍다
  const setPpl = [['학습 문장', PRETRAIN_CORPUS], ['검증 문장', VALID_CORPUS]].map(([label, texts]) => ({
    label, ppl: Math.exp(evaluate(model, makeExamples(corpusSequences(texts), model.K))),
  }))

  const results = EVAL_ITEMS.map((item) => {
    const scores = item.choices.map((c) => choiceScore(model, item.stem, c))
    const pick = scores.indexOf(Math.max(...scores))
    const overlap = ngramOverlap(`${item.stem} ${item.choices[item.answer]}`, PRETRAIN_CORPUS, NGRAM)
    return { item, scores, pick, correct: pick === item.answer, overlap, contaminated: overlap.ratio >= CONTAMINATION_RATIO }
  })
  const accuracy = (rs) => (rs.length ? rs.filter((r) => r.correct).length / rs.length : 0)
  const clean = results.filter((r) => !r.contaminated)
  const dirty = results.filter((r) => r.contaminated)
  const cur = results[selected]

  return (
    <LlmPage path="/llm/eval"
             intro="학습이 끝난 모델을 배포하기 전에 점수를 매깁니다. 다음 토큰을 얼마나 잘 맞히는지(퍼플렉시티), 정답이 있는 시험 문제를 얼마나 맞히는지(벤치마크)를 재고, 시험 문제가 학습 데이터에 섞여 점수가 부풀려지지 않았는지 확인합니다.">
      <Stage step="1" title={`퍼플렉시티 — ${Math.exp(meanLoss).toFixed(1)}`}
             desc="문장의 단어마다 모델이 정답 단어에 준 확률을 구해 평균 손실을 내고, exp를 취하면 퍼플렉시티가 된다. 학습 문장 → 처음 보는 문장 → 순서를 섞은 문장 순으로 높아지는지 확인해 보세요.">
        <div className="d-flex flex-wrap gap-2 mb-2">
          {SAMPLES.map(([label, sample]) => (
            <button key={label} type="button" className={`btn btn-sm ${text === sample ? 'btn-dark' : 'btn-outline-secondary'}`}
                    aria-pressed={text === sample} onClick={() => setText(sample)}>{label}</button>
          ))}
        </div>
        <input className="form-control form-control-sm mb-2" aria-label="평가할 문장" value={text} maxLength={INPUT_MAX_LENGTH}
               onChange={(e) => setText(e.target.value)} />
        <div className="d-flex flex-wrap gap-1 align-items-end mb-2">
          {losses.map((t, i) => (
            <span key={i} className="d-inline-flex flex-column align-items-center">
              <WordChip id={t.target} style={{ background: `rgba(20,108,67,${(t.prob * 0.6).toFixed(3)})` }} title={`손실 ${t.loss.toFixed(2)}`} />
              <span className="small font-monospace text-body-secondary">{pct(t.prob)}</span>
            </span>
          ))}
        </div>
        <div className="small">
          평균 손실 <strong>{meanLoss.toFixed(2)}</strong> → 퍼플렉시티 e<sup>{meanLoss.toFixed(2)}</sup> = <strong>{Math.exp(meanLoss).toFixed(1)}</strong>
          <span className="text-body-secondary"> (모든 단어를 같은 확률로 고르면 {VOCAB.size})</span>
        </div>
        <div className="small text-body-secondary mt-1">
          {setPpl.map((s) => `${s.label} 전체 ${s.ppl.toFixed(1)}`).join(' · ')}
        </div>
      </Stage>

      <Stage step="2" title={`객관식 벤치마크 — 정답률 ${pct(accuracy(results))} (무작위 ${pct(1 / 4)})`}
             desc="앞부분에 이어질 보기 4개 중 하나를 고르는 문제다. 보기마다 모델의 평균 로그 확률을 계산해 가장 높은 보기를 답으로 본다. 문제를 누르면 보기별 점수를 보여 준다.">
        <div className="table-responsive">
          <table className="table table-sm table-hover small align-middle mb-3">
            <thead>
              <tr><th scope="col">#</th><th scope="col">문제</th><th scope="col">모델의 답</th><th scope="col">채점</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={i === selected ? 'table-active' : ''}>
                  <td>
                    <button type="button" className="btn btn-link btn-sm p-0" aria-pressed={i === selected} onClick={() => setSelected(i)}>
                      {i + 1}
                    </button>
                  </td>
                  <td>{r.item.stem} …</td>
                  <td>{LETTERS[r.pick]}. {r.item.choices[r.pick]}</td>
                  <td>{r.correct ? <span className="badge text-bg-success">정답</span> : <span className="badge text-bg-danger">오답 (정답 {LETTERS[r.item.answer]})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small fw-bold mb-1">{selected + 1}번 보기별 점수 (평균 로그 확률, 0에 가까울수록 자연스럽다고 봄)</div>
        <Bars items={cur.scores.map((s, i) => ({
          key: i, label: `${LETTERS[i]}. ${cur.item.stem} ${cur.item.choices[i]}`, value: Math.exp(s),
          tone: i === cur.item.answer ? 'success' : i === cur.pick ? 'danger' : undefined,
        }))} max={1} format={(v) => Math.log(v).toFixed(2)} />
        <p className="small text-body-secondary mt-1 mb-0">막대 길이는 e^점수(단어당 평균 확률). 초록은 정답, 빨강은 모델이 고른 오답.</p>
      </Stage>

      <Stage step="3" title={`데이터 오염 검사 — ${dirty.length}문제 오염`}
             desc={`문제 앞부분과 정답을 이은 문장을 단어 ${NGRAM}개씩 묶어, 학습 문장에 그대로 있는 묶음의 비율을 셌다. 오염된 문제와 깨끗한 문제의 정답률을 나눠 보면 점수가 어디서 나왔는지 드러난다.`}>
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-2">
            <thead>
              <tr><th scope="col">#</th><th scope="col">문제 + 정답</th><th scope="col" className="text-end">{NGRAM}-gram 겹침</th><th scope="col">판정</th><th scope="col">채점</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.item.stem} {r.item.choices[r.item.answer]}</td>
                  <td className="text-end font-monospace">{r.overlap.hits}/{r.overlap.total} ({pct(r.overlap.ratio)})</td>
                  <td>{r.contaminated ? <span className="badge text-bg-warning">오염</span> : <span className="badge text-bg-light border">깨끗</span>}</td>
                  <td>{r.correct ? '정답' : '오답'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex flex-wrap gap-2 small">
          <div className="border rounded px-2 py-1 bg-body-tertiary">오염된 문제 정답률 <strong>{pct(accuracy(dirty))}</strong> ({dirty.length}문제)</div>
          <div className="border rounded px-2 py-1 bg-body-tertiary">깨끗한 문제 정답률 <strong>{pct(accuracy(clean))}</strong> ({clean.length}문제)</div>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          실제 평가 보고서도 이렇게 오염된 문제를 빼고 다시 계산한 점수를 함께 싣는다. 깨끗한 문제의 점수가 모델의 진짜 실력에 가깝다.
        </p>
      </Stage>
    </LlmPage>
  )
}
