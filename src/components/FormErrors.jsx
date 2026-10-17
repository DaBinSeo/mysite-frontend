// 필드 오류와 넌필드 오류를 출력한다. (form_errors.html)
// error: ApiError. 필드 오류(errors)가 없으면 detail 메시지만 보여 준다.
export default function FormErrors({ error, labels = {} }) {
  if (!error) return null
  const entries = Object.entries(error.errors ?? {})
  const fieldErrors = entries.filter(([field]) => field !== '__all__')
  const nonFieldErrors = error.errors?.__all__ ?? []

  return (
    <div className="alert alert-danger" role="alert">
      {entries.length === 0 && <div>{error.message}</div>}
      {/* 필드 오류 */}
      {fieldErrors.map(([field, messages]) => (
        <div key={field}>
          <strong>{labels[field] ?? field}</strong>
          <ul className="errorlist">
            {messages.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      ))}
      {/* 넌필드 오류 */}
      {nonFieldErrors.map((m) => (
        <div key={m}><strong>{m}</strong></div>
      ))}
    </div>
  )
}
