import { useMemo, useState } from 'react'
import { LineChart } from '../components/VizCharts.jsx'
import { ChunkBadge, QueryInput, RagPage, Scatter } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { EVAL_SET, KB_CHUNKS, KB_DIM, denseEmbed, exactSearch, ivfSearch, kmeans, projectPoint } from '../utils/ragModel.js'

const K = 3
const CLUSTER_COLORS = ['#0b5ed7', '#b35309', '#146c43', '#c2185b', '#6f42c1', '#0f766e']
const PRESETS = ['책을 늦게 돌려주면 어떻게 되나요?', '주차는 무료인가요?', '아이와 함께 갈 만한 프로그램이 있나요?']
const DIMS = [384, 768, 1536, 3072]
// 대략적인 처리 속도 가정: CPU 한 코어가 1초에 곱셈·덧셈 50억 번
const OPS_PER_SEC = 5e9

const TERMS = {
  1: [
    ['IVF (Inverted File Index)', '벡터를 k-means로 nlist개 묶음(클러스터)으로 나눠 두고, 질문과 가까운 묶음 몇 개만 뒤지는 인덱스. FAISS의 대표 방식이다.'],
    ['k-means', '점들을 k개 묶음으로 나누는 방법. 중심점을 정하고 → 각 점을 가장 가까운 중심에 배정하고 → 중심을 배정된 점들의 평균으로 옮기기를 반복한다.'],
  ],
  2: [
    ['nprobe', '검색할 때 뒤질 묶음 수. 크면 정확하지만 느리고, 작으면 빠르지만 정답이 다른 묶음에 있으면 놓친다.'],
    ['재현율 (Recall@k)', '전부 비교했을 때(정확 검색)의 top-k 중 근사 검색이 찾아낸 비율. 1이면 정확 검색과 결과가 같다.'],
  ],
  3: [
    ['ANN', 'Approximate Nearest Neighbor(근사 최근접 이웃) 검색. 아주 조금의 정확도를 내주고 검색 속도를 수십~수천 배 높인다.'],
    ['HNSW', '벡터들을 여러 층의 그래프로 이어 두고, 위층에서 큰 걸음으로 → 아래층에서 작은 걸음으로 가까운 이웃을 따라가는 인덱스. 빠르고 정확해서 많이 쓰지만 메모리를 더 쓴다.'],
  ],
  4: [
    ['벡터 DB', '벡터 인덱스에 원문·메타데이터 저장, 필터, 추가·삭제, 복제를 더한 데이터베이스. 예: pgvector, Qdrant, Milvus, Elasticsearch.'],
    ['양자화 (PQ·int8)', '벡터의 숫자를 적은 비트로 줄여 저장하는 것. 메모리가 4~32배 줄고 비교도 빨라지지만 거리 계산이 조금 부정확해진다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : ms >= 1 ? `${ms.toFixed(0)}ms` : `${ms.toFixed(2)}ms`
}

// 3. 벡터 인덱스·근사 검색 (로그인 불필요)
export default function RagIndex() {
  const [nlist, setNlist] = useState(4)
  const [nprobe, setNprobe] = useState(1)
  const [query, setQuery] = useState(PRESETS[0])
  const [scaleExp, setScaleExp] = useState(6)
  const [dim, setDim] = useState(768)
  const [int8, setInt8] = useState(false)

  const vectors = useMemo(() => KB_CHUNKS.map((c) => c.vector), [])
  const ivf = useMemo(() => kmeans(vectors, nlist), [vectors, nlist])
  const probe = Math.min(nprobe, nlist)
  const qvec = useMemo(() => denseEmbed(query), [query])
  const qPoint = projectPoint(qvec)
  const approx = ivfSearch(ivf, KB_CHUNKS, qvec, probe, K)
  const exact = exactSearch(KB_CHUNKS, qvec, K)
  const exactSet = new Set(exact.map((e) => e.i))
  const recall = approx.top.filter((t) => exactSet.has(t.i)).length / K

  // nprobe를 1부터 nlist까지 바꿨을 때 평가 질문 전체의 평균 재현율과 비교 횟수(전체 대비)
  const sweep = useMemo(() => {
    const qs = EVAL_SET.map((it) => denseEmbed(it.q))
    return Array.from({ length: nlist }, (_, p) => {
      let r = 0
      let cmp = 0
      for (const v of qs) {
        const ex = new Set(exactSearch(KB_CHUNKS, v, K).map((e) => e.i))
        const ap = ivfSearch(ivf, KB_CHUNKS, v, p + 1, K)
        r += ap.top.filter((t) => ex.has(t.i)).length / K
        cmp += ap.comparisons / KB_CHUNKS.length
      }
      return { recall: r / qs.length, cost: cmp / qs.length }
    })
  }, [ivf, nlist])

  const N = 10 ** scaleExp
  const bytes = N * dim * (int8 ? 1 : 4)
  const scaleNlist = Math.round(4 * Math.sqrt(N))
  const scaleProbe = Math.min(16, scaleNlist)
  const ivfCompare = scaleNlist + scaleProbe * (N / scaleNlist)

  return (
    <RagPage path="/rag/index"
             intro="질문이 올 때마다 모든 청크와 유사도를 계산하면, 청크가 수백만 개일 때 너무 느립니다. 그래서 미리 벡터를 비슷한 것끼리 묶어 두고 일부만 뒤지는 인덱스를 만듭니다. 예시 청크는 적지만 원리는 같습니다.">
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="idx-nlist">묶음 수 (nlist): {nlist}</label>
            <input id="idx-nlist" type="range" className="form-range" min="2" max={CLUSTER_COLORS.length}
                   value={nlist} onChange={(e) => setNlist(Number(e.target.value))} />
          </div>
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="idx-nprobe">뒤질 묶음 수 (nprobe): {probe}</label>
            <input id="idx-nprobe" type="range" className="form-range" min="1" max={nlist}
                   value={probe} onChange={(e) => setNprobe(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <Stage step="1" title={`k-means로 묶기 — 청크 ${KB_CHUNKS.length}개 → 묶음 ${nlist}개`}
             desc={`${KB_DIM}차원 청크 벡터를 k-means로 나눴다. 점은 청크(색 = 묶음), ×는 묶음의 중심이다. 그림은 PCA로 2차원에 줄인 것이라 실제 거리와 조금 다르다.`}>
        <Scatter label="청크 벡터를 묶음별 색으로 그린 산점도"
                 points={KB_CHUNKS.map((c, i) => ({
                   key: c.id, x: c.point[0], y: c.point[1], color: CLUSTER_COLORS[ivf.assign[i]],
                   label: i + 1, title: `${c.id} (묶음 ${ivf.assign[i] + 1}) ${c.text.slice(0, 40)}`,
                 }))}
                 marks={ivf.centroids.map((c, j) => {
                   const [x, y] = projectPoint(c)
                   return { key: j, x, y, color: CLUSTER_COLORS[j], title: `묶음 ${j + 1} 중심` }
                 })} />
        <div className="row g-2 mt-1">
          {ivf.centroids.map((_, j) => (
            <div key={j} className="col-12 col-md-6 small">
              <span className="badge me-1" style={{ background: CLUSTER_COLORS[j] }}>묶음 {j + 1}</span>
              {KB_CHUNKS.filter((_, i) => ivf.assign[i] === j).map((c) => <ChunkBadge key={c.id} chunk={c} className="me-1" />)}
            </div>
          ))}
        </div>
      </Stage>

      <QueryInput value={query} onChange={setQuery} presets={PRESETS} />

      <Stage step="2" title={`IVF 검색 — 비교 ${approx.comparisons}번 (전부 비교하면 ${KB_CHUNKS.length}번), 재현율 ${recall.toFixed(2)}`}
             desc={`질문(★)과 묶음 중심 ${nlist}개를 먼저 비교해 가까운 묶음 ${probe}개를 고르고(테두리), 그 안의 청크만 비교해 top-${K}를 고른다. 흐린 점은 비교하지 않은 청크다.`}>
        <Scatter label="IVF 검색: 뒤진 묶음과 질문 위치"
                 points={KB_CHUNKS.map((c, i) => ({
                   key: c.id, x: c.point[0], y: c.point[1], color: CLUSTER_COLORS[ivf.assign[i]], label: i + 1,
                   title: c.id, dim: !approx.probed.has(ivf.assign[i]), ring: approx.top.some((t) => t.i === i),
                 }))}
                 star={{ x: qPoint[0], y: qPoint[1], title: `질문: ${query}` }} />
        <div className="row g-3 mt-1 small">
          <div className="col-12 col-md-6">
            <div className="fw-bold mb-1">IVF 결과 (nprobe {probe})</div>
            <ol className="mb-0 ps-3">
              {approx.top.map((t) => (
                <li key={t.i}><ChunkBadge chunk={KB_CHUNKS[t.i]} /> {t.sim.toFixed(3)} {!exactSet.has(t.i) && <span className="badge text-bg-warning">정확 검색엔 없음</span>}</li>
              ))}
            </ol>
          </div>
          <div className="col-12 col-md-6">
            <div className="fw-bold mb-1">정확 검색 (전부 비교)</div>
            <ol className="mb-0 ps-3">
              {exact.map((t) => (
                <li key={t.i}><ChunkBadge chunk={KB_CHUNKS[t.i]} /> {t.sim.toFixed(3)} {!approx.top.some((a) => a.i === t.i) && <span className="badge text-bg-danger">IVF가 놓침</span>}</li>
              ))}
            </ol>
          </div>
        </div>
      </Stage>

      <Stage step="3" title="nprobe에 따른 정확도·계산량"
             desc={`평가 질문 ${EVAL_SET.length}개로 nprobe를 1부터 ${nlist}까지 바꿔 봤다. 묶음을 많이 뒤질수록 재현율은 1에 가까워지지만 비교 횟수(전부 비교 대비)도 늘어난다. 묶음 중심과의 비교가 더해지므로 다 뒤지면 오히려 100%를 넘는다.`}>
        <LineChart label="nprobe별 재현율과 계산량" xMax={nlist - 1} yMax={Math.max(1.2, ...sweep.map((s) => s.cost))}
                   format={(v) => v.toFixed(1)}
                   marker={probe - 1}
                   series={[
                     { label: '평균 재현율@3', color: '#146c43', points: sweep.map((s) => s.recall) },
                     { label: '비교 횟수 (전부 비교 = 1)', color: '#b02a37', points: sweep.map((s) => s.cost) },
                   ]} />
        <p className="small text-body-secondary mb-0">가로축: nprobe − 1 (0 = 묶음 1개만 뒤짐). 세로선이 지금 설정이다.</p>
      </Stage>

      <Stage step="4" title="규모 계산기 — 실제 서비스라면?"
             desc="청크 수와 임베딩 차원으로 벡터 저장 용량과 질문 하나당 비교 횟수를 어림한다. IVF는 흔히 쓰는 설정(nlist ≈ 4√N, nprobe 16)으로 계산했다.">
        <div className="row g-3 align-items-end mb-3">
          <div className="col-12 col-md-5">
            <label className="form-label small mb-1" htmlFor="idx-scale">청크 수: {N.toLocaleString()}개</label>
            <input id="idx-scale" type="range" className="form-range" min="4" max="9"
                   value={scaleExp} onChange={(e) => setScaleExp(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-4">
            <label className="form-label small mb-1" htmlFor="idx-dim">임베딩 차원</label>
            <select id="idx-dim" className="form-select form-select-sm" value={dim} onChange={(e) => setDim(Number(e.target.value))}>
              {DIMS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <div className="form-check">
              <input id="idx-int8" type="checkbox" className="form-check-input" checked={int8} onChange={(e) => setInt8(e.target.checked)} />
              <label className="form-check-label small" htmlFor="idx-int8">int8 양자화</label>
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-sm small mb-0">
            <tbody>
              <tr><th scope="row">벡터 저장 용량</th><td className="font-monospace">{formatBytes(bytes)}</td>
                <td className="text-body-secondary">{N.toLocaleString()} × {dim} × {int8 ? '1바이트(int8)' : '4바이트(float32)'}</td></tr>
              <tr><th scope="row">전부 비교</th><td className="font-monospace">{N.toLocaleString()}번</td>
                <td className="text-body-secondary">≈ {formatMs((N * dim / OPS_PER_SEC) * 1000)} / 질문</td></tr>
              <tr><th scope="row">IVF (nlist {scaleNlist.toLocaleString()}, nprobe {scaleProbe})</th>
                <td className="font-monospace">{Math.round(ivfCompare).toLocaleString()}번</td>
                <td className="text-body-secondary">≈ {formatMs((ivfCompare * dim / OPS_PER_SEC) * 1000)} / 질문 · 전부 비교의 {((ivfCompare / N) * 100).toPrecision(2)}%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">시간은 CPU 한 코어가 1초에 계산 50억 번을 한다고 가정한 값입니다. 실제로는 여러 코어·GPU를 쓰고, 메모리 읽기 속도에도 영향을 받습니다.</p>
      </Stage>
    </RagPage>
  )
}
