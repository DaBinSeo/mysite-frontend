import { useMemo, useState } from 'react'
import { Bars, Heatmap, LlmPage } from '../components/LlmViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { makeRng, quantize, randn, simulateBatching } from '../utils/llmModel.js'
import { chunkColor } from '../utils/rag.js'

const WEIGHT_COUNT = 256
const GRID = 16
const GROUP_SIZES = [16, 64, WEIGHT_COUNT]
const PREVIEW = 6
const REQUEST_LENGTHS = [3, 8, 2, 6, 9, 4, 2, 7, 5, 3]

// 공개된 모델들의 대략적인 구조 (kvDim은 GQA로 줄인 K·V 차원)
const PRESETS = [
  { label: '1B급', params: 1.2e9, layers: 16, kvDim: 512 },
  { label: '7B급', params: 7e9, layers: 32, kvDim: 1024 },
  { label: '70B급', params: 70e9, layers: 80, kvDim: 1024 },
]
const PRECISIONS = [[16, 'FP16/BF16'], [8, 'INT8'], [4, 'INT4']]
const GPUS = [24, 80]

const TERMS = {
  1: [
    ['양자화 (Quantization)', '16비트 실수 가중치를 8·4비트 정수로 바꿔 저장하는 것. 메모리와 읽기 시간이 줄고, 대신 약간의 오차가 생긴다.'],
    ['scale', '정수를 원래 크기로 되돌리는 배율. 그룹 안의 절댓값 최대가 정수 최댓값에 오도록 정한다.'],
    ['그룹 양자화', '가중치를 작은 묶음으로 나눠 묶음마다 scale을 따로 둔다. 큰 값(이상치) 하나가 다른 값들의 정밀도를 망치는 것을 막는다.'],
  ],
  2: [
    ['가중치 메모리', '매개변수 수 × 비트 수 ÷ 8 바이트. 7B 모델은 16비트면 약 14GB, 4비트면 약 3.5GB다.'],
    ['KV 캐시 메모리', '층 수 × 2(K·V) × K·V 차원 × 토큰 수 × 동시 요청 수 × 2바이트. 긴 문맥·많은 동시 요청에서는 가중치보다 커지기도 한다.'],
    ['GQA', 'Grouped-Query Attention. 여러 Query 헤드가 K·V 헤드를 나눠 써서 KV 캐시를 줄이는 구조.'],
  ],
  3: [
    ['배치 처리', 'GPU는 요청 여러 개를 한 번에 계산해도 시간이 거의 같으므로, 요청을 묶을수록 처리량이 늘어난다.'],
    ['연속 배치 (Continuous batching)', '먼저 끝난 요청의 자리에 바로 다음 요청을 넣는다. vLLM 같은 서빙 엔진의 기본 방식이다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

const gb = (bytes) => bytes / 1e9

// 대부분 0 근처에 몰리고 가끔 큰 값(이상치)이 섞인 가중치
function sampleWeights(seed) {
  const rng = makeRng(seed)
  return Array.from({ length: WEIGHT_COUNT }, () => randn(rng) * 0.05 * (rng() < 0.02 ? 8 : 1))
}

const toGrid = (values) => Array.from({ length: GRID }, (_, r) => values.slice(r * GRID, (r + 1) * GRID))

// 배치 타임라인: 행 = GPU 자리, 열 = 시간(토큰 생성 스텝), 색 = 요청 번호
function Timeline({ grid }) {
  return (
    <div className="table-responsive">
      <table className="llm-grid small mb-0">
        <tbody>
          {grid.map((row, s) => (
            <tr key={s}>
              <th scope="row" className="text-end text-nowrap">자리 {s + 1}</th>
              {row.map((req, t) => (
                <td key={t} style={{ background: req === null ? undefined : chunkColor(req), color: '#fff', fontSize: '0.6rem', textAlign: 'center' }}
                    title={req === null ? '빈자리' : `요청 ${req + 1}`}>
                  {req === null ? '' : req + 1}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 9. 경량화·서빙 (로그인 불필요)
export default function LlmServing() {
  const [bits, setBits] = useState(4)
  const [groupSize, setGroupSize] = useState(64)
  const [seed, setSeed] = useState(5)
  const [preset, setPreset] = useState(1)
  const [precision, setPrecision] = useState(16)
  const [context, setContext] = useState(8192)
  const [users, setUsers] = useState(8)
  const [batchSize, setBatchSize] = useState(4)

  const weights = useMemo(() => sampleWeights(seed), [seed])
  const q = useMemo(() => quantize(weights, bits, groupSize), [weights, bits, groupSize])
  const limit = Math.max(...weights.map(Math.abs))
  const errors = weights.map((w, i) => w - q.deq[i])
  const origBytes = WEIGHT_COUNT * 2
  const quantBytes = (WEIGHT_COUNT * bits) / 8 + q.scales.length * 2

  const model = PRESETS[preset]
  const weightMem = gb((model.params * precision) / 8)
  const kvMem = gb(model.layers * 2 * model.kvDim * context * users * 2)
  const total = weightMem + kvMem

  const staticRun = simulateBatching(REQUEST_LENGTHS, batchSize, false)
  const continuousRun = simulateBatching(REQUEST_LENGTHS, batchSize, true)

  return (
    <LlmPage path="/llm/serving"
             intro="학습이 끝난 모델을 서비스하려면 GPU 메모리에 올리고 많은 요청을 빠르게 처리해야 합니다. 가중치를 적은 비트로 줄이는 양자화, 메모리 계산, 요청을 묶어 처리하는 배치 방식을 살펴봅니다.">
      <Stage step="1" title={`양자화 — ${bits}비트, 그룹 ${groupSize === WEIGHT_COUNT ? '전체 하나' : `${groupSize}개씩`}`}
             desc={`가중치 ${WEIGHT_COUNT}개(16 × 16)를 ${bits}비트 정수(−${2 ** (bits - 1) - 1} ~ ${2 ** (bits - 1) - 1})로 바꿨다가 되돌린 값과 오차다. 비트를 줄이거나 그룹을 크게 하면 오차(오른쪽)가 커진다. 드문드문 진한 칸이 이상치다.`}>
        <div className="row g-3 align-items-end mb-2">
          <div className="col-6 col-md-4">
            <label className="form-label small mb-1" htmlFor="sv-bits">비트 수: {bits}</label>
            <input id="sv-bits" type="range" className="form-range" min="2" max="8"
                   value={bits} onChange={(e) => setBits(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-4">
            <label className="form-label small mb-1" htmlFor="sv-group">그룹 크기</label>
            <select id="sv-group" className="form-select form-select-sm" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}>
              {GROUP_SIZES.map((g) => <option key={g} value={g}>{g === WEIGHT_COUNT ? `전체 하나 (${g})` : `${g}개씩`}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={() => setSeed((s) => s + 1)}>가중치 다시 뽑기</button>
          </div>
        </div>
        <div className="row g-3">
          {[['원래 가중치 (16비트)', weights, limit], [`양자화 → 복원 (${bits}비트)`, q.deq, limit], ['오차 (원래 − 복원)', errors, limit / 4]].map(([title, values, max]) => (
            <div key={title} className="col-12 col-md-4">
              <div className="small fw-bold mb-1">{title}</div>
              <Heatmap rows={toGrid(values)} max={max} label={title} />
            </div>
          ))}
        </div>
        <div className="d-flex flex-wrap gap-2 small mt-2">
          <div className="border rounded px-2 py-1 bg-body-tertiary">평균 제곱 오차 <strong>{q.mse.toExponential(2)}</strong></div>
          <div className="border rounded px-2 py-1 bg-body-tertiary">
            크기 {origBytes}바이트 → <strong>{quantBytes}</strong>바이트 (scale {q.scales.length}개 포함, {(origBytes / quantBytes).toFixed(1)}배 작음)
          </div>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-sm small font-monospace mb-0">
            <thead>
              <tr><th scope="col">원래 값</th><th scope="col">÷ scale → 반올림 (정수)</th><th scope="col">× scale (복원)</th></tr>
            </thead>
            <tbody>
              {weights.slice(0, PREVIEW).map((w, i) => (
                <tr key={i}>
                  <td>{w.toFixed(4)}</td>
                  <td>{Math.round(q.deq[i] / q.scales[Math.floor(i / groupSize)])}</td>
                  <td>{q.deq[i].toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stage>

      <Stage step="2" title={`GPU 메모리 계산 — 약 ${total.toFixed(1)}GB`}
             desc="모델을 올리는 데 필요한 메모리는 가중치와 KV 캐시가 대부분이다. 정밀도를 낮추면 가중치가, 문맥 길이·동시 요청 수를 줄이면 KV 캐시가 줄어든다.">
        <div className="row g-3 align-items-end mb-2">
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="sv-preset">모델 크기</label>
            <select id="sv-preset" className="form-select form-select-sm" value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
              {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label} ({p.layers}층)</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="sv-precision">가중치 정밀도</label>
            <select id="sv-precision" className="form-select form-select-sm" value={precision} onChange={(e) => setPrecision(Number(e.target.value))}>
              {PRECISIONS.map(([b, label]) => <option key={b} value={b}>{label}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="sv-context">문맥 길이: {context.toLocaleString()}토큰</label>
            <input id="sv-context" type="range" className="form-range" min="1024" max="131072" step="1024"
                   value={context} onChange={(e) => setContext(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="sv-users">동시 요청: {users}개</label>
            <input id="sv-users" type="range" className="form-range" min="1" max="64"
                   value={users} onChange={(e) => setUsers(Number(e.target.value))} />
          </div>
        </div>
        <Bars items={[
          { key: 'w', label: '가중치', value: weightMem },
          { key: 'kv', label: 'KV 캐시', value: kvMem, tone: 'danger' },
          { key: 'all', label: '합계', value: total, tone: 'success' },
        ]} max={Math.max(total, ...GPUS)} format={(v) => `${v.toFixed(1)}GB`} />
        <div className="small mt-2">
          {GPUS.map((g) => (
            <span key={g} className={`badge me-1 ${total <= g ? 'text-bg-success' : 'text-bg-danger'}`}>
              {g}GB GPU 1장: {total <= g ? '올라감' : `부족 (최소 ${Math.ceil(total / g)}장)`}
            </span>
          ))}
        </div>
      </Stage>

      <Stage step="3" title={`배치 처리 — 정적 ${staticRun.time}스텝 vs 연속 ${continuousRun.time}스텝`}
             desc={`길이가 다른 요청 ${REQUEST_LENGTHS.length}개(칸 수 = 생성할 토큰 수)를 GPU 자리 ${batchSize}개로 처리한다. 정적 배치는 묶음에서 가장 긴 요청이 끝날 때까지 다른 자리가 비어 기다리고, 연속 배치는 빈자리에 바로 다음 요청을 넣는다.`}>
        <label className="form-label small mb-1" htmlFor="sv-batch">배치 크기: {batchSize}</label>
        <input id="sv-batch" type="range" className="form-range mb-2" min="2" max="6"
               value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
        <div className="small fw-bold mb-1">정적 배치 — 총 {staticRun.time}스텝, GPU 사용률 {Math.round(staticRun.utilization * 100)}%</div>
        <Timeline grid={staticRun.grid} />
        <div className="small fw-bold mt-3 mb-1">연속 배치 — 총 {continuousRun.time}스텝, GPU 사용률 {Math.round(continuousRun.utilization * 100)}%</div>
        <Timeline grid={continuousRun.grid} />
      </Stage>
    </LlmPage>
  )
}
