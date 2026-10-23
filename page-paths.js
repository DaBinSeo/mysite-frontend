// React 화면 주소(src/App.jsx의 Route와 맞춘다). 여기에 없는 주소는 서버가 404 상태로 index.html을 보내고
// React가 404 화면을 그린다. 운영 서버 nginx(/etc/nginx/sites-available/gateway)에도 같은 정규식이 있다
export const PAGE_PATH = /^\/(questions(\/new|\/\d+(\/edit)?)?|answers\/\d+\/edit|login|signup|rag(\/build)?)?\/?$/
