// build.js — archive.json(카톡방에 나간 딜 기록)으로 검색용 정적 사이트를 만든다 (2026-10-19)
//   node build.js [출력폴더]      기본 출력: ./site
//
// 왜 따로 만드나: hotdeal.best 는 다른 개발자가 만들고, 홈 목록을 JS 로 그려 검색엔진이
// 딜 페이지를 못 따라간다. 여기는 모든 글을 처음부터 HTML 로 내보내고, 사이트맵에 전부 올린다.
// 검색으로 온 사람은 카톡방으로 보낸다. 패키지 없이 Node 만으로 돈다 (깃허브 액션에서도).
//
// 원칙
//   - 가격은 「확인한(카톡방에 보낸) 시점의 가격」 이라고 늘 적는다. 지금 가격처럼 보이게 하지 않는다.
//   - 「최저가」 라고 단정하지 않는다. 비교 대상(판매글 몇 곳)을 붙인다.
//   - 제휴 링크엔 쇼핑몰별 고지 문구를 단다. 카톡방 링크는 주소를 그대로 적는다(스크립트로 보내지 않는다).
'use strict';
const fs = require('fs'), path = require('path');

const BASE = 'https://wowplus1.github.io';
const SITE = '핫딜베스트 카톡방';
const KAKAO = 'https://open.kakao.com/o/p89h8DIi';
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'site'));
const deals = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, 'archive.json'), 'utf8')))
  .filter(d => d.uid && d.title && d.sentAt)
  // 토스쇼핑은 싣지 않는다. 토스가 2026-08-27 메일로 「상품·가격을 DB 에 쌓아 커머스 사이트처럼 운영」 하는 것을
  // 허용하지 않는다고 알려 왔다. 이 사이트는 딜 기록을 쌓아 목록·상세로 보여 주므로 그 모양에 가깝다.
  .filter(d => d.mall !== '토스쇼핑' && !/toss.(im|shopping)/.test(d.link || ''))
  .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

// ── 도구 ──
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => (Number(n) > 0 ? Number(n).toLocaleString('ko-KR') + '원' : '');
const kst = iso => { const m = String(iso).match(/(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/); return m ? { y: +m[1], mo: +m[2], d: +m[3], h: m[4], mi: m[5], ymd: `${m[1]}-${m[2]}-${m[3]}` } : null; };
const dateKo = iso => { const t = kst(iso); return t ? `${t.y}년 ${t.mo}월 ${t.d}일 ${t.h}:${t.mi}` : ''; };
const dateTime = iso => { const t = kst(iso); return t ? `${t.mo}/${t.d} ${t.h}:${t.mi}` : ''; };
const dateShort = iso => { const t = kst(iso); return t ? `${t.mo}/${t.d}` : ''; };
const url = (...parts) => '/' + parts.map(p => encodeURIComponent(p)).join('/') + '/';
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html, 'utf8'); };

const DISCLOSURE = {
  '쿠팡': '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  '토스쇼핑': '토스쇼핑 쉐어링크를 통해 수수료를 받습니다.',
};
const disclosureFor = m => DISCLOSURE[m] || '이 페이지의 링크를 통해 구매하시면 일정액의 수수료를 제공받습니다.';

// ── 키워드: 제목에서 브랜드·품목 이름을 뽑는다. 3건 이상 나온 것만 모음 페이지를 만든다 ──
const STOP = new Set(('무료배송 국내산 대용량 증정 세트 정품 공식 신상 특가 리필 리필용 오리지널 본품 개입 묶음 기획 단품 혼합 선택 택1 ' +
  '무라벨 로켓프레시 로켓배송 당일출고 프리미엄 남녀공용 남성 여성 남성용 여성용 남자 여자 미니 대형 소형 휴대용 블랙 화이트 실버 그레이 핑크 블루 그린 골드 ' +
  '박스 내외 국내가공 단계 인분 매입 플러스 클래식 리얼 데일리 클린 케어 시그니처 올인원 프로 액티브 트리플 키즈 페이스 오일 크림 제로 무향 저당 저칼로리 플레인 오리지날 IH 가쯔 라지자 알파 네이처 로얄과 캡형 프로그 피지 내추럴 스페셜 베이직 뉴').split(' '));
const UNIT = /^[\d.,]*(g|kg|mg|ml|l|개|팩|입|매|봉|병|캔|포|구|롤|m|cm|mm|매입|ea|세트|통|장|정|p|gb|tb|인치|단계)$/i;
const tokens = t => [...new Set(String(t).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[\s,\/+·|*]+/)
  .map(w => w.replace(/^[^가-힣A-Za-z]+|[^가-힣A-Za-z0-9]+$/g, ''))
  .filter(w => w.length >= 2 && /[가-힣A-Za-z]/.test(w) && !/\d/.test(w) && !UNIT.test(w) && !STOP.has(w)))];
const byKw = {};
for (const d of deals) for (const w of tokens(d.title)) (byKw[w] = byKw[w] || []).push(d);
const KW = Object.keys(byKw).filter(w => byKw[w].length >= 3).sort((a, b) => byKw[b].length - byKw[a].length || a.localeCompare(b, 'ko'));
const kwOf = d => tokens(d.title).filter(w => KW.includes(w));

