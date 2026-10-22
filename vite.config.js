import { readFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { PAGE_PATH } from './page-paths.js'

// 개발 서버도 운영처럼 없는 화면 주소에 404 상태 코드를 준다(Vite는 모든 주소에 200으로 index.html을 준다)
function notFoundStatus() {
  return {
    name: 'not-found-status',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url.split('?')[0] // new URL()은 '//' 같은 주소에서 예외가 나 개발 서버가 죽을 수 있다
        const isPage = req.method === 'GET' && req.headers.accept?.includes('text/html')
          && !path.startsWith('/@') && !path.split('/').pop().includes('.') // Vite 내부 경로·파일 제외
        if (!isPage || PAGE_PATH.test(path)) return next()
        try {
          const html = await server.transformIndexHtml(req.url, await readFile(`${server.config.root}/index.html`, 'utf-8'))
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), notFoundStatus()],
  // 게이트웨이(nginx 컨테이너)에서 접속할 수 있도록 모든 인터페이스에서 대기
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
})
