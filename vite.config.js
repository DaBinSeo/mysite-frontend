import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 게이트웨이(nginx 컨테이너)에서 접속할 수 있도록 모든 인터페이스에서 대기
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
})