const byMall = {};
for (const d of deals) (byMall[d.mall || '기타'] = byMall[d.mall || '기타'] || []).push(d);
const MALLS = Object.keys(byMall).sort((a, b) => byMall[b].length - byMall[a].length);

// ── 숫자 ──
const withSave = deals.filter(d => d.saving > 0);
const AVG_SAVE = withSave.length ? Math.round(withSave.reduce((t, d) => t + d.saving, 0) / withSave.length) : 0;
const DAYS = new Set(deals.map(d => kst(d.sentAt).ymd)).size;

// ── 디자인 ──
// 따뜻한 종이색 바탕에 로고의 주홍을 브랜드색으로, 노랑은 「얼마나 싼가」 에만 쓴다.
// 카드는 상품 사진이 주인공. 가격은 크게, 비교 가격은 막대로 보여 준다.
const CSS = `:root{
  --bg:#F7F4EE;--paper:#FFFFFF;--ink:#1C1A17;--mid:#5B5750;--dim:#8D877D;--line:#E9E3D8;--soft:#F1ECE3;
  --brand:#E8402A;--brand-ink:#B5301E;--brand-soft:#FDECE8;--save:#FFE14D;--save-ink:#4A3B00;--kakao:#FEE500;--warn:#D0021B;--warn-bg:#FFF1F1;
  --font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --r:16px;--shadow:0 1px 2px rgba(28,26,23,.05),0 6px 18px -10px rgba(28,26,23,.18)}
@media (prefers-color-scheme:dark){:root{--bg:#16140F;--paper:#201D18;--ink:#F2EEE6;--mid:#BDB5A8;--dim:#8F877A;--line:#332E26;--soft:#2A261F;
  --brand:#FF6A52;--brand-ink:#FF8A76;--brand-soft:#3A221C;--save:#F5D33A;--save-ink:#2A2100;--warn:#FF5A5A;--warn-bg:#3A1A1A;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 var(--font);letter-spacing:-.01em;word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
a{color:inherit}img{max-width:100%}
.wrap{max-width:960px;margin:0 auto;padding:0 16px 132px}
/* 머리 */
.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top .in{max-width:960px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:-.03em}
.brand{white-space:nowrap}.top nav a{white-space:nowrap}@media (max-width:360px){.brand small{display:none}.top nav a{padding:6px 6px}}.brand img{width:30px;height:30px;border-radius:8px}.brand small{font-weight:600;color:var(--dim);font-size:12.5px;margin-left:2px}
.top nav{display:flex;gap:4px}.top nav a{font-size:14px;color:var(--mid);text-decoration:none;padding:6px 10px;border-radius:999px}.top nav a:hover{background:var(--soft);color:var(--ink)}
.crumb{font-size:12.5px;color:var(--dim);margin:16px 0 0}.crumb a{color:var(--dim);text-decoration:none}.crumb a:hover{text-decoration:underline}
/* 글 */
h1{font-size:clamp(24px,5.2vw,34px);line-height:1.3;letter-spacing:-.045em;margin:14px 0 10px;text-wrap:balance;font-weight:800}
h2{font-size:18px;letter-spacing:-.03em;margin:36px 0 14px;display:flex;align-items:baseline;gap:8px}h2 small{font-size:13px;color:var(--dim);font-weight:600}
.lead{color:var(--mid);margin:0 0 16px;max-width:62ch}
.hl{background:linear-gradient(transparent 60%,var(--save) 60%,var(--save) 92%,transparent 92%);padding:0 2px}
/* 첫 화면 */
.hero{padding:26px 0 8px;display:grid;gap:18px;grid-template-columns:1fr}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--brand-ink);background:var(--brand-soft);border-radius:999px;padding:5px 11px}
.badge i{width:7px;height:7px;border-radius:50%;background:var(--brand);display:inline-block}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 0}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px 12px 10px}
.stat b{display:block;font-size:22px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.stat span{font-size:12px;color:var(--dim)}
.pile{position:relative;height:210px;display:none}
.pile img{position:absolute;width:118px;height:118px;object-fit:cover;border-radius:16px;background:#fff;border:3px solid var(--paper);box-shadow:var(--shadow)}
@media (min-width:760px){.hero{grid-template-columns:1.25fr 1fr;align-items:center;padding-top:40px}.pile{display:block}}
/* 버튼 */
.cta{display:flex;align-items:center;justify-content:center;gap:9px;background:var(--kakao);color:#191600;font-weight:800;font-size:16.5px;letter-spacing:-.02em;border-radius:14px;padding:16px 14px;text-decoration:none;box-shadow:0 8px 20px -12px rgba(120,95,0,.55)}
.cta svg{width:20px;height:20px;fill:#191600}.cta:active{transform:translateY(1px)}
.assure{display:flex;justify-content:center;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;color:var(--mid);margin:9px 0 0}.assure span::before{content:"✓ ";color:var(--brand)}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;background:var(--brand);border:0;color:#fff;font-weight:800;font-size:16px;letter-spacing:-.02em;border-radius:14px;padding:15px 14px;text-decoration:none;box-shadow:0 8px 20px -12px rgba(181,48,30,.7)}
.btn:hover{background:var(--brand-ink)}.btn:active{transform:translateY(1px)}
/* 칩 */
.chips{display:flex;flex-wrap:wrap;gap:7px;padding:0;margin:0;list-style:none}
.chips a{display:inline-flex;align-items:center;gap:5px;background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13.5px;text-decoration:none}
.chips a:hover{border-color:var(--ink)}.chips a em{font-style:normal;color:var(--dim);font-size:12px}
/* 카드 목록 */
.grid{display:grid;gap:10px;padding:0;margin:0;list-style:none;grid-template-columns:1fr}
@media (min-width:640px){.grid{grid-template-columns:1fr 1fr}}
.card{display:flex;gap:13px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:11px;text-decoration:none;height:100%;transition:border-color .15s,transform .15s}
.card:hover{border-color:color-mix(in srgb,var(--ink) 35%,var(--line));transform:translateY(-1px)}
.card .ph{flex:none;width:76px;height:76px;border-radius:12px;background:#fff;overflow:hidden;border:1px solid var(--line)}
.card .ph img{width:100%;height:100%;object-fit:cover;display:block}
.card .body{min-width:0;flex:1}
.card .m{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--dim)}
.mall{font-weight:700;color:var(--mid);background:var(--soft);border-radius:6px;padding:1px 6px;font-size:11.5px}
.card .t{font-size:14px;line-height:1.42;margin:3px 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .p{display:flex;align-items:center;gap:7px;font-weight:800;font-size:16px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.save{display:inline-flex;align-items:center;background:var(--save);color:var(--save-ink);border-radius:7px;padding:1px 7px;font-size:12px;font-weight:800;letter-spacing:-.01em}
.card .was{font-size:12px;color:var(--dim);font-weight:500;text-decoration:line-through}
/* 딜 상세 */
.deal{display:grid;gap:22px;grid-template-columns:1fr;margin-top:6px}
@media (min-width:760px){.deal{grid-template-columns:360px 1fr;align-items:start}}
.shot{background:#fff;border:1px solid var(--line);border-radius:22px;padding:14px;aspect-ratio:1;display:flex;align-items:center;justify-content:center}
.shot img{max-height:100%;object-fit:contain;border-radius:12px}
.when{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--mid);background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:4px 11px}
.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin:14px 0 4px}
.price b{font-size:38px;letter-spacing:-.05em;font-variant-numeric:tabular-nums;line-height:1.1}
.price .save{font-size:15px;padding:3px 9px}
.cmp{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;margin:16px 0;display:grid;gap:10px}
.cmp .row{display:grid;grid-template-columns:76px 1fr auto;gap:10px;align-items:center;font-size:13.5px}
.cmp .bar{height:10px;border-radius:5px;background:var(--soft);overflow:hidden}.cmp .bar i{display:block;height:100%;border-radius:5px;background:var(--dim)}
.cmp .row.us .bar i{background:var(--brand)}.cmp .row.us b{color:var(--brand-ink)}
.cmp .row span:last-child{font-variant-numeric:tabular-nums;font-weight:700;text-align:right}
.cmp p{margin:0;font-size:12.5px;color:var(--dim)}
.warn{display:grid;gap:2px;color:var(--warn);background:var(--warn-bg);border:1.5px solid var(--warn);border-radius:12px;padding:12px 14px;margin:0 0 14px}
.warn b{font-size:16px;font-weight:800;letter-spacing:-.03em}.warn span{font-size:14px;font-weight:600;line-height:1.5}
.stack{display:grid;gap:10px}
.note{font-size:12.5px;color:var(--dim);margin:6px 0 0}.note a{color:var(--mid)}
.join{background:var(--ink);color:var(--paper);border-radius:22px;padding:22px 20px;margin:30px 0 0;display:grid;gap:6px}
.join h3{margin:0;font-size:19px;letter-spacing:-.035em}.join p{margin:0 0 8px;color:color-mix(in srgb,var(--paper) 72%,transparent);font-size:14px}
.join .assure{color:color-mix(in srgb,var(--paper) 70%,transparent)}
/* 표·차트 */
.spark{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:14px 14px 8px;margin:0 0 6px}
.spark svg{width:100%;height:120px;display:block}.spark .lbl{display:flex;justify-content:space-between;font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
.tbl{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;color:var(--dim);font-weight:700;background:var(--soft)}tr:last-child td{border-bottom:0}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td a{text-decoration:none}td a:hover{text-decoration:underline}
tr.low td.r{color:var(--brand-ink);font-weight:800}td:first-child{white-space:nowrap;color:var(--mid);font-variant-numeric:tabular-nums}
/* 바닥 */
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--dim);display:grid;gap:6px}
footer a{color:var(--mid)}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:30;background:linear-gradient(to top,var(--bg) 62%,transparent);padding:18px 16px calc(14px + env(safe-area-inset-bottom))}
.bar .cta{max-width:520px;margin:0 auto}
.livetag{color:var(--brand-ink)!important;font-weight:700!important}.livetag::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--brand);margin-right:5px;vertical-align:1px;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.card .new{background:var(--brand);color:#fff;border-radius:6px;padding:0 6px;font-size:11px;font-weight:800}
.card.fresh{border-color:var(--brand);animation:slidein .5s ease-out}@keyframes slidein{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:8px}`;

