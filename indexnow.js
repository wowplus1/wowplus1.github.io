// indexnow.js — 새로 생기거나 바뀐 페이지를 IndexNow 로 바로 알린다 (2026-10-19)
//   node indexnow.js prepare _site   배포 전: 지금 공개된 사이트맵과 새로 만든 사이트맵을 비교해 목록을 만든다
//   node indexnow.js send            배포 후: 그 목록을 보낸다 (빙 등 IndexNow 참여 검색엔진이 함께 받는다)
//   node indexnow.js all _site       처음 한 번: 사이트맵 전체를 보낸다
// 키 파일은 verify/<KEY>.txt 로 사이트 루트에 올라가 있다. 지우면 IndexNow 가 거부한다.
'use strict';
const fs = require('fs'), path = require('path');

const HOST = 'wowplus1.github.io';
const KEY = '769b29543e6a814b7e5107f1bd9f84fe';
const LIST = path.join(__dirname, 'indexnow-urls.txt');
const [mode, out = '_site'] = process.argv.slice(2);

const parse = xml => {
  const m = new Map();
  for (const [, loc, mod] of String(xml).matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?/g)) m.set(loc, mod || '');
  return m;
};

(async () => {
  if (mode === 'prepare' || mode === 'all') {
    const now = parse(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'));
    let urls;
    if (mode === 'all') urls = [...now.keys()];
    else {
      let old = new Map();
      try { const r = await fetch(`https://${HOST}/sitemap.xml?t=${Date.now()}`); if (r.ok) old = parse(await r.text()); } catch (e) {}
      urls = [...now].filter(([u, m]) => old.get(u) !== m).map(([u]) => u);
    }
    fs.writeFileSync(LIST, urls.join('\n'));
    console.log(`IndexNow 보낼 주소 ${urls.length}개`);
    if (mode !== 'all') return;
  }
  const urls = fs.existsSync(LIST) ? fs.readFileSync(LIST, 'utf8').split('\n').filter(Boolean) : [];
  if (!urls.length) return console.log('IndexNow 보낼 것 없음');
  for (let i = 0; i < urls.length; i += 10000) {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
    });
    // 200·202 면 받음. 실패해도 사이트 배포는 이미 끝났으니 멈추지 않는다
    console.log(`IndexNow ${urls.slice(i, i + 10000).length}개 → ${r.status}`);
  }
})().catch(e => console.log('IndexNow 실패(무시):', e.message));
