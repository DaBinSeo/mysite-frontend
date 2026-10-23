// 시각화 화면(RAG·LLM)에서 함께 쓰는 단계 카드·용어 설명·단계 화면 틀
import { Link } from 'react-router'
import { useTitle } from '../utils/useTitle.js'
import { stepGroups, stepTitle } from '../utils/vizSteps.js'

// 카드 하단 용어 설명
export function Terms({ items }) {
  return (
    <dl className="rag-terms small mb-0">
      {items.map(([term, desc]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{desc}</dd>
        </div>
      ))}
    </dl>
  )
}

// 단계 카드 공통 틀. terms가 있으면 카드 하단에 용어 설명을 붙인다
export function StageCard({ step, title, desc, terms, children }) {
  return (
    <section className="card mb-3 rag-stage">
      <div className="card-header d-flex align-items-baseline gap-2">
        <span className="badge text-bg-dark">{step}</span>
        <strong>{title}</strong>
      </div>
      <div className="card-body">
        {desc && <p className="text-body-secondary small mb-3">{desc}</p>}
        {children}
      </div>
      {terms && (
        <div className="card-footer bg-body-tertiary">
          <Terms items={terms} />
        </div>
      )}
    </section>
  )
}

// 단계별 화면 공통 틀: 단계 제목·소개 → 내용 → 이전/다음 단계 버튼. steps는 메뉴의 단계 목록, prefix는 문서 제목 앞말
export function StepPage({ steps, prefix, path, intro, children }) {
  const step = steps.find((s) => s.path === path)
  useTitle(`${prefix} ${stepTitle(step)}`)
  return (
    <div className="container my-3 pb-5">
      <h4 className="border-bottom pb-2">{stepTitle(step)}</h4>
      <p className="text-body-secondary small">
        {intro} 모든 계산은 브라우저에서 하는 학습용 축소판입니다.
      </p>
      {children}
      <StepNav steps={steps} prefix={prefix} path={path} />
    </div>
  )
}

export function StepNav({ steps, prefix, path }) {
  const i = steps.findIndex((s) => s.path === path)
  const prev = steps[i - 1]
  const next = steps[i + 1]
  return (
    <nav className="d-flex flex-wrap gap-2 mt-4 pt-3 border-top" aria-label={`${prefix} 구축 단계 이동`}>
      {prev && <Link className="btn btn-outline-secondary btn-sm" to={prev.path}>← {stepTitle(prev)}</Link>}
      {next && <Link className="btn btn-primary btn-sm ms-auto" to={next.path}>{stepTitle(next)} →</Link>}
    </nav>
  )
}

// 전체 흐름 지도: 묶음(A, B, …)별 단계 카드. 카드를 누르면 그 단계 화면으로 이동한다
export function FlowMap({ steps }) {
  return stepGroups(steps).map(({ group, steps: groupSteps }, g) => (
    <section key={group} className="mb-3">
      <h5 className="h6 d-flex align-items-center gap-2">
        <span className="badge text-bg-dark">{String.fromCharCode(65 + g)}</span> {group}
      </h5>
      <div className="row g-2">
        {groupSteps.map((step) => (
          <div key={step.path} className="col-12 col-md-6 col-lg-4">
            <Link to={step.path} className="card h-100 text-reset text-decoration-none llm-flow-card">
              <div className="card-body">
                <div className="fw-bold mb-1">{stepTitle(step)}</div>
                <p className="small text-body-secondary mb-2">{step.desc}</p>
                <div className="small d-flex flex-wrap align-items-center gap-1">
                  <span className="border rounded px-1 bg-body-tertiary">{step.input}</span>
                  <span className="text-body-tertiary" aria-hidden="true">→</span><span className="visually-hidden">에서</span>
                  <span className="border rounded px-1 bg-body-tertiary fw-bold">{step.output}</span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  ))
}