const KAKAO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.2.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>';
const ctaBtn = `<a class="cta" href="${KAKAO}" target="_blank" rel="noopener">${KAKAO_ICON}카톡으로 핫딜 받기</a>`;
const assure = '<p class="assure"><span>무료</span><span>알림 꺼 둬도 OK</span><span>개인정보 요구 없음</span><span>언제든 퇴장</span></p>';
const join = `<section class="join"><h3>이런 딜, 하루 15~20건 카톡으로 갑니다</h3><p>싸게 뜬 생필품을 다른 판매처 가격과 비교해서, 괜찮을 때만 바로 보내드려요.</p>${ctaBtn}${assure}</section>`;

const page = ({ title, desc, canon, body, crumbs, img, noindex }) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>${noindex ? '<meta name="robots" content="noindex">' : ''}<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${BASE}${canon}">
<meta name="theme-color" content="#F7F4EE"><link rel="icon" href="/logo.png"><link rel="apple-touch-icon" href="/logo.png">
<meta property="og:site_name" content="${SITE}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${BASE}${canon}"><meta property="og:image" content="${esc(img || BASE + '/logo.png')}">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/style.css"><link rel="alternate" type="application/rss+xml" title="${SITE}" href="/rss.xml">
${crumbs ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: BASE + c[1] })) })}</script>` : ''}
</head><body>
<header class="top"><div class="in"><a class="brand" href="/"><img src="/logo.png" alt="">핫딜베스트<small>카톡방</small></a><nav><a href="/deals/">전체 딜</a><a href="/k/">품목별</a></nav></div></header>
<main class="wrap">
${crumbs ? `<nav class="crumb" aria-label="현재 위치">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join(' › ')}</nav>` : ''}
${body}
<footer><span>가격은 핫딜베스트가 확인한 시점 기준이며 판매처 사정에 따라 언제든 바뀝니다. 「다른 곳」 가격은 그 시점에 함께 확인한 판매글 기준입니다.</span>
<span>일부 링크는 제휴 링크이며, 쇼핑몰마다 고지 문구를 함께 적습니다.</span>
<span>운영 주식회사 와우플러스 · <a href="https://hotdeal.best/?utm_source=${SRC}">hotdeal.best</a></span></footer>
</main>
<div class="bar">${ctaBtn}</div>
</body></html>`;

