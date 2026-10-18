import { useMemo } from 'react'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'

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

  // EasyMDE에는 비활성 모드가 없어서 비활성일 때는 기존 textarea를 보여준다
  if (disabled) {
    return <textarea className="form-control" id={id} rows="10" value={value} disabled readOnly />
  }
  return <SimpleMDE id={id} value={value} onChange={onChange} options={options} />
}
