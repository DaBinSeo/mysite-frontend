import { useMemo, useState } from 'react'
import { RagPage } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { NEAR_DUP_THRESHOLD, RAW_SOURCES, docTitle, ingest } from '../utils/ragModel.js'

const FORMAT_LABEL = { html: 'HTML', markdown: '마크다운', text: '텍스트' }
const STATUS = {
  kept: { label: '남김', tone: 'success' },
  exact: { label: '완전 중복', tone: 'secondary' },
  near: { label: '옛 버전', tone: 'warning' },
}

const TERMS = {
  1: [
    ['수집 (Ingestion)', '웹 페이지·PDF·위키·DB 등 흩어진 원본을 모으는 것. 출처마다 형식과 품질이 다르므로 원본 위치와 수정일을 함께 기록해 둔다.'],
    ['커넥터', '노션·드라이브·사내 위키 같은 원본 저장소에서 문서를 주기적으로 가져오는 프로그램.'],
  ],
  2: [
    ['파싱 (Parsing)', '파일 형식을 해석해 사람이 읽는 본문만 꺼내는 것. HTML은 태그를, PDF는 글자 위치를, 표는 행·열 구조를 해석해야 한다.'],
    ['보일러플레이트', '메뉴·머리말·꼬리말·저작권 문구처럼 모든 페이지에 반복되는, 내용과 상관없는 부분. 남겨 두면 엉뚱한 질문에 걸린다.'],
  ],
  3: [
    ['정규화', '연속 공백·빈 줄·특수 공백(&nbsp;)을 하나로 정리하는 것. 같은 내용이 공백 때문에 다른 문서로 취급되지 않게 한다.'],
  ],
  4: [
    ['완전 중복', '공백을 빼고 내용이 글자 하나까지 같은 문서. 내용의 해시값을 비교해 찾는다.'],
    ['유사 중복 (Near-duplicate)', `내용이 대부분 겹치는 문서. 글자 3개씩 묶은 조각(shingle)의 겹침 비율(Jaccard)이 기준(기본 ${NEAR_DUP_THRESHOLD}) 이상이면 같은 문서의 다른 버전으로 보고 최신본만 남긴다.`],
    ['MinHash', '문서가 수백만 개면 모든 쌍을 비교할 수 없으므로, 조각 집합을 짧은 서명으로 줄여 비슷한 문서끼리만 비교하는 방법.'],
  ],
  5: [
    ['메타데이터', '본문 외에 붙이는 정보(제목·분류·수정일·공개 범위·원본 위치). 검색 필터, 출처 표시, 최신 문서 우선, 권한 확인에 쓴다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 1. 문서 수집·전처리 (로그인 불필요)
export default function RagIngest() {
  const [selected, setSelected] = useState('loan')
  const [threshold, setThreshold] = useState(NEAR_DUP_THRESHOLD)
  // 기준을 바꿀 때만 다시 전처리한다(문서 선택 때는 그대로)
  const { docs, pairs, status, kept } = useMemo(() => ingest(threshold), [threshold])
  const doc = docs.find((d) => d.id === selected)
  const staleKept = status['loan-2025'].kind === 'kept'

  return (
    <RagPage path="/rag/ingest"
             intro="여러 곳에서 모은 문서는 형식도 품질도 제각각입니다. 검색에 쓰기 전에 본문만 뽑고, 잡음을 지우고, 같은 문서와 옛 버전을 걸러 내고, 나중에 쓸 메타데이터를 붙입니다. 이 단계의 품질이 검색 품질의 상한을 정합니다.">
      <Stage step="1" title={`수집 — 문서 ${docs.length}개`}
             desc="도서관 홈페이지(HTML), 내부 위키(마크다운), 메모(텍스트)에서 문서를 모았다. 같은 문서가 두 경로로 들어오거나 옛 버전이 섞여 있다. 줄을 누르면 아래 단계에서 그 문서를 자세히 본다.">
        <div className="table-responsive">
          <table className="table table-sm table-hover small align-middle mb-0">
            <thead className="text-nowrap">
              <tr><th>ID</th><th>형식</th><th>제목</th><th>수정일</th><th className="text-end">원본 글자 수</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className={`rag-select-row ${d.id === selected ? 'table-active' : ''}`} onClick={() => setSelected(d.id)}>
                  <td>
                    {/* 키보드·스크린리더용 선택 버튼. 행 클릭은 마우스 편의용 */}
                    <button type="button" className="btn btn-link btn-sm p-0 font-monospace" aria-pressed={d.id === selected}
                            aria-label={`${d.id} 문서 자세히 보기`} onClick={() => setSelected(d.id)}>{d.id}</button>
                  </td>
                  <td>{FORMAT_LABEL[d.format]}</td>
                  <td>{d.title}</td>
                  <td className="text-nowrap">{d.updated}</td>
                  <td className="text-end font-monospace">{d.raw.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stage>

      <Stage step="2" title={`본문 추출 — ${doc.title} (${FORMAT_LABEL[doc.format]})`}
             desc="형식에 맞게 본문만 꺼낸다. HTML은 스크립트·메뉴·머리말·꼬리말 태그를 통째로 지우고 나머지 태그를 벗긴다. 마크다운은 제목·목록 기호를 떼고, 표는 '항목: 값' 문장으로 바꾼다.">
        <div className="row g-2">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">원본</div>
            <pre className="rag-doc border rounded p-2 mb-0 font-monospace small">{doc.raw}</pre>
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">추출 결과</div>
            <pre className="rag-doc border rounded p-2 mb-0 bg-body-tertiary">{doc.extracted}</pre>
          </div>
        </div>
        <div className="small mt-2">
          <span className="fw-bold">지운 부분</span>{' '}
          {doc.removed.length ? doc.removed.map((r, i) => <span key={i} className="badge text-bg-light border me-1 text-wrap">{r}</span>)
            : <span className="text-body-secondary">없음 (텍스트 문서는 그대로 둔다)</span>}
        </div>
      </Stage>

      <Stage step="3" title={`정제 — ${doc.extracted.length}자 → ${doc.text.length}자`}
             desc="연속 공백과 빈 줄을 하나로 줄이고, 설문·저작권 같은 안내 문구 줄을 지운다.">
        <pre className="rag-doc border rounded p-2 mb-2 bg-body-tertiary">{doc.text}</pre>
        <div className="small">
          <span className="fw-bold">지운 안내 문구</span>{' '}
          {doc.boilerplate.length ? doc.boilerplate.map((b) => <span key={b} className="badge text-bg-light border me-1">{b}</span>)
            : <span className="text-body-secondary">없음</span>}
        </div>
      </Stage>

      <Stage step="4" title={`중복 제거 — ${docs.length}개 → ${kept.length}개`}
             desc="정제한 본문을 비교한다. 해시가 같으면 완전 중복, 글자 조각 겹침(Jaccard)이 기준 이상이면 같은 문서의 옛 버전으로 보고 수정일이 가장 최근인 것만 남긴다.">
        <label className="form-label small mb-1" htmlFor="ingest-threshold">유사 중복 기준: {threshold.toFixed(2)}</label>
        <input id="ingest-threshold" type="range" className="form-range mb-2" min="0.3" max="1" step="0.05"
               value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        <div className="small fw-bold mb-1">겹침이 큰 문서 쌍 (상위 5개)</div>
        <ul className="list-unstyled small mb-3">
          {pairs.slice(0, 5).map((p) => (
            <li key={`${p.a}-${p.b}`} className="d-flex align-items-center gap-2 mb-1">
              <span className="font-monospace text-nowrap">{p.a} ↔ {p.b}</span>
              <span className="rag-mini-bar flex-grow-1" aria-hidden="true">
                <span style={{ width: `${p.sim * 100}%`, background: p.sim >= threshold ? '#b35309' : '#6c757d' }} />
              </span>
              <span className="font-monospace rag-score">{p.sim.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="d-flex flex-wrap gap-2 small">
          {docs.map((d) => {
            const s = status[d.id]
            return (
              <span key={d.id} className={`badge text-bg-${STATUS[s.kind].tone}`}
                    title={s.of ? `${docTitle(s.of)}(${s.of})와 겹침 ${s.sim.toFixed(2)}` : '남김'}>
                {d.id} · {STATUS[s.kind].label}{s.of ? ` (${s.of})` : ''}
              </span>
            )
          })}
        </div>
        {staleKept && (
          <div className="alert alert-warning small mt-3 mb-0">
            기준이 너무 높아 2025년판 대출 안내(최대 <strong>5권</strong>)가 2026년판(최대 <strong>7권</strong>)과 함께 남았습니다.
            이대로 색인하면 &ldquo;몇 권까지 빌릴 수 있나요?&rdquo;에 서로 다른 근거가 함께 검색되어 틀린 답이 나올 수 있습니다.
          </div>
        )}
      </Stage>

      <Stage step="5" title="메타데이터 부여"
             desc="남은 문서마다 메타데이터를 붙여 청크와 함께 저장한다. 4단계(분류 필터), 7단계(출처·수정일 표시), 9단계(공개 범위로 권한 필터)에서 쓴다.">
        <div className="table-responsive">
          <table className="table table-sm small mb-0">
            <thead className="text-nowrap">
              <tr><th>ID</th><th>제목</th><th>분류</th><th>수정일</th><th>공개 범위</th><th>원본 형식</th><th className="text-end">본문 글자 수</th></tr>
            </thead>
            <tbody>
              {kept.map((d) => (
                <tr key={d.id}>
                  <td className="font-monospace">{d.id}</td>
                  <td>{d.title}</td>
                  <td>{d.category}</td>
                  <td className="text-nowrap">{d.updated}</td>
                  <td>{d.access === 'staff' ? <span className="badge text-bg-danger">직원만</span> : <span className="badge text-bg-light border">누구나</span>}</td>
                  <td>{FORMAT_LABEL[d.format]}</td>
                  <td className="text-end font-monospace">{d.text.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          원본 {RAW_SOURCES.reduce((n, d) => n + d.raw.length, 0).toLocaleString()}자 중 검색에 쓸 본문은 {kept.reduce((n, d) => n + d.text.length, 0).toLocaleString()}자입니다.
        </p>
      </Stage>
    </RagPage>
  )
}