const card = d => `<li data-uid="${esc(d.uid)}"><a class="card" href="${url('deal', d.uid)}"><span class="ph">${d.image ? `<img src="${esc(d.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="body">
<span class="m"><span class="mall">${esc(d.mall)}</span>${dateTime(d.sentAt)} ${d.web ? '확인' : '보냄'}</span><span class="t">${esc(d.title)}</span>
<span class="p">${won(d.price)}${d.saving ? `<span class="save">${d.saving}%↓</span>` : ''}${d.baseline ? `<span class="was">${won(d.baseline)}</span>` : ''}</span></span></a></li>`;
const grid = arr => `<ul class="grid">${arr.map(card).join('')}</ul>`;

// 판매처 버튼. 피드의 링크는 카톡 메시지에 나간 그 제휴 링크다.
// 우리 사이트(hotdeal.best) 링크면 utm 을 바꿔 단다 — 카톡방 유입과 섞이지 않게.
const SRC = 'dealsite';
const siteLink = d => `https://hotdeal.best/${encodeURIComponent(d.uid)}?utm_source=${SRC}`;
const buyLink = d => {
  if (!d.link) return '';
  let href = d.link, label = `${esc(d.mall)}에서 지금 가격 보기 ↗`;
  if (/^https?:\/\/(www\.)?hotdeal\.best\//.test(href)) { href = href.replace(/utm_source=[^&]*/, 'utm_source=' + SRC); label = '핫딜베스트에서 지금 가격 보기 ↗'; }
  return `<a class="btn" href="${esc(href)}" target="_blank" rel="nofollow sponsored noopener">${label}</a><p class="note">${esc(disclosureFor(d.mall))}</p>`;
};

// 가격 기록 선 그래프 (오래된 것 → 최근)
const spark = arr => {
  const pts = arr.filter(d => d.price > 0).slice().reverse();
  if (pts.length < 2) return '';
  const W = 600, H = 120, P = 10, ps = pts.map(d => d.price), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const xy = pts.map((d, i) => [P + (W - 2 * P) * i / (pts.length - 1), P + (H - 2 * P) * (1 - (d.price - lo) / span)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const iLow = ps.indexOf(lo);
  return `<div class="spark" role="img" aria-label="가격 기록 그래프, 가장 낮은 가격 ${won(lo)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
<path d="${line} L ${xy[xy.length - 1][0]} ${H} L ${xy[0][0]} ${H} Z" fill="var(--brand-soft)"/><path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
${xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === iLow ? 5 : 3}" fill="${i === iLow ? 'var(--brand)' : 'var(--paper)'}" stroke="var(--brand)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}</svg>
<div class="lbl"><span>${dateShort(pts[0].sentAt)}</span><span>가장 낮음 ${won(lo)} · 가장 높음 ${won(hi)}</span><span>${dateShort(pts[pts.length - 1].sentAt)}</span></div></div>`;
};

// 홈의 「최근 보낸 딜」 을 실시간으로 채운다 (lp/02 와 같은 파이어베이스 경로).
// 정적 페이지는 10분마다 다시 만들어지지만, 사람이 보는 목록은 카톡에 보내는 순간 바로 뜨게 한다.
// 새 딜의 상세 페이지가 아직 안 만들어졌으면 /new/ (파이어베이스에서 바로 그리는 상세) 로 보낸다.
const liveScript = known => `<script>
(function () {
  var URL_ = 'https://hotdeal-feed-default-rtdb.asia-southeast1.firebasedatabase.app/feed/items.json?orderBy=%22sentMs%22&limitToLast=20';
  var KNOWN = new Set(${JSON.stringify(known)});
  var box = document.getElementById('recent'); if (!box || !window.EventSource) return;
  var have = new Set([].map.call(box.querySelectorAll('[data-uid]'), function (e) { return e.getAttribute('data-uid'); }));
  function won(n) { return Number(n) > 0 ? Number(n).toLocaleString('ko-KR') + '원' : ''; }
  function when(iso) { var m = String(iso).match(/-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d)/); return m ? (+m[1]) + '/' + (+m[2]) + ' ' + m[3] + ':' + m[4] : ''; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(d) {
    var li = el('li'); li.setAttribute('data-uid', d.uid);
    var a = el('a', 'card fresh');
    a.href = KNOWN.has(String(d.uid)) ? '/deal/' + encodeURIComponent(d.uid) + '/' : '/new/?id=' + encodeURIComponent(d.uid);
    var ph = el('span', 'ph'); if (d.image) { var im = el('img'); im.src = d.image; im.alt = ''; im.referrerPolicy = 'no-referrer'; ph.appendChild(im); }
    var b = el('span', 'body'), m = el('span', 'm');
    m.appendChild(el('span', 'mall', d.mall || '')); m.appendChild(document.createTextNode(when(d.sentAt) + ' 보냄'));
    m.appendChild(el('span', 'new', '새 딜'));
    var p = el('span', 'p', won(d.price));
    if (d.saving) p.appendChild(el('span', 'save', d.saving + '%↓'));
    if (d.baseline) p.appendChild(el('span', 'was', won(d.baseline)));
    b.appendChild(m); b.appendChild(el('span', 't', d.title || '')); b.appendChild(p);
    a.appendChild(ph); a.appendChild(b); li.appendChild(a); return li;
  }
  function apply(data) {
    if (!data) return;
    var list = Array.isArray(data) ? data : (data.uid ? [data] : Object.keys(data).map(function (k) { return data[k]; }));
    list = list.filter(function (d) { return d && d.uid && d.title && d.mall !== '토스쇼핑' && !/toss\\.(im|shopping)/.test(d.link || '') && !have.has(String(d.uid)); })
      .sort(function (a, b) { return (a.sentMs || 0) - (b.sentMs || 0); });
    list.forEach(function (d) { have.add(String(d.uid)); box.insertBefore(card(d), box.firstChild); });
    var tag = document.getElementById('livetag'); if (tag && list.length) tag.textContent = '실시간 · 새 딜 ' + list.length + '건';
  }
  var es = new EventSource(URL_);
  function on(ev) { try { var m = JSON.parse(ev.data); if (m && m.data) apply(m.data); } catch (e) {} }
  es.addEventListener('put', on); es.addEventListener('patch', on);
})();
</script>`;

// ── 만들기 ──
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
write('style.css', CSS);
fs.copyFileSync(path.join(__dirname, 'logo.png'), path.join(OUT, 'logo.png'));
const urls = [];
const add = (rel, lastmod) => urls.push([rel, lastmod]);

// 딜 하나
for (const d of deals) {
  const kws = kwOf(d);
  const related = [...new Map(kws.flatMap(w => byKw[w]).filter(x => x.uid !== d.uid).map(x => [x.uid, x])).values()].slice(0, 6);
  const sameMall = (byMall[d.mall] || []).filter(x => x.uid !== d.uid && !related.includes(x)).slice(0, 6);
  const desc = `${dateKo(d.sentAt)} ${d.mall} ${won(d.price)}.` + (d.baseline ? ` 다른 곳 ${won(d.baseline)}보다 ${d.saving}% 낮은 가격으로 핫딜베스트가 고른 딜입니다.` : ' 핫딜베스트가 고른 딜입니다.');
  const cmp = d.baseline && d.price ? `<div class="cmp" aria-label="가격 비교">
<div class="row us"><b>이 딜</b><span class="bar"><i style="width:${Math.max(6, Math.round(d.price / d.baseline * 100))}%"></i></span><span>${won(d.price)}</span></div>
<div class="row"><span>다른 곳</span><span class="bar"><i style="width:100%"></i></span><span>${won(d.baseline)}</span></div>
${d.baselineNote ? `<p>${esc(d.baselineNote)} · 보낸 시점에 함께 확인한 가격</p>` : ''}</div>` : '';
  const body = `<div class="deal">
<div class="shot">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.title)}" referrerpolicy="no-referrer">` : ''}</div>
<div><span class="when"><span class="mall">${esc(d.mall)}</span>${dateKo(d.sentAt)} ${d.web ? '확인 · 사이트에만 올린 딜' : '카톡방에 보냄'}</span>
<h1>${esc(d.title)}</h1>
<div class="price"><b>${won(d.price)}</b>${d.saving ? `<span class="save">다른 곳보다 ${d.saving}% 쌈</span>` : ''}</div>
${cmp}
<p class="warn"><b>⚠ ${dateTime(d.sentAt)} 기준 가격이에요</b><span>가격이 달라졌다면 이미 끝난 딜입니다. 구매 전 판매처 가격을 꼭 확인하세요.</span></p>
<div class="stack">${buyLink(d)}</div>
<p class="note"><a href="${esc(siteLink(d))}">핫딜베스트에서 판매처별 가격 비교 보기 →</a></p></div></div>
${join}
${kws.length ? `<h2>같은 품목 가격 기록</h2><ul class="chips">${kws.map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}건</em></a></li>`).join('')}</ul>` : ''}
${related.length ? `<h2>비슷한 딜</h2>${grid(related)}` : ''}
${sameMall.length ? `<h2>${esc(d.mall)} 최근 딜</h2>${grid(sameMall)}` : ''}`;
  write(`deal/${d.uid}/index.html`, page({ title: `${d.title} ${won(d.price)} 핫딜 - ${SITE}`, desc, canon: url('deal', d.uid), body, img: d.image,
    crumbs: [['홈', '/'], [d.mall, url('mall', d.mall)], [d.title, url('deal', d.uid)]] }));
  add(url('deal', d.uid), kst(d.sentAt).ymd);
}

// 품목별 모음
for (const w of KW) {
  const arr = byKw[w];
  const min = arr.reduce((a, b) => (b.price > 0 && b.price < a.price ? b : a), arr[0]);
  const body = `<h1>${esc(w)} 핫딜·가격 기록</h1>
<p class="lead">핫딜베스트가 고른 <b>${esc(w)}</b> 딜 ${arr.length}건입니다. 이 중 가장 낮았던 가격은 <span class="hl">${won(min.price)}</span>(${dateTime(min.sentAt)}, ${esc(min.mall)})이에요. 상품 구성이 서로 달라 단순 비교는 어렵습니다.</p>
${spark(arr)}
<h2>날짜별 가격 <small>${arr.length}건</small></h2><div class="tbl"><table><thead><tr><th>날짜</th><th>상품</th><th class="r">가격</th></tr></thead><tbody>
${arr.map(d => `<tr${d === min ? ' class="low"' : ''}><td>${dateTime(d.sentAt)}</td><td><a href="${url('deal', d.uid)}">${esc(d.title)}</a></td><td class="r">${won(d.price)}</td></tr>`).join('')}
</tbody></table></div>
${join}
<h2>${esc(w)} 딜 모아 보기</h2>${grid(arr)}`;
  write(`k/${w}/index.html`, page({ title: `${w} 핫딜·최저가 기록 - ${SITE}`, desc: `핫딜베스트가 고른 ${w} 핫딜 ${arr.length}건과 날짜별 가격. 가장 낮았던 가격 ${won(min.price)}.`,
    canon: url('k', w), body, img: min.image, crumbs: [['홈', '/'], ['품목별', '/k/'], [w, url('k', w)]] }));
  add(url('k', w), kst(arr[0].sentAt).ymd);
}
write('k/index.html', page({ title: `품목별 핫딜 기록 - ${SITE}`, desc: '브랜드·품목별로 핫딜베스트가 고른 핫딜과 가격 기록을 모았습니다.', canon: '/k/',
  crumbs: [['홈', '/'], ['품목별', '/k/']],
  body: `<h1>품목별 핫딜 기록</h1><p class="lead">3번 이상 나온 브랜드·품목이에요. 누르면 날짜별 가격을 볼 수 있습니다.</p><ul class="chips">${KW.map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}</em></a></li>`).join('')}</ul>${join}` }));
add('/k/', kst(deals[0].sentAt).ymd);

// 쇼핑몰별
for (const m of MALLS) {
  write(`mall/${m}/index.html`, page({ title: `${m} 핫딜 모음 - ${SITE}`, desc: `핫딜베스트가 고른 ${m} 핫딜 ${byMall[m].length}건.`, canon: url('mall', m),
    crumbs: [['홈', '/'], [m, url('mall', m)]],
    body: `<h1>${esc(m)} 핫딜 모음</h1><p class="lead">핫딜베스트가 고른 ${esc(m)} 딜 ${byMall[m].length}건, 최근 것부터예요.</p>${grid(byMall[m])}${join}` }));
  add(url('mall', m), kst(byMall[m][0].sentAt).ymd);
}

// 전체 딜 (월별)
const months = {};
for (const d of deals) { const t = kst(d.sentAt); const k = `${t.y}-${String(t.mo).padStart(2, '0')}`; (months[k] = months[k] || []).push(d); }
write('deals/index.html', page({ title: `전체 핫딜 기록 - ${SITE}`, desc: `핫딜베스트가 고른 핫딜 ${deals.length}건 전체.`, canon: '/deals/', crumbs: [['홈', '/'], ['전체 딜', '/deals/']],
  body: `<h1>전체 핫딜 기록</h1><p class="lead">지금까지 고른 딜 ${deals.length}건입니다. 카톡방에는 아침 7시 ~ 밤 10시에 보내고, 이 사이트에는 24시간 올립니다.</p>` +
    Object.keys(months).sort().reverse().map(k => `<h2>${+k.slice(0, 4)}년 ${+k.slice(5)}월 <small>${months[k].length}건</small></h2>${grid(months[k])}`).join('') + join }));
add('/deals/', kst(deals[0].sentAt).ymd);

// 홈
const pile = deals.filter(d => d.image).slice(0, 7);
const POS = [[8, 30, -9], [118, 6, 6], [228, 34, -4], [40, 104, 7], [158, 92, -7], [262, 110, 9], [96, 150, -3]];
write('index.html', page({ title: `생필품 핫딜, 다른 곳 가격과 비교해 카톡으로 - ${SITE}`, desc: '싸게 뜬 생필품·식품 핫딜을 다른 판매처 가격과 비교해 카카오톡 오픈채팅으로 보내드립니다. 지금까지 보낸 딜과 품목별 가격 기록.', canon: '/',
  body: `<section class="hero"><div>
<span class="badge"><i></i>24시간 업데이트 · 카톡방은 아침 7시 ~ 밤 10시</span>
<h1>생필품 핫딜, <span class="hl">다른 곳 가격과 비교해서</span> 카톡으로 보내드려요</h1>
<p class="lead">쿠팡·지마켓·롯데온·11번가에서 싸게 뜬 식품·생필품을 다른 판매처 가격과 견주어 보고, 괜찮을 때만 카톡방에 보냅니다.</p>
${ctaBtn}${assure}
<div class="stats"><div class="stat"><b>${deals.length.toLocaleString('ko-KR')}</b><span>지금까지 고른 딜</span></div><div class="stat"><b>${AVG_SAVE}%</b><span>다른 곳보다 평균</span></div><div class="stat"><b>${Math.round(deals.length / DAYS)}건</b><span>하루 평균</span></div></div>
</div><div class="pile" aria-hidden="true">${pile.map((d, i) => `<img src="${esc(d.image)}" alt="" referrerpolicy="no-referrer" style="left:${POS[i][0]}px;top:${POS[i][1]}px;transform:rotate(${POS[i][2]}deg);z-index:${i % 3 + 1}">`).join('')}</div></section>
<h2>최근 보낸 딜 <small id="livetag" class="livetag">실시간</small> <small><a href="/deals/">전체 ${deals.length}건 →</a></small></h2><ul class="grid" id="recent">${deals.slice(0, 20).map(card).join('')}</ul>
<h2>품목별 가격 기록 <small><a href="/k/">전체 보기 →</a></small></h2><ul class="chips">${KW.slice(0, 36).map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}</em></a></li>`).join('')}</ul>
<h2>쇼핑몰별</h2><ul class="chips">${MALLS.map(m => `<li><a href="${url('mall', m)}">${esc(m)} <em>${byMall[m].length}</em></a></li>`).join('')}</ul>
${join}${liveScript(deals.map(d => String(d.uid)))}` }));
add('/', kst(deals[0].sentAt).ymd);

