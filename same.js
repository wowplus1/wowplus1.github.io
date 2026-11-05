// same.js — hotdeal.best 「가격 비교」 후보 중 우리 딜과 같은 상품만 남긴다 (2026-11-05)
// 다나와 판매처 목록(피드 sellers)이 없는 딜에만 쓴다 — 사장님 결정.
// 틀린 줄은 없느니만 못하니 애매하면 뺀다. 11/5 최근 40딜로 본 오류를 하나씩 막았다:
//   맛이 다른 것(뿌셔뿌셔 불고기 ↔ 떡볶이) · 여러 맛을 한 글에(말차빵 소금빵 초코빵) · 크기 둘(20cm 22cm) · 택1·옵션 글.
// 후보 가격은 옵션 묶음 글이면 제일 싼 옵션 값이다(롯데온 꽃보다오징어: 대표 18,650원은 다른 상품, 230g+230g 옵션은 68,640원).
// 그래서 남은 것끼리 견줘 유난히 싼 값은 버리고, 두 곳이 안 남으면 아무것도 안 쓴다.
'use strict';
const norm = s => String(s || '').toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9가-힣]/g, '');
const GENERIC = new Set(['정품', '본품', '무료배송', '무료', '배송', '박스', '세트', '개입', '증정', '국내', '국산', '대용량', '묶음', '포장', '신상', '특가', '스낵', '간식']);
// 규격: 용량(g·ml)과 개수. kg·L 는 g·ml 로. 「x 24」·「*5개」·「24개입」 모두 개수
const specOf = t => {
  const s = String(t || '').toLowerCase().replace(/,(?=\d{3})/g, '');
  const size = [], cnt = new Set(), other = new Set();
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z가-힣])/g)) size.push((/k|^l$/.test(m[2]) ? +m[1] * 1000 : +m[1]) + (/g/.test(m[2]) ? 'g' : 'ml'));
  for (const m of s.matchAll(/(?:[x×*]\s*(\d+)|(\d+)\s*(?:개입|개|팩|입|봉|병|캔|포|구|롤|ea|p)(?![가-힣a-z]))/g)) { const n = +(m[1] || m[2]); if (n > 1) cnt.add(n); }
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(cm|mm|매|정|미)(?![a-z가-힣])/g)) other.add(m[1] + m[2]);
  return { size: size.sort().join(' '), cnt, other };
};
const eqSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const flavors = t => new Set((String(t || '').match(/[가-힣]{1,6}(?:맛|향)(?![가-힣])/g) || []));
const words = t => String(t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[\s,\/+·|*]+/)
  .map(w => w.replace(/[^가-힣a-zA-Z]/g, '').toLowerCase()).filter(w => w.length >= 2 && !GENERIC.has(w));

function sameItem(ours, theirs) {
  const a = specOf(ours), b = specOf(theirs);
  if (!a.size && !a.cnt.size && !a.other.size) return false;               // 규격 없는 이름은 견주지 않는다
  if (a.size !== b.size || !eqSet(a.cnt, b.cnt) || !eqSet(a.other, b.other)) return false;
  if (!eqSet(flavors(ours), flavors(theirs))) return false;
  const tn = norm(theirs), body = String(theirs).replace(/^\S+\s/, '');
  if (/택\s*1|택일|옵션|골라|모음|균일/.test(theirs) || /[,/]/.test(body.replace(/\d,\d/g, ''))) return false;
  if (/\+/.test(theirs) && !/\+/.test(ours)) return false;
  const ws = words(ours);
  if (ws.length < 2 || ws.filter(w => tn.includes(w)).length / ws.length < 0.8) return false;
  const td = tn.replace(/[0-9]/g, ''), pairs = ws.slice(1).map((w, i) => ws[i] + w);
  if (pairs.filter(p => td.includes(p)).length / pairs.length < 0.5) return false;
  // 한 글에 형제 상품이 여럿(말차빵 소금빵 초코빵) — 우리 낱말과 끝 글자가 같은 다른 낱말이 둘 이상이면 뺀다
  const on = norm(ours);
  for (const w of ws.filter(w => w.length >= 3)) {
    const sib = new Set(words(theirs).filter(x => x !== w && x.length >= 2 && x.slice(-1) === w.slice(-1) && !on.includes(x)));
    if (sib.size >= 2) return false;
  }
  return true;
}

// 후보 [{shop_name, product_name, product_price, original_url}] → [{mall, price, url}] 쇼핑몰마다 제일 싼 하나, 최대 6
function pick(ours, items) {
  const ok = (items || []).filter(c => c && c.product_price > 0 && /^https:\/\//.test(c.original_url || '') && sameItem(ours, c.product_name));
  if (ok.length < 2) return [];
  const ps = ok.map(c => c.product_price).sort((x, y) => x - y), mid = ps[ps.length >> 1];
  const kept = ok.filter(c => c.product_price >= mid * 0.7);                     // 유난히 싼 값(옵션 대표가)은 버린다
  const best = new Map();
  for (const c of kept) if (!best.has(c.shop_name) || c.product_price < best.get(c.shop_name).price) best.set(c.shop_name, { mall: c.shop_name, price: c.product_price, url: c.original_url });
  const out = [...best.values()].sort((x, y) => x.price - y.price).slice(0, 6);
  return out.length >= 2 ? out : [];
}

module.exports = { sameItem, pick, specOf };
