// update.js — 최신 피드를 받아 archive.json 에 덧붙인다 (2026-10-19)
//   node update.js
// 깃허브 액션이 한 시간마다 돌린다. 토큰이 필요 없다 — 피드 저장소가 공개라 raw 주소로 읽힌다.
//   deals.json  카톡방에 보낸 딜 (아침 7시 ~ 밤 10시)
//   web.json    발송 시간 밖에 고른 딜. 사이트에만 올린다 (web: true)
// 밤에 사이트에 올린 딜이 아침에 카톡으로 나가면, 카톡 쪽 기록으로 바꾼다 (처음 찾은 시각은 foundAt 에 남긴다).
// 같은 상품을 며칠 뒤 다시 보내면 새 발송으로 바꾸고, 이전 발송은 earlier 에 남긴다 (10/19 치킨윙봉: 10/2 기록에 묶여 목록에 안 올라왔다).
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
  let added = 0, promoted = 0, resent = 0;
  const merge = (it, web) => {
    if (!it.uid || !it.title || !it.sentAt) return;
    const old = all[it.uid], nu = Object.assign({}, it, web ? { web: true } : {});
    if (!old) { all[it.uid] = nu; added++; return; }
    if (it.sentAt <= old.sentAt) return;
    // 밤에 찾은 딜이 반나절 안에 카톡으로 나간 것 — 같은 딜이다
    if (old.web && !web && Date.parse(it.sentAt) - Date.parse(old.sentAt) < 12 * 3600e3) { all[it.uid] = Object.assign(nu, { foundAt: old.sentAt }); promoted++; return; }
    const prev = { sentAt: old.sentAt, price: old.price, baseline: old.baseline, saving: old.saving, web: old.web || undefined };
    all[it.uid] = Object.assign(nu, { earlier: [prev].concat(old.earlier || []).slice(0, 20) });
    resent++;
  };
  for (const it of await read('web.json')) merge(it, true);
  for (const it of await read('deals.json')) merge(it, false);
  fs.writeFileSync(F, JSON.stringify(all));
  // 깃허브 액션에 바뀐 게 있는지 알린다. 없으면 페이지를 다시 만들지 않는다
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${added + promoted + resent > 0}
`);
  console.log(`새 딜 ${added} · 카톡 발송으로 바뀐 것 ${promoted} · 다시 보낸 것 ${resent} · 전체 ${Object.keys(all).length}`);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