// 방금 들어온 딜의 상세. 정적 페이지가 만들어지기 전(최대 10~20분)에만 쓴다.
// 파이어베이스 feed/items/<uid> 를 읽어 딜 상세와 같은 모양으로 그린다. 정적 페이지가 생겼으면 그리로 넘긴다.
// 검색엔진에는 안 보인다(noindex) — 같은 딜의 정적 페이지가 곧 생기기 때문이다.
write('new/index.html', page({ title: `새 딜 - ${SITE}`, desc: '방금 고른 핫딜', canon: '/new/', noindex: true,
  body: `<div id="nd"><p class="lead">딜을 불러오는 중입니다…</p></div>${join}<script>
(function () {
  var DISC = ${JSON.stringify(DISCLOSURE)}, DEF = ${JSON.stringify(disclosureFor(''))};
  var id = new URLSearchParams(location.search).get('id') || '';
  var box = document.getElementById('nd');
  if (!/^\\d+$/.test(id)) { box.innerHTML = '<p class="lead">딜 번호가 없습니다. <a href="/">홈으로</a></p>'; return; }
  fetch('/deal/' + id + '/', { method: 'HEAD' }).then(function (r) { if (r.ok) location.replace('/deal/' + id + '/'); }).catch(function () {});
  function won(n) { return Number(n) > 0 ? Number(n).toLocaleString('ko-KR') + '원' : ''; }
  function ko(iso) { var m = String(iso).match(/(\\d{4})-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d)/); return m ? m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일 ' + m[4] + ':' + m[5] : ''; }
  function short(iso) { var m = String(iso).match(/-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d)/); return m ? (+m[1]) + '/' + (+m[2]) + ' ' + m[3] + ':' + m[4] : ''; }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function draw(d) {
    if (!d || !d.uid || d.mall === '토스쇼핑' || /toss\\.(im|shopping)/.test(d.link || '')) { box.innerHTML = '<p class="lead">이 딜은 여기서 보여 드릴 수 없어요. <a href="/">홈으로</a></p>'; return; }
    document.title = d.title + ' ' + won(d.price) + ' 핫딜 - ${SITE}';
    box.innerHTML = '';
    var wrap = el('div', 'deal'), shot = el('div', 'shot');
    if (d.image) { var im = el('img'); im.src = d.image; im.alt = d.title; im.referrerPolicy = 'no-referrer'; shot.appendChild(im); }
    var info = el('div'), when = el('span', 'when');
    when.appendChild(el('span', 'mall', d.mall || '')); when.appendChild(document.createTextNode(ko(d.sentAt) + ' 카톡방에 보냄'));
    info.appendChild(when); info.appendChild(el('h1', '', d.title));
    var pr = el('div', 'price'); pr.appendChild(el('b', '', won(d.price)));
    if (d.saving) pr.appendChild(el('span', 'save', '다른 곳보다 ' + d.saving + '% 쌈'));
    info.appendChild(pr);
    if (d.baseline && d.price) {
      var cmp = el('div', 'cmp');
      [['us', '이 딜', d.price, Math.max(6, Math.round(d.price / d.baseline * 100))], ['', '다른 곳', d.baseline, 100]].forEach(function (x) {
        var row = el('div', 'row ' + x[0]); row.appendChild(el(x[0] ? 'b' : 'span', '', x[1]));
        var bar = el('span', 'bar'), i = el('i'); i.style.width = x[3] + '%'; bar.appendChild(i); row.appendChild(bar);
        row.appendChild(el('span', '', won(x[2]))); cmp.appendChild(row);
      });
      if (d.baselineNote) cmp.appendChild(el('p', '', d.baselineNote + ' · 보낸 시점에 함께 확인한 가격'));
      info.appendChild(cmp);
    }
    var w = el('p', 'warn'); w.appendChild(el('b', '', '⚠ ' + short(d.sentAt) + ' 기준 가격이에요'));
    w.appendChild(el('span', '', '가격이 달라졌다면 이미 끝난 딜입니다. 구매 전 판매처 가격을 꼭 확인하세요.')); info.appendChild(w);
    if (d.link) {
      var st = el('div', 'stack'), a = el('a', 'btn', (d.mall || '판매처') + '에서 지금 가격 보기 ↗');
      a.href = d.link; a.target = '_blank'; a.rel = 'nofollow sponsored noopener'; st.appendChild(a);
      st.appendChild(el('p', 'note', DISC[d.mall] || DEF)); info.appendChild(st);
    }
    wrap.appendChild(shot); wrap.appendChild(info); box.appendChild(wrap);
  }
  fetch('https://hotdeal-feed-default-rtdb.asia-southeast1.firebasedatabase.app/feed/items/' + id + '.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d) return draw(d);
      return fetch('https://raw.githubusercontent.com/wowplus1/hotdeal-feed/main/web.json').then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (j) { draw((j.items || []).filter(function (x) { return String(x.uid) === id; })[0]); });
    })
    .catch(function () { box.innerHTML = '<p class="lead">딜을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>'; });
})();
</script>` }));

