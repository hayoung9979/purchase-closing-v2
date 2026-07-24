# 부자재 마감 시스템 v2.2

이번 버전 연결 범위:
- 거래처 정보: Supabase 저장/수정/삭제
- 월별 마감 현황: 거래처 추가, 7개 체크리스트, 누락일 Supabase 저장
- 월별 거래처 추가 시 집계장 행 자동 생성
- 매입세금계산서 집계장: 추가/수정/삭제 Supabase 저장

## 실행
1. `.env.local`을 package.json 옆에 둡니다.
2. `npm install`
3. `npm run dev`

## 환경변수
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

대시보드 일정과 월 잠금은 아직 브라우저 로컬 저장 방식입니다.
