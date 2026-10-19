// update.js — 최신 피드를 받아 archive.json 에 덧붙인다 (2026-10-19)
//   node update.js
// 깃허브 액션이 한 시간마다 돌린다. 토큰이 필요 없다 — 피드 저장소가 공개라 raw 주소로 읽힌다.
//   deals.json  카톡방에 보낸 딜 (아침 7시 ~ 밤 10시)
//   web.json    발송 시간 밖에 고른 딜. 사이트에만 올린다 (web: true)
// 밤에 사이트에 올린 딜이 아침에 카톡으로 나가면, 카톡 쪽 기록으로 바꾼다 (처음 찾은 시각은 foundAt 에 남긴다).
'use strict';
const fs = require('fs'), path = require('path');
const RAW = 'https://raw.githubusercontent.com/wowplus1/hotdeal-feed/main/';
const API = 'https://api.github.com/repos/wowplus1/hotdeal-feed/contents/';
const F = path.join(__dirname, 'archive.json');

async function read(name) {
  try {
    const r = await fetch(RAW + name + '?t=' + Date.now());
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(r.status);
    return (await r.json()).items || [];
  } catch (e) {
    const r = await fetch(API + name, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dealsite' } });
    if (r.status === 404) return [];
    const f = await r.json();
    return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')).items || [];
  }
}

(async () => {
  const all = JSON.parse(fs.readFileSync(F, 'utf8'));
  let added = 0, promoted = 0;
  for (const it of await read('web.json')) {
    if (it.uid && it.title && !all[it.uid]) { all[it.uid] = Object.assign({}, it, { web: true }); added++; }
  }
  for (const it of await read('deals.json')) {
    if (!it.uid || !it.title) continue;
    const old = all[it.uid];
    if (!old) { all[it.uid] = it; added++; }
    else if (old.web) { all[it.uid] = Object.assign({}, it, { foundAt: old.sentAt }); promoted++; }
  }
  fs.writeFileSync(F, JSON.stringify(all));
  // 깃허브 액션에 바뀐 게 있는지 알린다. 없으면 페이지를 다시 만들지 않는다
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${added + promoted > 0}
`);
  console.log(`새 딜 ${added} · 카톡 발송으로 바뀐 것 ${promoted} · 전체 ${Object.keys(all).length}`);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