write('404.html', page({ title: `페이지가 없습니다 - ${SITE}`, desc: '', canon: '/404.html', body: `<h1>페이지를 찾을 수 없습니다</h1><p class="lead">주소가 바뀌었거나 없는 페이지예요.</p><p><a class="btn" href="/">홈으로</a></p>${join}` }));
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(([u, m]) => `<url><loc>${BASE}${u}</loc><lastmod>${m}</lastmod></url>`).join('\n') + '\n</urlset>\n');
// RSS — 네이버 서치어드바이저에 사이트맵과 함께 낸다. 새 글을 빨리 알아챈다
const rfc = iso => new Date(iso).toUTCString();
write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${SITE}</title><link>${BASE}/</link><description>생필품 핫딜을 다른 판매처 가격과 비교해 고른 기록</description><language>ko</language>
<lastBuildDate>${rfc(deals[0].sentAt)}</lastBuildDate>
${deals.slice(0, 50).map(d => `<item><title>${esc(d.title)} ${won(d.price)}</title><link>${BASE}${url('deal', d.uid)}</link><guid>${BASE}${url('deal', d.uid)}</guid><pubDate>${rfc(d.sentAt)}</pubDate><description>${esc(d.mall)} ${won(d.price)}${d.baseline ? ' · 다른 곳 ' + won(d.baseline) + ' (' + d.saving + '% 낮음)' : ''}</description></item>`).join('\n')}
</channel></rss>
`);
write('.nojekyll', '');
// 검색 사이트 소유 확인 파일: verify/ 폴더에 넣어 두면 그대로 루트로 복사한다
const V = path.join(__dirname, 'verify');
if (fs.existsSync(V)) for (const f of fs.readdirSync(V)) fs.copyFileSync(path.join(V, f), path.join(OUT, f));

console.log(`딜 ${deals.length} · 품목 ${KW.length} · 쇼핑몰 ${MALLS.length} · 페이지 ${urls.length} → ${OUT}`);
