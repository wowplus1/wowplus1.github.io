# 핫딜베스트 카톡방 — 검색용 사이트

https://wowplus1.github.io

핫딜베스트가 고른 생필품 핫딜 기록을 정적 페이지로 만든다. 한 시간마다 GitHub Actions 가
`wowplus1/hotdeal-feed` 의 `deals.json`(카톡방에 보낸 딜)과 `web.json`(밤사이 고른 딜)을 받아
`archive.json` 에 쌓고, `build.js` 로 페이지를 다시 만들어 배포한다.

- `update.js` 피드 → archive.json
- `build.js` archive.json → 정적 사이트 (토스쇼핑은 싣지 않는다)
- `verify/` 검색엔진 소유 확인 파일을 넣으면 사이트 루트로 복사된다
