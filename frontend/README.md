# Whatap Picker Frontend

마케팅 행사 경품 뽑기용 Next.js web app입니다.

## 실행

```bash
cd frontend
npm install
npm run dev -- -p 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## Vercel 배포

- Root Directory: `frontend`
- Build Command: `npm run build`
- Development Command: `npm run dev`
- Install Command: `npm install`

`frontend/vercel.json`에도 동일한 설정을 명시해두었습니다.

배포 환경에서는 `API_BASE_URL` 값을 읽어 `/api/*` 요청을 백엔드 API 서버로 rewrite합니다.
Vercel에서는 Project Settings > Environment Variables에 `API_BASE_URL`을 추가하고 값을 `http://<API_SERVER_IP>:8080` 형식으로 넣습니다.
로컬 확인이 필요하면 gitignore 대상인 `frontend/.env.local`에 같은 값을 넣습니다.

## 검증

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
npm run verify
```

## 기능

- Next.js App Router + client-only 뽑기 화면
- shadcn 스타일 UI
- Canvas 기반 뽑기 차트
- 흰 칸까지 선택 가능한 50×10 구성의 정확한 500칸 고정 보드
- 행사 모니터용 전체 화면 표시
- 기본 로고 favicon, 버티컬 로고 상단 표시
- 칸 선택 시 경품 결과 공개

데이터는 브라우저 `localStorage`에 저장됩니다.
