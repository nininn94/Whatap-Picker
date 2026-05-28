# Whatap Picker Frontend

마케팅 행사 경품 뽑기용 static web app입니다.

## 실행

```bash
cd frontend
npm install
npm run dev -- --port 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```

## 기능

- React CSR + shadcn 스타일 UI
- Canvas 기반 뽑기 차트
- 흰 칸까지 선택 가능한 50×10 구성의 정확한 500칸 고정 보드
- 행사 모니터용 전체 화면 표시
- 기본 로고 favicon, 버티컬 로고 상단 표시
- 칸 선택 시 경품 결과 공개

데이터는 브라우저 `localStorage`에 저장됩니다.
