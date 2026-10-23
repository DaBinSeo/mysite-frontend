// 시각화 화면(RAG·LLM)에서 함께 쓰는 단계 카드와 용어 설명

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
