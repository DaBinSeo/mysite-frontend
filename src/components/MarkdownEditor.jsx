import { Suspense, useEffect, useMemo, useRef } from 'react'
import { CONTENT_MAX_LENGTH, checkContentLength, contentLength } from '../utils/content.js'
import { lazyWithReload } from '../utils/lazyLoad.js'

// EasyMDE(CodeMirror 포함)는 크기가 커서 편집기를 처음 그릴 때만 내려받는다
const SimpleMDE = lazyWithReload(() => Promise.all([
  import('react-simplemde-editor'),
  // CSS만 실패하면 모양이 덜 꾸며질 뿐 입력은 되므로 무시한다
  import('easymde/dist/easymde.min.css').catch(() => {}),
]).then(([module]) => module))

// 마크다운 입력기 (EasyMDE). 화면 출력은 여전히 서버의 content_html만 쓴다
export default function MarkdownEditor({ id, value, onChange, disabled }) {
  // options가 렌더링마다 새로 만들어지면 에디터가 다시 생성돼 포커스를 잃는다
  const options = useMemo(() => ({
    spellChecker: false, // 영어 맞춤법 검사라 한글에 빨간 줄이 그어짐
    status: false,
    minHeight: '200px',
    // 미리보기는 브라우저에서 marked로 그려 nh3를 거치지 않으므로 끈다
    hideIcons: ['preview', 'side-by-side', 'fullscreen', 'guide'],
    shortcuts: { togglePreview: null, toggleSideBySide: null, toggleFullScreen: null },
  }), [])

  // 제한을 넘는 순간에 한 번 알린다 (넘은 채로 계속 입력할 때마다 알리지는 않는다)
  const overRef = useRef(false)
  useEffect(() => {
    overRef.current = contentLength(value) > CONTENT_MAX_LENGTH // 등록 후 비우기처럼 밖에서 값이 바뀐 경우
  }, [value])
  const handleChange = (next) => {
    const over = contentLength(next) > CONTENT_MAX_LENGTH
    if (over && !overRef.current) checkContentLength(next)
    overRef.current = over
    onChange(next)
  }

  // EasyMDE에는 비활성 모드가 없어서 비활성일 때는 기존 textarea를 보여준다
  if (disabled) {
    return <textarea className="form-control" id={id} rows="10" value={value} disabled readOnly />
  }
  const length = contentLength(value)
  return (
    <>
      {/* 받는 동안은 일반 입력칸으로 입력을 받는다 */}
      <Suspense fallback={<textarea className="form-control" id={id} rows="10" value={value}
                                    onChange={(e) => handleChange(e.target.value)} />}>
        <SimpleMDE id={id} value={value} onChange={handleChange} options={options} />
      </Suspense>
      <div className={`form-text text-end ${length > CONTENT_MAX_LENGTH ? 'text-danger fw-bold' : ''}`}>
        {length.toLocaleString()} / {CONTENT_MAX_LENGTH.toLocaleString()}자
      </div>
    </>
  )
}
