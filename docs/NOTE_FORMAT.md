# 노트 마크다운 형식

> 이 문서는 도구가 생성하는 옵시디언 노트의 원형 템플릿을 보존한 참고용입니다. 실제 프롬프트와 frontmatter 생성 로직은 [lib/ai/prompts.ts](../lib/ai/prompts.ts)에 있습니다.

```markdown
---
source: youtube
category: [카테고리]
search_query: [검색어]
processed_at: [YYYY-MM-DD]
video_url: [영상 URL]
channel: [채널명]
published: [YYYY-MM-DD]
duration: [길이]
---

# [영상 제목]

## 핵심 요약 (3~5줄)

...

## 주요 개념

### 개념 1: ...

## 타임스탬프별 정리

- **00:00 - 02:30**: ...

## 핵심 인사이트

...

## 추가 학습 키워드

- [[키워드1]]

## 태그

#youtube #학습 #[카테고리] #[주제관련태그]
```

> frontmatter는 옵시디언 Dataview 플러그인과 연동 가능하도록 설계됨.
