# 클린업데이 포토제닉 🫧

신사옥 이전 기념 사내 이벤트 — 직원들이 청소·정리 순간을 폴라로이드 사진으로 남기고 반응을 주고받는 웹앱.

## 구조

- **화면**: GitHub Pages (`docs/` 폴더, 정적 호스팅, 무료)
- **데이터**: Supabase 무료 플랜 — `posts` 테이블(글·반응) + `photos` 스토리지 버킷(사진)
- 사진은 업로드 전 브라우저에서 자동 압축 (긴 변 1200px, 약 300KB 이하)

## 최초 설정 (한 번만)

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성
2. 대시보드 → **SQL Editor** → `supabase-setup.sql` 내용 전체를 붙여넣고 **Run**
3. 대시보드 → **Project Settings → API**에서 `Project URL`과 `anon public` 키 복사
4. `docs/config.js`에 두 값을 입력
5. GitHub 저장소에 푸시 → 저장소 **Settings → Pages** → Source: `main` 브랜치 `/docs` 폴더

> `anon` 키는 공개용으로 설계된 키이며 RLS 정책(읽기/쓰기만 허용, 수정·삭제 불가)으로 보호됩니다.

## 로컬 미리보기

```
npx http-server docs -p 8899
```

## 게시물 관리

부적절한 게시물 삭제는 Supabase 대시보드 → Table Editor → `posts`에서 행 삭제 + Storage → `photos`에서 해당 사진 삭제.
