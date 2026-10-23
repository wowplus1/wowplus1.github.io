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

  // 사이트 전용 꼬리표 링크 (10/23). 카톡과 같은 제휴 링크를 쓰면 사이트 손님의 주문을 가를 수 없다.
  // hotdeal.best 는 머투 손님(쿠키 ref_ch=hotdealbest_a02)에게 꼬리표가 붙은 긴 링크를 준다 —
  // 쿠팡은 subparam=, 링크프라이스는 u_id= 칸. 그 값만 hotdealbest_web 으로 바꿔 쓴다(둘 다 자유 입력 칸, 302 이동 확인).
  // 에디(지마켓 등)는 꼬리표마다 링크 번호가 달라 바꿀 수 없다 → 원래 링크 그대로. 토스는 사이트에 안 싣는다.
  // 한 번에 40개씩, 최근 딜부터. 실패해도 원래 링크로 나가니 사이트는 멀쩡하다.
  const TAG = 'hotdealbest_web', KEY = 'hb7Qz3m2Kx';   // KEY: hotdeal.best 페이지가 링크를 감추는 데 쓰는 공개 값(deal-picker.js 와 같음)
  const dec = e => { const raw = Buffer.from(e, 'base64').toString('binary'); let o = ''; for (let i = 0; i < raw.length; i++) o += String.fromCharCode(raw.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length)); return o; };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let tagged = 0;
  const need = Object.values(all).filter(d => d.uid && d.link && !d.webLinkTried && d.mall !== '토스쇼핑')
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 40);
  for (const d of need) {
    try {
      const r = await fetch(`https://hotdeal.best/${d.uid}`, { headers: { 'User-Agent': 'Mozilla/5.0 (dealsite build)', Cookie: 'ref_ch=hotdealbest_a02' }, signal: AbortSignal.timeout(15000) });
      d.webLinkTried = today;
      if (!r.ok) continue;
      const m = (await r.text()).match(/a_links\s*=\s*(\{[\s\S]*?\});/);
      const buy = m && JSON.parse(m[1]).buy, u = buy && dec(buy);
      if (!u || !/^https?:\/\//.test(u)) continue;
      const w = u.replace(/([?&](?:subparam|u_id)=)hotdealbest_a02(?=&|$)/, '$1' + TAG);
      if (w !== u) { d.webLink = w; tagged++; }
    } catch (e) { /* 다음 실행 때 다시 */ delete d.webLinkTried; }
  }
  fs.writeFileSync(F, JSON.stringify(all));
  // 깃허브 액션에 바뀐 게 있는지 알린다. 없으면 페이지를 다시 만들지 않는다
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${added + promoted + resent + tagged > 0}
`);
  console.log(`새 딜 ${added} · 카톡 발송으로 바뀐 것 ${promoted} · 다시 보낸 것 ${resent} · 사이트 꼬리표 ${tagged}/${need.length} · 전체 ${Object.keys(all).length}`);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
