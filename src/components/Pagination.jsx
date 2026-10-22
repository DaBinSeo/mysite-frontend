// 페이징처리: 현재 페이지 앞뒤 5페이지까지 표시 (question_list.html)
export default function Pagination({ page, numPages, onChange }) {
  const pages = []
  for (let n = Math.max(1, page - 5); n <= Math.min(numPages, page + 5); n++) pages.push(n)

  const item = (label, target, { disabled = false, active = false } = {}) => (
    <li key={label} className={`page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}>
      <button type="button" className="page-link" disabled={disabled} onClick={() => onChange(target)}>
        {label}
      </button>
    </li>
  )

  return (
    <ul className="pagination flex-wrap justify-content-center">
      {/* 이전페이지 */}
      {item('이전', page - 1, { disabled: page <= 1 })}
      {/* 페이지리스트 */}
      {pages.map((n) => item(n, n, { active: n === page }))}
      {/* 다음페이지 */}
      {item('다음', page + 1, { disabled: page >= numPages })}
    </ul>
  )
}
