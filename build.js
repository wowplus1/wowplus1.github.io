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

const BASE = 'https://deal.hotdeal.best';
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
// 딜 주소: /deal/<번호>-<상품명>/ — 검색 결과에 상품명이 주소로도 보이게 (2026-10-19).
// 번호를 앞에 둬서 상품명이 같아도 겹치지 않고, /deal/<번호>/ 는 새 주소로 넘기는 작은 페이지로 남긴다.
const slug = t => String(t).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^0-9A-Za-z가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
const dealUrl = d => { const sl = slug(d.title); return url('deal', sl ? `${d.uid}-${sl}` : String(d.uid)); };
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html, 'utf8'); };

const DISCLOSURE = {
  '쿠팡': '이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  '토스쇼핑': '토스쇼핑 쉐어링크를 통해 수수료를 받습니다.',
};
// 「판매글 5곳 최저가」 는 우리 안쪽 말이라 「다른 판매처 5곳 중 최저」 로 보여 준다 (11/4 점검)
const noteKo = t => String(t || '').replace(/^판매글 (\d+)곳 최저가/, '다른 판매처 $1곳 중 최저').replace(/^판매글 (\d+)곳 중간값/, '다른 판매처 $1곳의 중간 가격').replace(/^다른 곳 최저$/, '다른 판매처 중 최저');
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

// 분류 — 「라면 핫딜」「생수 최저가」 같은 검색어를 받는 자리 (10/22). 상품명으로 나눈다. 한 딜이 두 분류에 들 수 있다.
// [이름, 들어갈 말, 빼는 말]. 딜이 6건 이상 쌓인 분류만 페이지를 만든다 (빈 페이지는 검색엔진이 저품질로 본다).
const CATS = [
  ['라면', /라면|짜파게티|짜왕|큰사발|사발면|컵누들|비빔면|너구리|안성탕면|육개장 ?사발|불닭볶음면|감자면|칼국수|우동|쌀국수/, /칩|스낵|과자/],
  ['생수·탄산수', /생수|샘물|삼다수|백산수|아이시스|탄산수|트레비|씨그램|탄산 ?워터/],
  ['음료', /콜라|사이다|스프라이트|환타|에이드|탄산음료|이온|포카리|게토레이|주스|비타500|밀키스|웰치스|코코팜|박카스|헛개|수염차|보리차|블랙보리|녹차|콤부차|음료|얼박|레몬수|아쿠아레몬/, /세제|샴푸|콜라겐|뿌링클|후라이드|치킨|올리브유|김 /],
  ['커피·차', /커피|아메리카노|콜드브루|캡슐|돌체구스토|네스프레소|카누|맥심|조지아|티젠|쌍화|생강차|유자차|대추차/, /세제|캡슐세제/],
  ['우유·두유·요거트', /우유|두유|요거트|요구르트|엔요|그릭/],
  ['과자·간식', /과자|칩|스낵|쿠키|비스킷|비스코프|크래커|초콜릿|초코바|사탕|캔디|젤리|빈츠|칙촉|브라우니|오레오|아몬드|견과|도라야키|마시멜로|스니커즈|트윅스|츄파춥스|양갱|시리얼|그래놀라|콘푸로스트/, /토너|수딩|아동용|네파/],
  ['즉석밥·간편식', /햇반|즉석밥|흑미밥|컵밥|볶음밥|만두|피자|곰탕|삼계탕|국밥|카레|수제비|떡볶이|어묵|가라아게|너겟|용가리|핫도그|돈까스|파스타|스파게티|마카로니|짜장/, /소스|라면/],
  ['고기·수산', /한우|돼지|삼겹|목살|닭가슴살|훈제오리|오리훈제|오리 ?슬라이스|생오리|갈비|불고기|쭈꾸미|주꾸미|오징어|새우|고등어|연어|대게|랍스터|윙봉|닭다리|순살/, /간장|새우깡/],
  ['과일·채소', /감귤|한라봉|사과|샤인머스캣|딸기|고구마|다진마늘|양파|키위|자몽|과일|귤/, /주스|사과식초|음료|에이드/],
  ['소스·조미료', /소스|케찹|케첩|마요네즈|식초|된장|고추장|간장|굴소스|참기름|올리브유|식용유|설탕|소금|시럽|드레싱|스위트콘/],
  ['영양제·건강', /비타민|유산균|프로바이오틱스|오메가|콜라겐|비오틴|크레아틴|프로틴|홍삼|루테인|마그네슘|아연|B-컴플렉스|영양제/, /컨디셔너|샴푸|트리트먼트|사탕/],
  ['주류', /소주|맥주|와인|막걸리|위스키|하이볼/, /무알콜|제로칼로리 음료/],
  ['화장지·물티슈', /화장지|휴지|두루마리|키친타월|물티슈|미용티슈|티슈/],
  ['세제·섬유유연제', /세제|섬유유연제|드라이시트|표백|락스|세탁|캡슐세제|식기세척기/],
  ['샴푸·바디·헤어', /샴푸|린스|컨디셔너|트리트먼트|바디워시|바디로션|헤어|데오|비누|핸드워시|바디스프레이/],
  ['스킨케어·화장품', /크림|세럼|에센스|토너|로션|선크림|클렌징|마스크팩|리무버|수딩젤|파운데이션|앰플|올인원|립밤/, /아이스크림|크림빵|생크림|크림치즈|오레오|초코|쿠키|크림브륄레|오예스|시리얼|과자|파이/],
  ['구강용품', /치약|칫솔|구강|가글|치실/],
  ['기저귀·유아', /기저귀|하기스|나비잠|보솜이|마미포코|분유|유아|키즈|아기|베이비/],
  ['생리대', /생리대|팬티라이너|오버나이트|탐폰|라이너/],
  ['주방용품', /프라이팬|후라이팬|냄비|케틀|텀블러|밀폐용기|찬통|글라스락|락앤락|수세미|고무장갑|도마|주방|멀티팟|편수|양수|웍/],
  ['생활용품', /건전지|배터리|멀티탭|리필봉투|쓰레기봉투|매직캔|테이프 ?클리너|크리너|방향제|캔들|제습|탈취|모기|밴드|마스크|베개|이불|수건/, /헤어|셀퓨전|ahc|AHC|선크림|마스크팩|앰플/],
  ['디지털·가전', /모니터|노트북|그램|키보드|마우스|SSD|메인보드|파워|충전기|케이블|이어폰|헤드셋|드라이기|청소기|공기청정기|가습기|에어프라이어|태블릿|스피커|구강세정기|그래픽카드|CPU/, /씨그램|에이드|건전지|츄파춥스|츄파츕스/],
  ['패션·잡화', /패딩|다운|자켓|재킷|가디건|니트|티셔츠|트레이닝|운동화|로퍼|슬립온|구두|백팩|가방|양말|속옷|드로즈|시계|롱패딩/, /다운로드/],
];
const catOf = d => CATS.filter(([, inc, exc]) => inc.test(d.title) && !(exc && exc.test(d.title))).map(c => c[0]);
const byCat = {};
for (const d of deals) for (const c of catOf(d)) (byCat[c] = byCat[c] || []).push(d);
const CATL = CATS.map(c => c[0]).filter(c => (byCat[c] || []).length >= 6);

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
@media (prefers-color-scheme:dark){:root{--bg:#16140F;--paper:#24211B;--ink:#F5F1EA;--mid:#DDD6CA;--dim:#B4AC9F;--line:#3D372E;--soft:#35302A;
  --brand:#FF6A52;--brand-ink:#FF8A76;--brand-soft:#3A221C;--save:#F5D33A;--save-ink:#2A2100;--warn:#FF5A5A;--warn-bg:#3A1A1A;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 var(--font);letter-spacing:-.01em;word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
a{color:inherit}img{max-width:100%}
.wrap{max-width:960px;margin:0 auto;padding:0 16px 132px}main.wrap{padding-bottom:0}
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
/* 휴대폰 다크 모드: 흰 글씨 뒤 노란 형광펜이 글씨를 가린다(10/21) — 글씨를 노랗게, 밑줄만 얇게. PC 는 형광펜 그대로(사장님) */
@media (prefers-color-scheme:dark) and (max-width:759px){.hl{background:linear-gradient(transparent 88%,color-mix(in srgb,var(--save) 60%,transparent) 88%);color:var(--save)}}
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
@media (max-width:759px){.hero{padding:12px 0 0;gap:8px}.hero h1{font-size:22px;margin:8px 0 4px}.hero .lead{font-size:14px;line-height:1.55;margin:0 0 10px}.hero .cta,.hero .assure{display:none}.stats{gap:6px;margin:0}.stat{padding:8px 10px 7px}.stat b{font-size:18px}.stat span{font-size:11.5px}.hero+h2{margin-top:22px}}
/* 버튼 */
.cta{display:flex;align-items:center;justify-content:center;gap:9px;background:var(--kakao);color:#191600;font-weight:800;font-size:16.5px;letter-spacing:-.02em;border-radius:14px;padding:16px 14px;text-decoration:none;box-shadow:0 8px 20px -12px rgba(120,95,0,.55)}
.cta svg{width:20px;height:20px;fill:#191600}.cta:active{transform:translateY(1px)}
.assure{display:flex;justify-content:center;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;color:var(--mid);margin:9px 0 0}.assure span::before{content:"✓ ";color:var(--brand)}
.tbl a.go{display:inline-block;background:var(--brand);color:#fff;font-weight:800;font-size:13px;line-height:1;border-radius:999px;padding:8px 12px;text-decoration:none;white-space:nowrap;box-shadow:0 4px 10px -6px rgba(181,48,30,.7)}.tbl a.go:active{opacity:.8}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;background:var(--brand);border:0;color:#fff;font-weight:800;font-size:16px;letter-spacing:-.02em;border-radius:14px;padding:15px 14px;text-decoration:none;box-shadow:0 8px 20px -12px rgba(181,48,30,.7)}
.btn:hover{background:var(--brand-ink)}.btn:active{transform:translateY(1px)}
/* 칩 */
.chips{display:flex;flex-wrap:wrap;gap:7px;padding:0;margin:0;list-style:none}
/* 사이트 검색 상자 */
.sbox{display:flex;gap:8px;margin:22px 0 0}@media (max-width:759px){.sbox{margin:14px 0 0}.sbox input{padding:10px 12px}}.sbox input{flex:1;min-width:0;font:inherit;font-size:15px;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper);color:var(--ink)}
.sbox input:focus{outline:none;border-color:var(--brand)}.sbox button{font:inherit;font-weight:800;font-size:15px;padding:0 18px;border-radius:12px;border:0;background:var(--ink);color:var(--paper);cursor:pointer}
.top nav a.sr{display:inline-flex;align-items:center}.top nav a.sr svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.2}
/* 왜 카톡으로 받아야 하나 — 싸게 뜸 → 금방 끝남 → 먼저 본 사람이 삼 */
.flow{list-style:none;margin:8px 0 12px;padding:0;display:grid;gap:12px;counter-reset:f}
.flow li{display:grid;grid-template-columns:30px 1fr;column-gap:10px;align-items:center}
.flow li::before{counter-increment:f;content:counter(f);grid-row:span 2;align-self:start;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;background:var(--brand);color:#fff}
.flow li:nth-child(2)::before{background:var(--dim)}.flow li:nth-child(3)::before{background:var(--kakao);color:#191600}
.flow b{font-size:16px;letter-spacing:-.03em;line-height:1.4}.flow span{font-size:13.5px;line-height:1.5;opacity:.8}
.why{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:18px 18px 14px;margin:24px 0 0;box-shadow:var(--shadow)}
.why h2{margin:0 0 2px}.why .note{margin:0}
@media (min-width:760px){.why .flow{grid-template-columns:repeat(3,1fr);gap:16px}}
.chips a{display:inline-flex;align-items:center;gap:5px;background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13.5px;text-decoration:none}
.chips a:hover{border-color:var(--ink)}
.specs li{background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:5px 11px;font-size:13px;color:var(--mid)}
.vlist{margin:0;padding-left:18px;color:var(--mid);line-height:1.9}.chips a em{font-style:normal;color:var(--dim);font-size:12px}
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
.about p{color:var(--mid);margin:0;max-width:68ch}
.trend-head{margin:0 0 10px;line-height:1.75;color:var(--ink);font-size:15px}.trend-head b{color:var(--brand-ink)}
.price .best{display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:var(--paper);background:var(--brand-ink);border-radius:999px;padding:4px 10px;margin-left:6px;vertical-align:middle}
.about b,.vlist b{color:var(--brand-ink);font-weight:700}
.about > p{line-height:1.85;margin:0 0 10px}.lead + .lead{margin-top:-6px}.about > p:last-of-type{margin-bottom:0}.about .note{margin-top:8px}.stack.again{margin-top:18px}.tbl td.gain{color:var(--brand-ink);font-weight:700}
.join{background:var(--ink);color:var(--paper);border-radius:22px;padding:22px 20px;margin:30px 0 0;display:grid;gap:6px}
.join h3{margin:0;font-size:19px;letter-spacing:-.035em}.join p{margin:0 0 8px;color:color-mix(in srgb,var(--paper) 72%,transparent);font-size:14px}
.join .assure{color:color-mix(in srgb,var(--paper) 70%,transparent)}
/* 표·차트 */
.lc{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:16px 16px 10px;margin:0 0 6px}
.lc-plot{position:relative;height:160px;margin-left:58px}
.lc-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;color:var(--c)}
.lc-grid{stroke:var(--line);stroke-width:1;vector-effect:non-scaling-stroke}
.lc-area{fill:currentColor;fill-opacity:.1}.lc-band{fill:var(--brand);fill-opacity:.13}.lc-tail{fill:none;stroke:var(--brand);stroke-width:2.5;stroke-dasharray:5 4;stroke-linecap:round;vector-effect:non-scaling-stroke}
.lc-line{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.lc-ref{stroke:var(--brand);stroke-opacity:.8;stroke-width:1;vector-effect:non-scaling-stroke}
.lc-y{position:absolute;left:-58px;width:52px;text-align:right;transform:translateY(-50%);font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums}
.lc-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px var(--paper);opacity:.6}
.lc-dot.low{width:10px;height:10px;margin:-5px 0 0 -5px;opacity:1}
.lc-dot.me{width:12px;height:12px;margin:-6px 0 0 -6px;opacity:1;background:var(--paper);box-shadow:0 0 0 2.5px var(--ink),0 0 0 5px var(--paper)}
.lc-lab{position:absolute;transform:translate(-50%,calc(-100% - 9px));font-size:11.5px;font-weight:600;color:var(--ink);white-space:nowrap;background:var(--paper);padding:0 3px;border-radius:4px;line-height:1.5}
.lc-lab.below{transform:translate(-50%,9px)}.lc-lab.l{transform:translate(-4px,calc(-100% - 9px))}.lc-lab.l.below{transform:translate(-4px,9px)}
.lc-lab.r{transform:translate(calc(-100% + 4px),calc(-100% - 9px))}.lc-lab.r.below{transform:translate(calc(-100% + 4px),9px)}
.lc-lab.me{color:var(--brand-ink);font-weight:700}.lc-lab.lowlab{color:var(--mid);font-weight:500}.lc-lab.reflab{color:var(--brand-ink);font-weight:700;transform:translate(-100%,calc(-100% - 3px))}
.lc-x{position:relative;height:18px;margin:6px 0 0 58px;font-size:11.5px;color:var(--dim);font-variant-numeric:tabular-nums}.lc-x span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}.lc-x span:first-child{transform:translateX(-3px)}.lc-x span:last-child{transform:translateX(calc(-100% + 3px))}.lc-x span.me{color:var(--brand-ink);font-weight:700}
.spark{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:14px 14px 8px;margin:0 0 6px}
.spark svg{width:100%;height:120px;display:block}.spark .sparktip{margin:6px 0 2px}.spark .lbl{display:flex;justify-content:space-between;font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
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

// 스타일이 바뀌면 주소가 바뀌어 휴대폰이 옛 스타일(10분 캐시)을 붙들지 않는다
const CSSV = require('crypto').createHash('md5').update(CSS).digest('hex').slice(0, 8);
const KAKAO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.2.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>';
const ctaBtn = `<a class="cta" href="${KAKAO}" target="_blank" rel="noopener">${KAKAO_ICON}카톡으로 핫딜 받기</a>`;
const assure = '<p class="assure"><span>무료</span><span>알림 꺼 둬도 OK</span><span>개인정보 요구 없음</span><span>언제든 퇴장</span></p>';
// 핫딜의 핵심: 가격은 금방 돌아간다 → 기록을 볼 땐 늦다 → 싸게 뜬 순간 카톡으로 받아야 산다 (10/22 사장님 요청)
const flow = `<ol class="flow"><li><b>싸게 뜬다</b><span>쿠폰·타임특가로 잠깐 가격이 내려가요</span></li><li><b>금방 끝난다</b><span>쿠폰이 다 쓰이거나 재고가 빠지면 원래 가격으로 돌아가요</span></li><li><b>먼저 본 사람이 산다</b><span>싸게 뜬 순간 카톡으로 알려드려요</span></li></ol>`;
const joinPlain = `<section class="join"><h3>싸게 뜬 순간, 카톡으로 받아 보세요</h3><p>다른 판매처 가격과 비교해서 괜찮을 때만 바로 보내드려요.</p>${ctaBtn}${assure}</section>`;
// 11/10 상세·품목·분류 아래 상자는 짧은 안내로 — 매 쪽 같은 3단계 설명이 글의 큰 몫을 차지해서(네이버 「저품질 콘텐츠 대량 생성」). 3단계(flow)는 홈 .why 에만
const join = joinPlain;

const page = ({ title, desc, canon, body, crumbs, img, noindex, ld }) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>${noindex ? '<meta name="robots" content="noindex">' : ''}<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${BASE}${canon}">
<meta name="theme-color" content="#F7F4EE"><link rel="icon" href="${BASE}/logo.png"><link rel="apple-touch-icon" href="${BASE}/logo.png">
<meta property="og:site_name" content="${SITE}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img || BASE + '/logo.png')}"><meta name="twitter:domain" content="${SITE}">
<meta property="og:type" content="website"><meta property="og:url" content="${BASE}${canon}"><meta property="og:image" content="${esc(img || BASE + '/logo.png')}">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/style.css?v=${CSSV}">
<script>/* GA4 — hotdeal.best 와 같은 속성. 진짜 주소에서만 켠다 (내 PC 미리보기가 숫자에 섞이지 않게) */
if (location.hostname === 'deal.hotdeal.best' || location.hostname === 'wowplus1.github.io') { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=G-K1HP97RR9J'; document.head.appendChild(s);
  window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', 'G-K1HP97RR9J'); }</script><link rel="alternate" type="application/rss+xml" title="${SITE}" href="/rss.xml">
${crumbs ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: BASE + c[1] })) })}</script>` : ''}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
</head><body>
<header class="top"><div class="in"><a class="brand" href="/"><img src="/logo.png" alt="핫딜베스트 로고">핫딜베스트<small>카톡방</small></a><nav><a href="/c/">분류</a><a href="/k/">품목별</a><a class="sr" href="/search/" aria-label="검색"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></a></nav></div></header>
<main class="wrap">
${crumbs ? `<nav class="crumb" aria-label="현재 위치">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join(' › ')}</nav>` : ''}
${body}
</main>
<div class="wrap foot"><footer><span>가격은 핫딜베스트가 확인한 때 기준이라, 판매처 사정에 따라 언제든 바뀔 수 있어요. 「다른 곳」 가격은 그때 함께 확인한 다른 판매처 가격이에요.</span>
<span>일부 링크는 제휴 링크라서, 쇼핑몰마다 고지 문구를 함께 적어요.</span>
<span>운영 주식회사 와우플러스 · <a href="https://hotdeal.best/?utm_source=${SRC}">hotdeal.best</a> · <a href="/about/">핫딜베스트 소개</a></span></footer></div>
<div class="bar">${ctaBtn}</div>
</body></html>`;

const card = d => `<li data-uid="${esc(d.uid)}"><a class="card" href="${dealUrl(d)}"><span class="ph">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.title)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="body">
<span class="m"><span class="mall">${esc(d.mall)}</span>${dateTime(d.sentAt)} ${d.web ? '확인' : '보냄'}</span><span class="t">${esc(d.title)}</span>
<span class="p">${won(d.price)}${d.saving ? `<span class="save">${d.saving}%↓</span>` : ''}${d.baseline ? `<span class="was">${won(d.baseline)}</span>` : ''}</span></span></a></li>`;
const grid = arr => `<ul class="grid">${arr.map(card).join('')}</ul>`;

// 판매처 버튼. 피드의 링크는 카톡 메시지에 나간 그 제휴 링크다.
// hotdeal.best 상세로 가는 링크는 두지 않는다 (사장님 결정 2026-10-19) — 이 사이트 안에서 끝낸다.
const SRC = 'dealsite';
const buyLink = d => {
  if (!d.link || /^https?:\/\/(www\.)?hotdeal\.best\//.test(d.link)) return '';
  const href = d.webLink || d.link, label = `${esc(d.mall)}에서 지금 가격 보기 ↗`;
  return `<a class="btn" href="${esc(href)}" target="_blank" rel="nofollow sponsored noopener">${label}</a><p class="note">${esc(disclosureFor(d.mall))}</p>`;
};

// 선 그래프 공용 (11/4 「단조롭다」 → 다시 그림). 상세 ①②·품목 페이지가 같이 쓴다.
// 선·면·눈금선은 SVG(가로세로 비율 무시), 점·글자는 HTML 로 얹는다 — 폰에서도 점이 동그랗고 글자 크기가 그대로다.
// 꾸밈은 빼고: 선 2px · 면은 같은 색 10% · 눈금선 1px 실선 · 숫자는 가장 낮은 점과 이번 딜에만 (모든 점에 숫자를 달지 않는다)
// 눈금 간격 — 1·2·2.5·5 의 10배수 중, 칸이 5개 이하가 되는 가장 촘촘한 것 (필립스 18만~51만: 20만 간격이면 0부터 그려져 선이 납작해졌다)
const niceStep = (lo, hi) => { const c = []; for (let e = Math.floor(Math.log10(Math.max(1, hi - lo))) - 2; c.length < 40; e++) for (const m of [1, 2, 2.5, 5]) c.push(m * Math.pow(10, e));
  return c.find(st => Math.ceil(hi / st) - Math.floor(lo / st) <= 5) || c[c.length - 1]; };
const lineChart = ({ pts, color, lowLabel, me, meLabel, ref, refLabel, xs, aria, band, tail }) => {
  // tail: 마지막 점이 이번 딜이다 — 그 앞까지는 회색(시세), 마지막 한 칸만 빨간 선으로 내려온다. 「최저」 표시는 시세 쪽에서만 고른다
  // band: 면을 바닥이 아니라 기준선(ref)까지만 칠한다 — 시세와 이번 딜 사이의 차이가 곧 「싼 만큼」이다. 시세가 이번 딜보다 낮았던 달(필립스 10월)은 칠하지 않는다
  // pts: [{x: 0~1, v}] · me: pts 안의 이번 딜 번호 · ref: 가로 기준선 값(① 의 이번 딜 가격)
  const vs = pts.map(p => p.v).concat(ref > 0 ? [ref] : []);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { lo -= Math.max(1, lo * 0.05); hi += Math.max(1, hi * 0.05); }
  const step = niceStep(lo, hi);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi === lo) hi = lo + step;
  const ticks = []; for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const X = x => 3 + 94 * x, Y = v => 8 + 82 * (1 - (v - lo) / (hi - lo));   // 위 8% · 아래 10% 여백
  const body = tail ? pts.slice(0, -1) : pts;
  const line = body.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(2) + ' ' + Y(p.v).toFixed(2)).join(' ');
  const iLow = body.reduce((b, p, i) => (p.v < body[b].v ? i : b), 0);
  const tailPath = tail ? `<path d="M${X(pts[pts.length - 2].x).toFixed(2)} ${Y(pts[pts.length - 2].v).toFixed(2)} L ${X(pts[pts.length - 1].x).toFixed(2)} ${Y(pts[pts.length - 1].v).toFixed(2)}" class="lc-tail"/>` : '';
  // 세로축 값은 짧게 — 「30만」·「2.5만」·「1.25만」·「7,500」. 반올림하면 눈금이 틀린 값이 된다(1.25만 → 1.3만, 1.75만 → 1.8만 으로 나갔다)
  const big = hi >= 1e5, fmt = n => big ? +(n / 1e4).toFixed(1) + '만원' : Math.round(n).toLocaleString('ko-KR') + '원';
  // 숫자 표시 자리 고르기 (11/4) — 점 위·아래 × 가운데·왼쪽·오른쪽 여섯 자리 중, 다른 점·선·먼저 놓인 표시를 가장 적게 가리는 곳.
  // 글자 폭은 모르니 좁은 화면(그래프 폭 300px) 기준으로 넉넉히 잡는다. 단위는 그래프 안 % (가로 300px · 세로 160px)
  const segs = []; for (let i = 1; i < pts.length; i++) for (let k = 1; k < 12; k++) { const t = k / 12;
    segs.push([X(pts[i - 1].x) + (X(pts[i].x) - X(pts[i - 1].x)) * t, Y(pts[i - 1].v) + (Y(pts[i].v) - Y(pts[i - 1].v)) * t]); }
  const placed = ref > 0 && refLabel ? [[97 - (refLabel.length * 6.6 + 8) / 3, Y(ref) - 3 / 1.6 - 18 / 1.6, 97, Y(ref) - 3 / 1.6]] : [];
  const lab = (i, text, extra) => {
    const x = X(pts[i].x), y = Y(pts[i].v), w = (text.length * 6.6 + 8) / 300 * 100, h = 18 / 160 * 100, gap = 9 / 160 * 100, nudge = 4 / 300 * 100;
    const cands = [['', 0], ['l', 0], ['r', 0], ['below', 1], ['l below', 1], ['r below', 1]].map(([cls, below], order) => {
      const x0 = /\bl\b/.test(cls) ? x - nudge : /\br\b/.test(cls) ? x + nudge - w : x - w / 2, y0 = below ? y + gap : y - gap - h;
      const box = [x0, y0, x0 + w, y0 + h], inBox = (px, py) => px > box[0] - 1 && px < box[2] + 1 && py > box[1] - 1 && py < box[3] + 1;
      let cost = order * 0.01;                                                  // 비기면 위 가운데부터
      if (box[0] < -8 || box[2] > 108 || box[1] < -4 || box[3] > 104) cost += 50;  // 그래프 밖으로 많이 나감
      pts.forEach((p, j) => { if (j !== i && inBox(X(p.x), Y(p.v))) cost += 6; });
      segs.forEach(([px, py]) => { if (inBox(px, py)) cost += 1; });
      placed.forEach(q => { if (box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) cost += 40; });
      return { cls, box, cost };
    }).sort((p, q) => p.cost - q.cost);
    placed.push(cands[0].box);
    return `<span class="lc-lab ${extra}${cands[0].cls ? ' ' + cands[0].cls : ''}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${text}</span>`;
  };
  const dots = pts.length <= 16 ? pts.map((p, i) => i === iLow || i === me ? '' : `<i class="lc-dot" style="left:${X(p.x).toFixed(2)}%;top:${Y(p.v).toFixed(2)}%"></i>`).join('') : '';
  return `<div class="lc" style="--c:${color}" role="img" aria-label="${esc(aria)}"><div class="lc-plot">
<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
${ticks.map(t => `<line x1="0" x2="100" y1="${Y(t).toFixed(2)}" y2="${Y(t).toFixed(2)}" class="lc-grid"/>`).join('')}
${!tail && band && ref > 0 ? `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(2) + ' ' + Y(Math.max(p.v, ref)).toFixed(2)).join(' ')} L ${X(pts[pts.length - 1].x).toFixed(2)} ${Y(ref).toFixed(2)} L ${X(pts[0].x).toFixed(2)} ${Y(ref).toFixed(2)} Z" class="lc-band"/>` : ''}
${ref > 0 ? `<line x1="0" x2="100" y1="${Y(ref).toFixed(2)}" y2="${Y(ref).toFixed(2)}" class="lc-ref"/>` : ''}
<path d="${line}" class="lc-line"/>${tailPath}</svg>
${ticks.map(t => `<span class="lc-y" style="top:${Y(t).toFixed(2)}%">${fmt(t)}</span>`).join('')}
${dots}<i class="lc-dot low" style="left:${X(pts[iLow].x).toFixed(2)}%;top:${Y(pts[iLow].v).toFixed(2)}%"></i>
${me != null && me !== iLow ? `<i class="lc-dot me" style="left:${X(pts[me].x).toFixed(2)}%;top:${Y(pts[me].v).toFixed(2)}%"></i>` : ''}
${me != null && meLabel ? lab(me, meLabel, 'me') : ''}
${lowLabel ? lab(iLow, lowLabel, 'lowlab') : ''}
${ref > 0 && refLabel ? `<span class="lc-lab reflab" style="left:97%;top:${Y(ref).toFixed(2)}%">${refLabel}</span>` : ''}
</div><div class="lc-x">${xs.map(t => `<span${t.me ? ' class="me"' : ''} style="left:${X(t.x).toFixed(2)}%">${t.t}</span>`).join('')}</div></div>`;
};
// 가격 기록 선 그래프 — 가로축은 실제 날짜 간격, 단가 무리 3건 이상이면 단가로 (용량 다른 상품을 총액으로 이으면 오르내림이 거짓말이 된다).
// 점을 누르면 상품명이 뜨던 줄은 11/4 사장님 요청으로 뺐다 — 다시 넣지 않는다
const spark = (arr, usc, uarr, me) => {
  const unit = !!(usc && uarr && uarr.length >= 3);
  const val = d => (unit ? Math.round(UNITS.get(d.uid).per * usc.k) : d.price);
  // 같은 날 뜬 딜이 여럿이면 그날 가장 싼 하나만 — 하루 안에서 선이 세로로 튀지 않게 (이번 딜은 늘 남긴다)
  const byDay = new Map();
  for (const d of (unit ? uarr : arr).filter(d => d.price > 0)) { const k = kst(d.sentAt).ymd, o = byDay.get(k);
    if (!o || d === me || (o !== me && val(d) < val(o))) byDay.set(k, d); }
  const ds = [...byDay.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  if (ds.length < 2) return '';
  const ts = ds.map(d => Date.parse(d.sentAt)), t0 = ts[0], t1 = ts[ts.length - 1];
  const pts = ds.map((d, i) => ({ x: t1 > t0 ? (ts[i] - t0) / (t1 - t0) : i / (ds.length - 1), v: val(d) }));
  const iMe = me ? ds.indexOf(me) : -1, low = Math.min(...pts.map(p => p.v));
  const what = unit ? usc.label + ' ' : '';
  // 가격 그대로 그리는데 3배 넘게 벌어지면 서로 다른 상품이 섞인 것이다(오뚜기 2,180원 소스 ↔ 2.5만 원 묶음) — 그래프를 안 그린다 (11/4 사장님)
  const vals = pts.map(p => p.v);
  if (!unit && Math.max(...vals) > 3 * Math.min(...vals)) return '';
  return lineChart({ pts, color: 'var(--brand)', aria: `${what}가격 기록 그래프, 가장 낮은 값 ${won(low)}`,
    lowLabel: `최저 ${what}${won(low)}`, me: iMe >= 0 ? iMe : null, meLabel: iMe >= 0 && pts[iMe].v !== low ? `이번 ${won(pts[iMe].v)}` : '',
    xs: (() => { const out = []; ds.forEach((d, i) => { const x = pts[i].x; if (i === 0 || i === ds.length - 1 || out.every(o => Math.abs(o.x - x) > 0.18)) out.push({ x, t: dateShort(d.sentAt), me: d === me }); });
      return out.filter((o, i, a) => i === a.length - 1 || a[a.length - 1].x - o.x > 0.16 || i === 0); })() })
    + (iMe >= 0 && pts[iMe].v === low ? '<p class="note">이번 딜이 이 기록에서 가장 낮은 값이에요.</p>' : '')
    + (unit && !me ? `<p class="note">용량이 달라 ${usc.label} 가격으로 그렸어요.</p>` : '');
};

// 홈의 「최근 보낸 딜」 을 실시간으로 채운다 (lp/02 와 같은 파이어베이스 경로).
// 정적 페이지는 10분마다 다시 만들어지지만, 사람이 보는 목록은 카톡에 보내는 순간 바로 뜨게 한다.
// 새 딜의 상세 페이지가 아직 안 만들어졌으면 /new/ (파이어베이스에서 바로 그리는 상세) 로 보낸다.
const liveScript = known => `<script>
(function () {
  var URL_ = 'https://hotdeal-feed-default-rtdb.asia-southeast1.firebasedatabase.app/feed/items.json?orderBy=%22sentMs%22&limitToLast=20';
  var KNOWN = new Set(${JSON.stringify(known)});
  var box = document.getElementById('recent'); if (!box || !window.EventSource) return;
  var TOP = ${JSON.stringify(Date.parse((deals[0] || {}).sentAt) || 0)};
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
    list = list.filter(function (d) { return d && d.uid && d.title && d.mall !== '토스쇼핑' && !/toss\\.(im|shopping)/.test(d.link || '') && !have.has(String(d.uid)) && (d.sentMs || 0) > TOP; })
      .sort(function (a, b) { return (a.sentMs || 0) - (b.sentMs || 0); });
    list.forEach(function (d) { have.add(String(d.uid)); box.insertBefore(card(d), box.firstChild); });
    var tag = document.getElementById('livetag'); if (tag && list.length) tag.textContent = '실시간 · 새 딜 ' + list.length + '건';
  }
  var es = new EventSource(URL_);
  function on(ev) { try { var m = JSON.parse(ev.data); if (m && m.data) apply(m.data); } catch (e) {} }
  es.addEventListener('put', on); es.addEventListener('patch', on);
})();
</script>`;

// 딜 설명 문장 — 숫자는 모두 기록에 있는 것만 쓴다. 지어내지 않는다
// 은/는 — 상품명 끝 글자 받침으로 고른다. 숫자·영문 끝은 읽는 소리로 (1963 → 삼 → 은, 4봉 → 봉 → 은)
const 은는 = w => {
  const c = String(w).trim().replace(/[s)]}'"’”.,·!?]+$/, '').slice(-1);
  const k = c.charCodeAt(0);
  if (k >= 0xAC00 && k <= 0xD7A3) return (k - 0xAC00) % 28 ? '은' : '는';
  if (/[0-9]/.test(c)) return '0136789'.includes(c) ? '은' : '는';
  if (/[a-z]/i.test(c)) return 'lmnr'.includes(c.toLowerCase()) ? '은' : '는';
  return '은(는)';
};
// 같은 상품인가 — 이름이 (띄어쓰기·기호 빼고) 같거나, 모델 코드(BM7620-83A·TAH2209 같은 영문+숫자)가 겹칠 때만.
// 500ml·70gsm·1875g 같은 숫자+단위는 모델 코드로 치지 않는다
const normTitle = t => String(t || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
// Ultra5·i7 같은 사양 이름은 여러 모델에 붙으므로, 하이픈이 있거나 숫자가 3자리 이상인 것만 모델 코드로 본다.
// 코드가 같아도 용량(2TB/4TB·591ml/887ml)이 다르면 다른 상품이다
const codesOf = t => new Set((String(t || '').match(/[A-Za-z0-9][A-Za-z0-9-]{2,}/g) || [])
  .filter(s => /[a-z]/i.test(s) && /\d/.test(s) && !/^[\d.]+[a-z]+\d*$/i.test(s) && (/-/.test(s) || (s.match(/\d/g) || []).length >= 3))
  .map(s => s.toUpperCase()));
const sizesOf = t => (String(t || '').match(/\d+(?:\.\d+)?\s*(?:tb|gb|ml|kg|l|g)(?![a-z])/gi) || []).map(s => s.replace(/\s/g, '').toLowerCase()).sort().join(',');
const byItemKey = new Map();
for (const x of deals) for (const k of ['t:' + normTitle(x.title), ...[...codesOf(x.title)].map(c => 'c:' + c)]) {
  if (!byItemKey.has(k)) byItemKey.set(k, []);
  byItemKey.get(k).push(x);
}
const sameItems = d => [...new Map(['t:' + normTitle(d.title), ...[...codesOf(d.title)].map(c => 'c:' + c)]
  .flatMap(k => byItemKey.get(k) || []).filter(x => x.uid !== d.uid && x.price > 0 && sizesOf(x.title) === sizesOf(d.title)).map(x => [x.uid, x])).values()];
// 단가 (11/4) — 제목의 용량·개수로 100g·kg·100ml·L·개당 가격을 낸다. 「이번 딜이 우리가 본 것 중 몇 번째로 싼가」를 보여 주려는 것.
// 틀린 단가는 없느니만 못하니 애매하면 null: 용량이 두 가지(1kg 5kg 9kg 옵션), 개수 표기가 둘 이상, 1+1·증정·택1·모음.
// 먹거리·생필품 분류만 계산한다 — 텀블러 1.18L·자석고리 7kg(버티는 무게) 같은 숫자는 단가가 아니다
const UNIT_CATS = new Set(['라면', '생수·탄산수', '음료', '커피·차', '우유·두유·요거트', '과자·간식', '즉석밥·간편식', '고기·수산', '과일·채소',
  '소스·조미료', '영양제·건강', '주류', '화장지·물티슈', '세제·섬유유연제', '샴푸·바디·헤어', '스킨케어·화장품', '구강용품']);
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z가-힣])/gi;
const COUNT_RE = /(?:[x×*]\s*(\d+)\s*(?:개입|개|팩|입|봉|병|캔|포|박스|통|ea|구|롤|매|세트)?|(\d+)\s*(?:개입|개|팩|입|봉|병|캔|포|박스|통|ea|구|롤|세트))(?![가-힣a-z])/gi;
const unitOf = d => {
  const t = String(d.title || '').replace(/\[[^\]]*\]/g, ' ');
  if (!(d.price > 0) || !catOf(d).some(c => UNIT_CATS.has(c)) || /\+|증정|택\s*\d|택일|옵션|골라|모음|외\s|~|\d\s*\/\s*\d/.test(t)) return null;
  // 240정·60캡슐(알약 수)은 단위로 안 친다(커피 캡슐 21개와 섞였다). 제목에 가격(23,860원)이 박힌 건 딜 가격과 어긋난 적이 있다(세타필 2개/1개 같은 값)
  if (/\d\s*(정|캡슐|알|타블렛)(?![가-힣])|\d원/.test(t)) return null;
  const sizes = [...t.matchAll(SIZE_RE)].map(m => { const n = +m[1], u = m[2].toLowerCase(); return { q: /k|^l$/.test(u) ? n * 1000 : n, b: /g/.test(u) ? 'g' : 'ml' }; });
  if (new Set(sizes.map(s => s.b + s.q)).size > 1) return null;
  const rest = t.replace(SIZE_RE, ' ');
  const counts = [...rest.matchAll(COUNT_RE)].map(m => +(m[1] || m[2]));
  // 못 읽은 「×2」가 남아 있으면 개수를 놓친 것이다 (6개입*2세트 → 6 으로만 셌다)
  if (/[x×*]\s*\d/i.test(rest.replace(COUNT_RE, ' '))) return null;
  if (counts.length > 1 || counts.some(c => !(c >= 1 && c <= 500))) return null;
  const n = counts[0] || 1;
  if (sizes.length) return sizes[0].q > 0 ? { base: sizes[0].b, total: sizes[0].q * n, per: d.price / (sizes[0].q * n) } : null;
  return counts.length ? { base: '개', total: n, per: d.price / n } : null;
};
const UNITS = new Map(deals.map(d => [d.uid, unitOf(d)]));
// 무리의 크기에 맞춰 kg·L 또는 100g·100ml 로 읽는다 (생수 2L×30 은 L당, 과자 30g×8 은 100g당)
const unitScale = arr => {
  const b = UNITS.get(arr[0].uid).base;
  if (b === '개') return { label: '개당', k: 1 };
  const tot = arr.map(d => UNITS.get(d.uid).total).sort((x, y) => x - y), mid = tot[tot.length >> 1];
  return mid >= 1000 ? { label: b === 'g' ? 'kg당' : 'L당', k: 1000 } : { label: b === 'g' ? '100g당' : '100ml당', k: 100 };
};
const unitWon = (d, sc) => won(Math.round(UNITS.get(d.uid).per * sc.k));
// 딜 하나의 비교 무리: 같은 품목 단어 + 같은 분류 + 같은 단위.
// 무리가 여럿이면 품목 이름(분류 정의에 나오는 말 — 샴푸·소스·시리얼)을 브랜드·꾸밈말(퍼퓸·청정원)보다 먼저, 그다음 좁은 것.
// 단가가 4배 넘게 벌어지면 서로 다른 물건이 섞인 것으로 보고 안 보여 준다 (퍼퓸: 샴푸 ↔ 바디스프레이 23배, 초콜릿: 과자 ↔ 프로틴 파우더)
const TYPE_WORDS = new Set(CATS.flatMap(([, inc]) => inc.source.split('|').map(s => s.replace(/[^가-힣A-Za-z]/g, '')).filter(s => s.length >= 2)));
const unitSpreadOk = arr => { const ps = arr.map(x => UNITS.get(x.uid).per); return Math.max(...ps) <= 4 * Math.min(...ps); };
const unitGroup = d => {
  const u = UNITS.get(d.uid); if (!u) return null;
  const cats = catOf(d);
  const cands = kwOf(d).map(w => ({ w, type: TYPE_WORDS.has(w), arr: byKw[w].filter(x => { const v = UNITS.get(x.uid); return v && v.base === u.base && catOf(x).some(c => cats.includes(c)); }) }))
    .filter(c => c.arr.length >= 3 && unitSpreadOk(c.arr))
    .sort((a, b) => (b.type - a.type) || (a.arr.length - b.arr.length));
  const best = cands[0];
  if (!best) return null;
  const sorted = best.arr.slice().sort((a, b) => UNITS.get(a.uid).per - UNITS.get(b.uid).per);
  return { w: best.w, arr: sorted, rank: sorted.indexOf(d) + 1, sc: unitScale(sorted) };
};
const unitTable = (arr, sc, me) => `<div class="tbl"><table><thead><tr><th>날짜</th><th>상품</th><th class="r">가격</th><th class="r">${sc.label}</th></tr></thead><tbody>
${arr.map((x, i) => `<tr${x === me || (!me && i === 0) ? ' class="low"' : ''}><td>${dateShort(x.sentAt)}</td><td>${x === me ? `<b>${esc(x.title)}</b> (이번)` : `<a href="${dealUrl(x)}">${esc(x.title)}</a>`}</td><td class="r">${won(x.price)}</td><td class="r">${unitWon(x, sc)}</td></tr>`).join('')}
</tbody></table></div>`;

// 보낸 시점의 검증 기록 (11/4) — 카톡 메시지와 같은 재료를 피드가 넘겨준다 (feed-push.js entryOf: check·hist·review·spec·alt·unit).
// 우리 판단을 덧붙이지 않는다. 다나와가 보여준 값을 그 시점 기록으로 옮길 뿐이다. 피드에 없으면 칸을 안 만든다
const HIST_TERM = { 12: '1년', 6: '6개월', 3: '3개월', 1: '한 달' };
// 1년 가격 흐름 (피드 trend = 다나와 월별 최저가). 구성이 다른 값이 섞이므로(신라면 40개 묶음 2만 원대 사이에 1,090원)
// 중앙값의 1/3 아래·3배 위는 빼고, 남은 게 4개 미만이거나 값이 다 같으면(등록 직후) 안 그린다
const trendChart = d => {
  const raw = Array.isArray(d.trend) ? d.trend.filter(x => x && /^[0-9]{2}-[0-9]{2}$/.test(x.m) && x.p > 0) : [];
  if (raw.length < 4) return '';
  const sorted = raw.map(x => x.p).sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  const pts = raw.filter(x => x.p >= med / 3 && x.p <= med * 3);
  if (pts.length < 4 || new Set(pts.map(x => x.p)).size < 2) return '';
  const low = pts.reduce((a, b) => (b.p < a.p ? b : a));
  const mLabel = m => `${+m.slice(3)}월`;
  // 결론 한 줄 — 평소 시세(달마다 최저값의 가운데)와 1년 최저를 이번 딜과 견준다
  const ps = pts.map(x => x.p).sort((x, y) => x - y), usual = ps[ps.length >> 1], p = d.price;
  const head = p < low.p ? `<b>1년 동안 이렇게 싼 적이 없어요.</b> 평소엔 ${won(usual)} 안팎이었고, 제일 쌌던 ${mLabel(low.m)}(${won(low.p)})보다도 <b>${won(low.p - p)} 더 싸요</b>.`
    : p < usual ? `평소 시세(${won(usual)} 안팎)보다 <b>${won(usual - p)} 싸요</b>. 다만 ${mLabel(low.m)}엔 ${won(low.p)}까지 내려간 적이 있어요.`
    : `이번 가격은 평소 시세(${won(usual)} 안팎)와 비슷하거나 조금 높아요. 제일 쌌던 건 ${mLabel(low.m)}의 ${won(low.p)}이었어요.`;
  // 가로축: 「이번 딜」은 오른쪽 끝에 붙어 넓으니 그 앞 4분의 1에는 달 이름을 안 둔다 (폰에서 「10월이번 딜」로 붙었다)
  return `<h3 style="margin:18px 0 6px;font-size:15px">이 상품의 1년 시세</h3><p class="trend-head">${head}</p>`
    + lineChart({ pts: [...pts.map((x, i) => ({ x: i / pts.length, v: x.p })), { x: 1, v: p }], color: 'var(--mid)', tail: true, aria: `월별 최저가 그래프, 평소 ${won(usual)} 안팎, 이번 딜 ${won(p)}`,
      lowLabel: `${mLabel(low.m)} 최저 ${won(low.p)}`, me: pts.length, meLabel: `이번 딜 ${won(p)}`,
      xs: [...pts.map((x, i) => ({ x: i / pts.length, t: mLabel(x.m) })).filter((o, i) => i % 2 === 0 && o.x < 0.75), { x: 1, t: '이번 딜', me: true }] })
    + `<p class="note">회색 선은 같은 규격 상품이 달마다 가장 싸게 팔렸던 값이고, 맨 끝 빨간 점선이 이번 딜 가격이에요.${pts.length < raw.length ? ' 구성이 달라 보이는 값은 뺐어요.' : ''}</p>`;
};
// 보낸 시점 다른 판매처 (피드 comps — 카톡 메시지의 비교 줄 그대로)
// 다른 판매처 링크 (11/5) — 피드 sellers 의 쇼핑몰 코드·상품 번호로 우리 제휴 링크를 만든다. 다나와 링크는 쓰지 않는다(다나와 제휴 코드가 붙어 있다).
// 틀은 hotdeal.best 「가격 비교」 칸(/api/price-compare)이 쓰는 것과 같다(11/5 풀어 보고 확인): 링크프라이스 a=A100702842 는 우리 딜 링크와 같은 계정.
// 사이트 꼬리표 u_id=hotdealbest_web. G마켓은 에디 틀 — 사이트용 번호가 없어 카톡용 번호(2463553347)를 쓴다(수수료는 같고 리포트에서 카톡과 섞인다).
// 상품 번호 모양이 틀이 기대하는 것과 다르면 링크를 안 만든다 — 엉뚱한 상품으로 보내느니 없는 게 낫다. 틀을 모르는 쇼핑몰(롯데마트몰·SK스토아 등)도 빈칸
const sellerHref = s => {
  const id = String(s.id || ''), c = String(s.code || ''), n = String(s.mall || '').trim();
  const lp = (m, u) => 'https://click.linkprice.com/click.php?m=' + m + '&a=A100702842&l=9999&l_cd1=3&l_cd2=0&tu=' + encodeURIComponent(u) + '&u_id=hotdealbest_web';
  if (c === 'TH201' || n === '11번가') return /^[0-9]{6,12}$/.test(id) ? lp('11st', 'https://www.11st.co.kr/products/' + id) : '';
  if (c === 'EE715' || n === '옥션') return /^[A-Z]?[0-9]{6,12}$/.test(id) ? lp('auction', 'https://itempage3.auction.co.kr/DetailView.aspx?itemno=' + id) : '';
  if (c === 'EE128' || /^G마켓$/i.test(n)) return /^[0-9]{6,12}$/.test(id) ? 'https://ad0981.kr/link/2463553347?gmarket2=' + id : '';
  if (c === 'EE309' || /^롯데ON$/i.test(n)) return /^LO[0-9]{6,14}$/.test(id) ? lp('lotteon', 'https://www.lotteon.com/p/product/' + id) : '';
  if (c === 'TN118' || c === 'ED901' || c === 'EE311' || /^(SSG\.COM|신세계몰|이마트몰)$/i.test(n)) return /^1[0-9]{12}$/.test(id) ? lp('emart', 'https://www.ssg.com/item/itemView.ssg?itemId=' + id) : '';
  if (c === 'TRB03' || /신세계라이브/.test(n)) return /^[0-9]{6,12}$/.test(id) ? lp('ssglive', 'https://www.shinsegaetvshopping.com/display/detail/' + id) : '';
  if (/^GS ?(SHOP|샵)$/i.test(n)) return /^[0-9]{6,12}$/.test(id) ? lp('gseshop', 'https://www.gsshop.com/prd/prd.gs?prdid=' + id) : '';
  return '';
};
// 상품 주소로 우리 링크 (hotdeal.best 가격비교 자료용) — 주소의 쇼핑몰마다 링크프라이스 광고주 이름, G마켓은 에디 틀. 모르는 주소는 빈칸
const urlHref = raw => {
  let x; try { x = new URL(raw); } catch (e) { return ''; }
  if (x.protocol !== 'https:') return '';
  const h = x.hostname, lp = m => 'https://click.linkprice.com/click.php?m=' + m + '&a=A100702842&l=9999&l_cd1=3&l_cd2=0&tu=' + encodeURIComponent(raw) + '&u_id=hotdealbest_web';
  if (/(^|\.)gmarket\.co\.kr$/.test(h)) { const g = x.searchParams.get('goodscode') || x.searchParams.get('goodsCode'); return /^[0-9]{6,12}$/.test(g || '') ? 'https://ad0981.kr/link/2463553347?gmarket2=' + g : ''; }
  const M = [[/(^|\.)11st\.co\.kr$/, '11st'], [/(^|\.)auction\.co\.kr$/, 'auction'], [/(^|\.)lotteon\.com$/, 'lotteon'], [/(^|\.)ssg\.com$/, 'emart'], [/(^|\.)gsshop\.com$/, 'gseshop'],
    [/(^|\.)lotteimall\.com$/, 'woori'], [/(^|\.)nsmall\.com$/, 'nsseshop'], [/(^|\.)shinsegaetvshopping\.com$/, 'ssglive'], [/(^|\.)halfclub\.com$/, 'halfclub1']];
  for (const [re, m] of M) if (re.test(h)) return lp(m);
  return '';
};
// 바로 갈 수 있는 판매처만, 4곳까지. 2곳이 안 되면 안 그린다(위 비교 상자와 같은 말이 된다)
// 다나와 판매처 목록(sellers, 보낸 때 · 배송비 따로)이 있으면 그것만, 없으면 hotdeal.best 가격비교(hcomp, 받은 때 · 판매처가 보여 준 값)
const sellersTable = d => {
  const seen = new Set(), dn = Array.isArray(d.sellers) && d.sellers.length;
  const src = dn ? d.sellers.map(x => Object.assign({}, x, { href: sellerHref(x) })) : (Array.isArray(d.hcomp) ? d.hcomp : []).map(x => Object.assign({}, x, { href: urlHref(x.url) }));
  const rows = src.filter(x => x && x.price > 0 && x.href && !seen.has(x.href) && seen.add(x.href)).slice(0, 4);
  if (rows.length < 2) return '';
  if (!dn) return '<h3 style="margin:18px 0 6px;font-size:15px">다른 판매처에서 바로 보기</h3><div class="tbl"><table><thead><tr><th>판매처</th><th class="r">가격</th><th class="r"></th></tr></thead><tbody>'
    + rows.map(x => '<tr><td>' + esc(x.mall || '판매처') + '</td><td class="r">' + won(x.price) + '</td><td class="r"><a href="' + esc(x.href) + '" target="_blank" rel="nofollow sponsored noopener" class="go">보기 ↗</a></td></tr>').join('')
    + '</tbody></table></div><p class="note">' + (d.hcompAt ? dateTime(d.hcompAt) + '에 ' : '') + '판매처별 가격(배송비·옵션에 따라 다를 수 있어요). 이 링크로 구매하시면 핫딜베스트가 일정액의 수수료를 받아요.</p>';
  const ship = x => x.ship === 0 ? '무료' : x.ship > 0 ? won(x.ship) : '–';
  return '<h3 style="margin:18px 0 6px;font-size:15px">다른 판매처에서 바로 보기</h3><div class="tbl"><table><thead><tr><th>판매처</th><th class="r">가격</th><th class="r">배송비</th><th class="r"></th></tr></thead><tbody>'
    + rows.map(x => '<tr><td>' + esc(x.mall || '판매처') + '</td><td class="r">' + won(x.price) + '</td><td class="r">' + ship(x) + '</td><td class="r"><a href="' + esc(x.href) + '" target="_blank" rel="nofollow sponsored noopener" class="go">보기 ↗</a></td></tr>').join('')
    + '</tbody></table></div><p class="note">보낸 때 함께 확인한 가격이에요. 이 링크로 구매하시면 핫딜베스트가 일정액의 수수료를 받아요.</p>';
};
const compsTable = d => {
  const cs = Array.isArray(d.comps) ? d.comps.filter(c => c && c.price > 0).slice(0, 4) : [];
  if (cs.length < 2 || !(d.price > 0)) return '';   // 한 곳뿐이면 위 비교 상자·문장과 같은 말이다
  return `<h3 style="margin:18px 0 6px;font-size:15px">다른 곳은 얼마였을까요?</h3><div class="tbl"><table><thead><tr><th>어디</th><th class="r">가격</th><th class="r">이번 딜과 차이</th></tr></thead><tbody>
<tr class="low"><td><b>이번 딜</b> · ${esc(d.mall)}</td><td class="r">${won(d.price)}</td><td class="r">–</td></tr>
${cs.map(c => `<tr><td>${esc(noteKo(c.name) || '다른 곳')}</td><td class="r">${won(c.price)}</td><td class="r${c.price > d.price ? ' gain' : ''}">${c.price > d.price ? '+' + won(c.price - d.price) : c.price < d.price ? '−' + won(d.price - c.price) : '같음'}</td></tr>`).join('')}
</tbody></table></div>`;
};
// 이 가격, 얼마나 싼 거예요? (11/4 사장님: 「보고서처럼 딱딱하다, 편하게 읽히게」)
// 예전 「보낸 시점에 확인한 것」(목록)과 「이 딜에 대해」(합니다체)를 한 이야기로 합쳤다. 숫자는 그대로, 말투만 해요체로.
// 우리 판단은 덧붙이지 않는다 — 피드(check·hist·review·unit·spec·alt)와 우리 기록에 있는 것만 말한다.
// 사이트에만 올린 딜의 이유는 할인율이 20% 미만일 때만 말한다 — 20% 넘는데 사이트에만 간 건 발송 시간 밖·가전 등이라 「살짝 못 미쳐서」가 거짓이었다(91쪽)
const storyBox = d => {
  const t = kst(d.sentAt), P = [];
  P.push(`${t.mo}월 ${t.d}일 ${t.h}:${t.mi}, ${esc(d.mall)}에서 <b>${won(d.price)}</b>에 떴어요. `
    + (d.web ? (d.saving > 0 && d.saving < 20 ? '카톡방은 다른 곳보다 20% 이상 쌀 때만 보내서, 이 딜은 이 사이트에만 올렸어요.' : '이 딜은 카톡방엔 보내지 않고 이 사이트에만 올렸어요.') : '핫딜베스트 카톡방에 바로 보낸 딜이에요.'));
  const c = d.check, cheap = d.saving > 0 ? ` 이번 딜이 <b>${d.saving}% 더 싸요</b>.` : '';
  if (c && c.market > 0) {
    const ship = c.ship === 0 ? '(무료배송)' : c.ship > 0 ? `(배송비 ${won(c.ship)}은 따로)` : (c.delivered > c.market ? `(배송비까지 치면 ${won(c.delivered)})` : '');
    P.push((c.malls > 1 ? `같은 규격 상품을 ${c.malls}곳에서 팔고 있었는데, 그중 제일 싼 곳도 ${won(c.market)}${ship}이었어요.`
      : `같은 규격 상품을 파는 곳이 한 곳뿐이었는데, 거기 가격이 ${won(c.market)}${ship}이었어요.`) + cheap);
  } else if (d.baseline && d.saving) {
    // 비교 출처마다 자연스러운 문장으로 (「47곳 중 최저 · 무료배송가」처럼 이름을 그대로 붙이면 어색했다)
    const nt = String(d.baselineNote || ''), m1 = nt.match(/^([0-9]+)곳 중 최저( · 무료배송)?/), m2 = nt.match(/^판매글 ([0-9]+)곳 최저가/), m3 = nt.match(/^판매글 ([0-9]+)곳 중간값/);
    P.push((m1 ? `같은 때 같은 상품을 ${m1[1]}곳에서 팔았는데, 그중 제일 싼 곳도 ${won(d.baseline)}${m1[2] ? '(무료배송)' : ''}이었어요.`
      : m2 ? `같은 때 다른 판매처 ${m2[1]}곳 중 제일 싼 곳이 ${won(d.baseline)}이었어요.`
      : m3 ? `같은 때 다른 판매처 ${m3[1]}곳의 중간 가격이 ${won(d.baseline)}이었어요.`
      : `같은 때 다른 곳은 ${won(d.baseline)}이었어요.`) + cheap);
  } else if (d.alt && d.alt.price > 0) {
    P.push(`다른 곳은 ${won(d.alt.price)}이었어요${d.alt.where ? `(${esc(d.alt.where)})` : ''}. 차이가 크지 않아서 할인율은 따로 안 적었어요.`);
  }
  const h = d.hist;
  if (h && h.months) {
    const term = HIST_TERM[h.months] || `${h.months}개월`;
    if (h.cheaper) P.push(`지난 ${term} 동안 이보다 싸게 판 적이 없어요. <b>${term} 중 가장 싼 값</b>이에요.`);
    else if (h.low > 0) P.push(`다만 지난 ${term} 사이에 <b>${won(h.low)}</b>까지 내려간 적은 있어요.`);
  }
  // 같은 상품끼리만 비교한다 — 품목 단어(브랜드)만 같으면 다른 모델이 섞인다(시티즌 에코드라이브 ↔ 큐앤큐, 11/3)
  const same = sameItems(d);
  if (same.length) {
    const lo = same.reduce((a, b) => (b.price < a.price ? b : a));
    P.push(lo.price < d.price ? `이 상품, ${dateShort(lo.sentAt)}에는 <b>${won(lo.price)}</b>에 고른 적도 있어요. 이번이 제일 싼 건 아니에요.`
      : `이 상품을 다른 날 ${same.length}번 더 골랐는데, 이번이 <b>제일 싸요</b>(같은 가격 포함).`);
  }
  const u = d.unit && typeof d.unit === 'object' && d.unit.value > 0 ? d.unit : null, r = d.review;
  const more = [u ? `${esc(u.label)}으로 치면 <b>${won(u.value)}</b>이에요.` : '',
    r && r.count >= 100 ? `상품평은 ${Number(r.count).toLocaleString('ko-KR')}개, 평균 ${r.score}점이에요${r.low > 0 ? `(낮은 별점 ${Number(r.low).toLocaleString('ko-KR')}개)` : ''}.` : ''].filter(Boolean).join(' ');
  if (more) P.push(more);
  const spec = Array.isArray(d.spec) ? d.spec.filter(Boolean) : [];
  return `<section class="about story"><h2>이 가격, 얼마나 싼 거예요?</h2>${P.map(p => `<p>${p}</p>`).join('')}<p class="note"><a href="/about/">핫딜베스트가 딜을 고르는 기준 →</a></p>
${sellersTable(d) || compsTable(d)}${trendChart(d)}
${spec.length ? `<h3 style="margin:18px 0 6px;font-size:15px">이런 상품이에요</h3><ul class="chips specs">${spec.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="note">제조사가 적은 내용이에요.</p>` : ''}
${buyLink(d) && (P.length >= 4 || sellersTable(d) || compsTable(d) || trendChart(d)) ? `<div class="stack again">${buyLink(d)}</div>` : ''}</section>`;
};

// 얼마나 자주 뜨나 (11/4) — 「놓쳤지만 또 온다」. 끝난 딜 페이지로 들어온 사람에게 다음 딜을 기다릴 근거를 준다.
// 같은 상품 기록(다시 보낸 것·같은 이름/모델)이 둘 이상이면 그걸, 아니면 품목 단어 무리(3건 이상)를 쓴다. 숫자는 기록 그대로
const NOW = Date.now();
const appearOf = arr => [...new Set(arr.flatMap(x => [x.sentAt, ...(x.earlier || []).map(e => e.sentAt)]).filter(Boolean).map(t => String(t).slice(0, 16)))].sort();
const freqOf = times => {
  const n = times.length, first = Date.parse(times[0] + ':00+09:00'), last = Date.parse(times[n - 1] + ':00+09:00');
  const gap = n >= 3 && last > first ? Math.round((last - first) / 864e5 / (n - 1)) : null;
  return { n, first: times[0], last: times[n - 1], gap: gap >= 1 ? gap : null, d30: times.filter(t => NOW - Date.parse(t + ':00+09:00') < 30 * 864e5).length };
};
const freqBox = d => {
  const same = appearOf([d, ...sameItems(d)]);
  let head, text;
  if (same.length >= 2) {
    const f = freqOf(same);
    head = '놓치면 또 올까요?';
    text = `이 상품은 ${dateShort(f.first)}부터 <b>${f.n}번</b> 싸게 떴어요${f.gap ? `. 평균 <b>${f.gap}일</b>에 한 번꼴이에요` : ''}. 뜬 날은 ${same.map(t => dateShort(t)).join(', ')}이에요.`;
  } else {
    const w = kwOf(d).filter(w => byKw[w].length >= 3).sort((a, b) => (TYPE_WORDS.has(b) - TYPE_WORDS.has(a)) || (byKw[a].length - byKw[b].length))[0];
    if (!w) return '';
    const f = freqOf(appearOf(byKw[w]));
    head = '놓치면 또 올까요?';
    text = [`<a href="${url('k', w)}">${esc(w)}</a> 딜은 ${dateShort(f.first)}부터 <b>${f.n}번</b> 떴어요.`,
      f.gap ? `평균 <b>${f.gap}일</b>에 한 번꼴이에요.` : '', f.d30 ? `최근 한 달 사이에만 ${f.d30}번이고,` : '', `마지막으로 뜬 건 ${dateShort(f.last)}이에요.`].filter(Boolean).join(' ');
  }
  const ug = unitGroup(d);
  const gw = kwOf(d).filter(w => byKw[w].length >= 3).sort((a, b) => (TYPE_WORDS.has(b) - TYPE_WORDS.has(a)) || (byKw[a].length - byKw[b].length))[0];
  const gp = gw ? byKw[gw].map(x => x.price).filter(p => p > 0) : [];
  // ② 「핫딜베스트가 고른 ○○ 딜」 선 그래프는 뺐다 (11/4) — 서로 다른 상품을 날짜순으로 이으면 오르내림처럼 보이고,
  // 같은 날 뜬 딜끼리 세로로 튀었다(농심 장칼국수: 10/21 세 개 → 10/25). 같은 품목끼리의 비교는 위 「같은 ○○ 딜이랑 비교하면?」 순위표가 맡는다
  const chart = '';
  const cw = ug ? ug.w : gw, cn = ug ? ug.arr.length : gw ? byKw[gw].length : 0;
  return `<section class="about"><h2>${head}</h2><p>${text}</p><p>이번 걸 놓쳤다면, 카톡방에서 다음 딜을 먼저 받아 보세요.</p>${chart ? `<h3 style="margin:14px 0 2px;font-size:15px">${trendChart(d) ? '② ' : ''}핫딜베스트가 고른 ${esc(cw)} 딜 ${cn}개${ug ? `, ${ug.sc.label} 가격` : ''}</h3><p class="note" style="margin:0 0 8px">이 상품만이 아니라, 이름에 「${esc(cw)}」 단어가 들어간 딜을 날짜순으로 이었어요${ug ? `. 용량이 제각각이라 ${ug.sc.label} 가격으로 바꿨어요` : ''}.</p>${chart}` : ''}</section>`;
};


// 상세 윗부분(사진·가격·비교 상자·경고·구매 버튼). 정식 페이지와 임시 화면(/new/)이 같이 쓴다
const dealTop = d => {
  const cmp = d.baseline && d.price ? `<div class="cmp" aria-label="가격 비교">
<div class="row us"><b>이 딜</b><span class="bar"><i style="width:${Math.max(6, Math.round(d.price / d.baseline * 100))}%"></i></span><span>${won(d.price)}</span></div>
<div class="row"><span>다른 곳</span><span class="bar"><i style="width:100%"></i></span><span>${won(d.baseline)}</span></div>
${d.baselineNote ? `<p>${esc(noteKo(d.baselineNote))} · 보낸 때 함께 확인한 가격</p>` : ''}</div>` : '';
  return `<div class="deal">
<div class="shot">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.title)}" referrerpolicy="no-referrer">` : ''}</div>
<div><span class="when"><span class="mall">${esc(d.mall)}</span>${dateKo(d.sentAt)} ${d.web ? '확인 · 사이트에만 올린 딜' : '카톡방에 보냄'}</span>
<h1>${esc(d.title)}</h1>
<div class="price"><b>${won(d.price)}</b>${d.saving ? `<span class="save">다른 곳보다 ${d.saving}% 쌈</span>` : ''}${d.hist && d.hist.cheaper ? `<span class="best">${HIST_TERM[d.hist.months] || d.hist.months + '개월'} 중 최저</span>` : ''}</div>
${cmp}
<p class="warn"><b>⚠ ${dateTime(d.sentAt)} 기준 가격이에요<span class="ago" data-t="${esc(d.sentAt)}"></span></b><span>지금 가격은 판매처에서 확인해 주세요.</span></p>
<div class="stack">${buyLink(d)}</div>
</div></div>`;
};

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
  const myCats = catOf(d);
  const sameMall = (byMall[d.mall] || []).filter(x => x.uid !== d.uid && !related.includes(x))
    .map((x, i) => [x, (catOf(x).some(c => myCats.includes(c)) ? 0 : 1e6) + i]).sort((a, b) => a[1] - b[1]).map(p => p[0]).slice(0, 6);
  const ug = unitGroup(d);
  const desc = `${dateKo(d.sentAt)} ${d.mall} ${won(d.price)}` + (ug ? `(${ug.sc.label} ${unitWon(d, ug.sc)})` : '') + '.'
    + (d.baseline ? ` 다른 곳 ${won(d.baseline)}보다 ${d.saving}% 싸게 떠서 핫딜베스트가 고른 딜이에요.` : ' 핫딜베스트가 고른 딜이에요.');
  // 단가로 줄 세우기 — 10줄까지, 이번 딜이 그 밖이면 마지막 줄에 붙인다
  let unitSec = '';
  if (ug) {
    const top = ug.arr.slice(0, 10), rows = top.includes(d) ? top : [...top.slice(0, 9), d];
    const lo = ug.arr[0];
    unitSec = `<section class="about"><h2>같은 ${esc(ug.w)} 딜이랑 비교하면?</h2>
<p>핫딜베스트가 고른 ${esc(ug.w)} 딜 ${ug.arr.length}개를 ${ug.sc.label} 가격으로 줄 세우면, 이번 딜은 <b>${ug.rank}번째</b>로 싸요(${ug.sc.label} ${unitWon(d, ug.sc)}).`
      + (ug.rank > 1 ? ` 제일 쌌던 건 ${dateShort(lo.sentAt)} ${esc(lo.mall)}의 ${ug.sc.label} ${unitWon(lo, ug.sc)}이었어요.` : ' 지금까지 고른 것 중에 <b>제일 싸요</b>.') + `</p>
${unitTable(rows, ug.sc, d)}<p class="note">용량·개수는 상품 이름에서 읽었어요. 브랜드나 구성이 달라서 참고로만 봐 주세요.</p></section>`;
  }
  const body = `${dealTop(d)}
${storyBox(d)}
${unitSec}
${freqBox(d)}
${d.earlier && d.earlier.length ? `<h2>이 상품, 전에는 얼마였을까?</h2><div class="tbl"><table><thead><tr><th>보낸 시각</th><th class="r">가격</th><th class="r">다른 곳</th></tr></thead><tbody>
${[Object.assign({ now: 1 }, d), ...d.earlier].map((e, i, arr) => `<tr${+e.price > 0 && +e.price === Math.min(...arr.map(x => +x.price || Infinity)) ? ' class="low"' : ''}><td>${dateTime(e.sentAt)}${e.now ? ' (이번)' : e.web ? ' · 사이트' : ''}</td><td class="r">${won(e.price)}</td><td class="r">${won(e.baseline)}</td></tr>`).join('')}
</tbody></table></div><p class="note">같은 상품도 뜰 때마다 가격이 달라요.</p>` : ''}
${join}
${catOf(d).filter(c => CATL.includes(c)).length ? `<h2>어느 분류예요?</h2><ul class="chips">${catOf(d).filter(c => CATL.includes(c)).map(c => `<li><a href="${url('c', c)}">${esc(c)} <em>${byCat[c].length}개</em></a></li>`).join('')}</ul>` : ''}
${kws.length ? `<h2>같은 품목 가격 기록 보기</h2><ul class="chips">${kws.map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}개</em></a></li>`).join('')}</ul>` : ''}
${related.length ? `<h2>이런 딜은 어때요?</h2>${grid(related)}` : ''}
${sameMall.length ? `<h2>${esc(d.mall)}에서 최근에 뜬 딜</h2>${grid(sameMall)}` : ''}
<script>(function(){var e=document.querySelector('.ago');if(!e)return;var m=(Date.now()-Date.parse(e.getAttribute('data-t')))/6e4;if(!(m>=0))return;
e.textContent=' · '+(m<5?'방금 전':m<60?Math.floor(m)+'분 전':m<1440?Math.floor(m/60)+'시간 전':Math.floor(m/1440)+'일 전');})();</script>`;
  // 그래프가 둘 다 있을 때만 ①② 번호를 단다 (하나뿐인데 ① 이 붙어 있었다)
  const bodyN = body.includes('② 핫딜베스트가 고른') ? body.replace('>이 상품의 1년 시세</h3>', '>① 이 상품의 1년 시세</h3>') : body;
  // 제목: 「상품 2,600원 (개당 520원) · 11/10 쿠팡 - 핫딜베스트 카톡방」. 단가는 위 상자에 보이는 값(피드 unit)이 먼저, 없으면 같은 품목 순위표의 단가
  // 11/10 「최저가」 뺌 — 지난 가격을 지금 최저가처럼 읽히게 하지 않는다(네이버 스팸 정책 낚시성·키워드 남용, 사장님 결정). 날짜·판매처로 그때 가격임을 드러낸다
  // 11/10 「핫딜」 단어도 뺌 — 브랜드(핫딜베스트) 속 한 번만(네이버 콘텐츠 마크업 「2회 이상 반복적인 키워드」). **이 형식으로 고정(사장님 결정) — 다시 바꾸지 말 것(제목 잦은 변경도 불이익 사유)**
  const tUnit = d.unit && d.unit.value > 0 && d.unit.label ? `${d.unit.label} ${won(d.unit.value)}` : ug ? `${ug.sc.label} ${unitWon(d, ug.sc)}` : '';
  const tWhen = kst(d.sentAt);
  // 네이버 SEO 기본 가이드 「title 텍스트 길이 확인필요」 — 전체가 80자를 넘으면 상품명만 띄어쓰기 자리에서 줄인다(h1·본문은 전체 이름 그대로)
  const tWhere = [tWhen ? `${tWhen.mo}/${tWhen.d}` : '', d.mall || ''].filter(Boolean).join(' ');
  const tTail = ` ${won(d.price)}${tUnit ? ` (${tUnit})` : ''}${tWhere ? ` · ${tWhere}` : ''} - ${SITE}`;
  const tRoom = 80 - tTail.length;
  let tName = d.title;
  if (tName.length > tRoom) { const cut = tName.slice(0, tRoom - 1); const sp = cut.lastIndexOf(' '); tName = (sp > tRoom * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,·/+*(-]+$/, '') + '…'; }
  const title = tName + tTail;
  write(decodeURIComponent(dealUrl(d)).slice(1) + 'index.html', page({ title, desc, canon: dealUrl(d), body: bodyN, img: d.image,
    crumbs: [['홈', '/'], [d.mall, url('mall', d.mall)], [d.title, dealUrl(d)]] }));
  add(dealUrl(d), kst(d.sentAt).ymd);
  if (decodeURIComponent(dealUrl(d)) !== `/deal/${d.uid}/`) write(`deal/${d.uid}/index.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${BASE}${dealUrl(d)}"><meta http-equiv="refresh" content="0;url=${dealUrl(d)}"><title>${esc(d.title)}</title></head><body><a href="${dealUrl(d)}">${esc(d.title)}</a></body></html>`);
}

// 품목별 모음
for (const w of KW) {
  const arr = byKw[w];
  const min = arr.reduce((a, b) => (b.price > 0 && b.price < a.price ? b : a), arr[0]);
  // 단가 순위 (11/4) — 가장 많은 단위(g·ml·개) 쪽만, 3건 이상일 때
  const bases = {};
  for (const d of arr) { const u = UNITS.get(d.uid); if (u) (bases[u.base] = bases[u.base] || []).push(d); }
  const ub = Object.values(bases).sort((a, b) => b.length - a.length)[0] || [];
  const uarr = ub.length >= 3 && unitSpreadOk(ub) ? ub.slice().sort((a, b) => UNITS.get(a.uid).per - UNITS.get(b.uid).per) : [];
  const usc = uarr.length ? unitScale(uarr) : null;
  // 월별 — 딜이 쌓일수록 길어지는 기록. 최근 달부터
  const byMonth = {};
  for (const d of arr) { const t = kst(d.sentAt); const k = `${t.y}-${String(t.mo).padStart(2, '0')}`; (byMonth[k] = byMonth[k] || []).push(d); }
  const months = Object.keys(byMonth).sort().reverse();
  const monthTbl = months.length >= 2 ? `<h2>달마다 얼마였을까?</h2><div class="tbl"><table><thead><tr><th>달</th><th class="r">딜</th><th class="r">제일 싼 가격</th>${usc ? `<th class="r">제일 싼 ${usc.label}</th>` : ''}</tr></thead><tbody>
${months.map(k => { const a = byMonth[k], lo = a.reduce((x, y) => (y.price > 0 && y.price < x.price ? y : x), a[0]);
    const ua = usc ? a.filter(x => uarr.includes(x)).sort((x, y) => UNITS.get(x.uid).per - UNITS.get(y.uid).per) : [];
    return `<tr><td>${+k.slice(0, 4)}년 ${+k.slice(5)}월</td><td class="r">${a.length}개</td><td class="r"><a href="${dealUrl(lo)}">${won(lo.price)}</a></td>${usc ? `<td class="r">${ua.length ? unitWon(ua[0], usc) : '–'}</td>` : ''}</tr>`; }).join('')}
</tbody></table></div>` : '';
  const unitBox = usc ? `<h2>${usc.label} 가격으로 줄 세우면? <small>${uarr.length}개</small></h2>
<p>상품마다 용량·개수가 달라서 ${usc.label} 가격으로 바꿔 줄 세웠어요. 제일 싼 건 <span class="hl">${unitWon(uarr[0], usc)}</span>(${dateShort(uarr[0].sentAt)}, ${esc(uarr[0].mall)})이에요.</p>
${unitTable(uarr.slice(0, 15), usc, null)}<p class="note">용량·개수는 상품 이름에서 읽었어요. 이름만으로 단가를 알 수 없는 딜은 빠져 있어요.</p>` : '';
  // 「가격은 어떻게 움직였을까?」 는 같은 종류 상품끼리일 때만 — 품목 이름(라면·텀블러) 페이지이거나, 단가가 1.8배 안에 모일 때(코카콜라 L당 1.4배).
  // 브랜드 이름으로만 묶이면(농심: 칼국수·감자면, 단가 2.4배) 다른 상품을 이은 선이 「값이 올랐다」로 읽힌다 (11/4)
  const sameKind = TYPE_WORDS.has(w) || (usc && Math.max(...uarr.map(x => UNITS.get(x.uid).per)) <= 1.8 * Math.min(...uarr.map(x => UNITS.get(x.uid).per)));
  // 품목 페이지 선 그래프는 뺐다 (11/4 사장님) — 이름이 비슷한 여러 상품이라 날짜순으로 이으면 「값이 오르내렸다」로 잘못 읽힌다.
  // 59쪽을 다 봐도 점 2~3개·다른 상품 섞임·크기 바뀌며 튐뿐이었다. 순위표·달마다·날짜별 표가 대신 보여 준다
  const chart = '', fq = freqOf(appearOf(arr));
  const body = `<h1>${esc(w)} 핫딜·가격 기록</h1>
<p class="lead">핫딜베스트가 고른 <b>${esc(w)}</b> 딜, 지금까지 <b>${arr.length}개</b>예요.${fq.gap ? ` ${dateShort(fq.first)}부터 평균 <b>${fq.gap}일</b>에 한 번꼴로 떴어요.` : ''}</p>
<p class="lead">그중 제일 쌌던 건 ${dateShort(min.sentAt)} ${esc(min.mall)}의 <span class="hl">${won(min.price)}</span>이에요.${usc ? ` 다만 용량이 제각각이라, ${usc.label} 가격으로 따지면 ${dateShort(uarr[0].sentAt)}의 <span class="hl">${unitWon(uarr[0], usc)}</span>이 제일 쌌어요.` : ' 상품 구성이 서로 달라서 가격만으로 비교하긴 어려워요.'}</p>
${chart ? `<h2>가격은 어떻게 움직였을까?</h2>${chart}` : ''}
${unitBox}
${monthTbl}
<h2>지금까지 뜬 ${esc(w)} 딜 <small>${arr.length}개</small></h2><div class="tbl"><table><thead><tr><th>날짜</th><th>상품</th><th class="r">가격</th></tr></thead><tbody>
${arr.map(d => `<tr${d === min ? ' class="low"' : ''}><td>${dateTime(d.sentAt)}</td><td><a href="${dealUrl(d)}">${esc(d.title)}</a></td><td class="r">${won(d.price)}</td></tr>`).join('')}
</tbody></table></div>
${join}
<h2>${esc(w)} 딜 한눈에 보기</h2>${grid(arr)}`;
  // 11/10 딜 6개 미만 품목은 검색 제외·사이트맵 제외(사람은 그대로 봄) — 얇은 틀 페이지를 대량으로 내지 않는다(네이버 스팸 정책). 기준 6 = 분류(c/) 기준과 같음
  const kThin = arr.length < 6;
  write(`k/${w}/index.html`, page({ noindex: kThin, ld: { '@context': 'https://schema.org', '@type': 'ItemList', name: `${w} 핫딜 기록`, numberOfItems: arr.length, itemListElement: arr.slice(0, 50).map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: BASE + dealUrl(d), name: d.title })) }, title: `${w} 가격 기록${usc ? ` (${usc.label} 최저 ${unitWon(uarr[0], usc)})` : ''} - ${SITE}`, desc: `핫딜베스트가 고른 ${w} 딜 ${arr.length}개와 날짜별 가격. 가장 낮았던 가격 ${won(min.price)}.` + (usc ? ` ${usc.label} 가장 쌌던 가격 ${unitWon(uarr[0], usc)}.` : ''),
    canon: url('k', w), body, img: min.image, crumbs: [['홈', '/'], ['품목별', '/k/'], [w, url('k', w)]] }));
  if (!kThin) add(url('k', w), kst(arr[0].sentAt).ymd);
}
write('k/index.html', page({ title: `품목별 가격 기록 - ${SITE}`, desc: '브랜드·품목별로 핫딜베스트가 고른 딜과 가격 기록을 모았어요.', canon: '/k/',
  crumbs: [['홈', '/'], ['품목별', '/k/']],
  body: `<h1>품목별 핫딜 기록</h1><p class="lead">3번 이상 뜬 브랜드·품목이에요. 누르면 그동안 얼마에 떴는지 볼 수 있어요.</p><ul class="chips">${KW.map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}</em></a></li>`).join('')}</ul>${join}` }));
add('/k/', kst(deals[0].sentAt).ymd);

// 분류별
const sbox = (q = '') => `<form class="sbox" action="/search/" role="search"><input name="q" value="${esc(q)}" placeholder="지난 핫딜 찾기 (예: 라면, 생수)" aria-label="핫딜 검색"><button>검색</button></form>`;
for (const c of CATL) {
  const arr = byCat[c];
  const d30 = arr.filter(d => Date.now() - Date.parse(d.sentAt) < 30 * 864e5).length;
  const kc = {};
  for (const d of arr) for (const w of new Set(kwOf(d))) kc[w] = (kc[w] || 0) + 1;
  const kws = Object.keys(kc).filter(w => kc[w] >= 2 && w !== c).sort((a, b) => kc[b] - kc[a]).slice(0, 18);
  const saves = arr.filter(d => d.saving > 0);
  const avg = saves.length ? Math.round(saves.reduce((t, d) => t + d.saving, 0) / saves.length) : 0;
  // 단가 순위 — 분류 안의 품목 이름(생수·샴푸·햇반)마다, 같은 단위로 3개 이상 모이고 단가가 4배 안에 들 때만. 많은 품목부터 3개까지
  const ugs = Object.keys(kc).filter(w => TYPE_WORDS.has(w) && w !== c).map(w => {
    const bases = {};
    for (const d of arr) if (kwOf(d).includes(w)) { const u = UNITS.get(d.uid); if (u) (bases[u.base] = bases[u.base] || []).push(d); }
    const ub = Object.values(bases).sort((a, b) => b.length - a.length)[0] || [];
    return { w, arr: ub.length >= 3 && unitSpreadOk(ub) ? ub.slice().sort((a, b) => UNITS.get(a.uid).per - UNITS.get(b.uid).per) : [] };
  }).filter(g => g.arr.length).sort((a, b) => b.arr.length - a.arr.length).slice(0, 3);
  const unitBox = ugs.length ? `<h2>${esc(c)}, 단가로 줄 세우면?</h2>
<p>용량·개수가 제각각이라 품목마다 같은 단위 가격으로 바꿔 봤어요.</p>
${ugs.map(g => { const sc = unitScale(g.arr); return `<h3 style="margin:16px 0 6px;font-size:15px"><a href="${url('k', g.w)}">${esc(g.w)}</a> ${sc.label} 싼 순서 <small>${g.arr.length}개 중</small></h3>${unitTable(g.arr.slice(0, 5), sc, null)}`; }).join('')}
<p class="note">용량·개수는 상품 이름에서 읽었어요. 이름만으로 단가를 알 수 없는 딜은 빠져 있어요.</p>` : '';
  // 많이 쌌던 딜 — 같은 때 다른 곳보다 몇 % 쌌나. 5개
  const top = saves.slice().sort((a, b) => b.saving - a.saving).slice(0, 5);
  const topBox = top.length >= 3 ? `<h2>다른 곳보다 많이 쌌던 ${esc(c)} 딜</h2><div class="tbl"><table><thead><tr><th>날짜</th><th>상품</th><th class="r">가격</th><th class="r">다른 곳</th></tr></thead><tbody>
${top.map(d => `<tr><td>${dateShort(d.sentAt)}</td><td><a href="${dealUrl(d)}">${esc(d.title)}</a></td><td class="r">${won(d.price)} <span class="hl">${d.saving}%↓</span></td><td class="r">${won(d.baseline)}</td></tr>`).join('')}
</tbody></table></div><p class="note">「다른 곳」은 딜을 보낸 때 함께 확인한 가격이에요.</p>` : '';
  // 달마다 — 몇 개 떴고 평균 얼마나 쌌나, 그달 제일 많이 싼 딜
  const byMonth = {};
  for (const d of arr) { const t = kst(d.sentAt); const k = `${t.y}-${String(t.mo).padStart(2, '0')}`; (byMonth[k] = byMonth[k] || []).push(d); }
  const months = Object.keys(byMonth).sort().reverse();
  const monthBox = months.length >= 2 ? `<h2>달마다 몇 개나 떴을까?</h2><div class="tbl"><table><thead><tr><th>달</th><th class="r">딜</th><th class="r">평균 할인</th><th>그달 제일 많이 싼 딜</th></tr></thead><tbody>
${months.map(k => { const a = byMonth[k], sv = a.filter(x => x.saving > 0), b = sv.slice().sort((x, y) => y.saving - x.saving)[0];
    return `<tr><td>${+k.slice(5)}월</td><td class="r">${a.length}개</td><td class="r">${sv.length ? Math.round(sv.reduce((t, x) => t + x.saving, 0) / sv.length) + '%' : '–'}</td><td>${b ? `<a href="${dealUrl(b)}">${esc(b.title)}</a> ${b.saving}%↓` : '–'}</td></tr>`; }).join('')}
</tbody></table></div>` : '';
  // 어디서 떴나
  const mc = {};
  for (const d of arr) mc[d.mall] = (mc[d.mall] || 0) + 1;
  const malls = Object.keys(mc).sort((a, b) => mc[b] - mc[a]);
  const mallLine = malls.length >= 2 ? `<p>판매처는 ${malls.slice(0, 4).map(m => `${esc(m)} ${mc[m]}개`).join(', ')}${malls.length > 4 ? ' 순이에요' : '예요'}.</p>` : '';
  const fq = freqOf(appearOf(arr));
  const body = `<h1>${esc(c)} 핫딜 모음</h1>
<p class="lead">핫딜베스트가 다른 곳 가격과 비교해서 고른 <b>${esc(c)}</b> 딜, 지금까지 <b>${arr.length}개</b>예요.${d30 ? ` 최근 한 달 사이에만 ${d30}개가 떴어요.` : ''}</p>
<p class="lead">${avg ? `같은 때 다른 곳보다 평균 <span class="hl">${avg}%</span> 쌌어요. ` : ''}${fq.gap ? `평균 <b>${fq.gap}일</b>에 한 번꼴로 떴고, ` : ''}가격은 뜬 때 기준이라 지금은 다를 수 있어요.</p>
${kws.length ? `<h2>${esc(c)} 중에 자주 뜬 건?</h2><ul class="chips">${kws.map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${kc[w]}</em></a></li>`).join('')}</ul>` : ''}
${mallLine}
${unitBox}
${topBox}
${monthBox}
<h2>최근에 뜬 ${esc(c)} 딜 <small>${arr.length}개</small></h2>${grid(arr)}
${join}`;
  write(`c/${c}/index.html`, page({ ld: { '@context': 'https://schema.org', '@type': 'ItemList', name: `${c} 핫딜 모음`, numberOfItems: arr.length, itemListElement: arr.slice(0, 50).map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: BASE + dealUrl(d), name: d.title })) },
    title: `${c} 딜 모음 - ${SITE}`, desc: `${c} 핫딜 ${arr.length}개. 쿠팡·지마켓 등에서 다른 곳보다 싸게 뜬 ${c} 가격 기록을 날짜별로 모았어요.`,
    canon: url('c', c), body, img: (arr.find(d => d.image) || {}).image, crumbs: [['홈', '/'], ['분류', '/c/'], [c, url('c', c)]] }));
  add(url('c', c), kst(arr[0].sentAt).ymd);
}
write('c/index.html', page({ title: `분류별 딜 모음 - ${SITE}`, desc: '라면·생수·커피·세제·화장지 등 분류별로 핫딜베스트가 고른 딜과 가격 기록을 모았어요.', canon: '/c/',
  crumbs: [['홈', '/'], ['분류', '/c/']],
  body: `<h1>분류별 핫딜 모음</h1><p class="lead">식품·생필품을 분류별로 모았어요. 누르면 그 분류에서 고른 딜을 최근 것부터 볼 수 있어요.</p>
<ul class="chips">${CATL.map(c => `<li><a href="${url('c', c)}">${esc(c)} <em>${byCat[c].length}</em></a></li>`).join('')}</ul>${sbox()}${join}` }));
add('/c/', kst(deals[0].sentAt).ymd);

// 사이트 검색 — 지난 딜 전체를 작은 JSON 으로 내려 받아 브라우저에서 찾는다 (서버 없음). 검색 결과 쪽은 noindex
write('search.json', JSON.stringify(deals.map(d => ({ u: decodeURIComponent(dealUrl(d)), t: d.title, p: d.price, m: d.mall, s: d.sentAt, i: d.image || '', v: d.saving || 0, b: d.baseline || 0, w: d.web ? 1 : 0 }))));
write('search/index.html', page({ title: `핫딜 기록 검색 - ${SITE}`, desc: '핫딜베스트가 고른 지난 핫딜을 상품 이름으로 찾아보세요.', canon: '/search/', noindex: true,
  crumbs: [['홈', '/'], ['검색', '/search/']],
  body: `<h1>지난 핫딜 찾기</h1><p class="lead">상품 이름이나 브랜드로 찾아보세요. 핫딜베스트가 지금까지 고른 딜 ${deals.length}개 안에서 찾아 드려요.</p>${sbox()}
<p class="note" id="sinfo"></p><ul class="grid" id="sres"></ul>
<h2>이런 걸 많이 찾아요</h2><ul class="chips">${KW.slice(0, 24).map(w => `<li><a href="/search/?q=${encodeURIComponent(w)}">${esc(w)}</a></li>`).join('')}</ul>
${join}
<script>
(function () {
  var q = new URLSearchParams(location.search).get('q') || '';
  var input = document.querySelector('.sbox input'); input.value = q; if (!q) { input.focus(); return; }
  document.title = q + ' 핫딜 검색 - ${SITE}';
  var info = document.getElementById('sinfo'), box = document.getElementById('sres');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return Number(n) > 0 ? Number(n).toLocaleString('ko-KR') + '원' : ''; }
  function when(iso) { var m = String(iso).match(/-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d)/); return m ? (+m[1]) + '/' + (+m[2]) + ' ' + m[3] + ':' + m[4] : ''; }
  var norm = function (s) { return String(s).toLowerCase().replace(/\\s+/g, ''); };
  var toks = q.toLowerCase().split(/\\s+/).filter(Boolean).map(norm);
  info.textContent = '찾는 중…';
  fetch('/search.json').then(function (r) { return r.json(); }).then(function (all) {
    var hit = all.filter(function (d) { var t = norm(d.t); return toks.every(function (k) { return t.indexOf(k) >= 0; }); });
    if (window.gtag) gtag('event', 'search', { search_term: q, results: hit.length });
    if (!hit.length) { info.innerHTML = '「' + esc(q) + '」 딜은 아직 없어요. 새로 싸게 뜨면 카톡방으로 먼저 보내드려요.'; return; }
    var low = hit.reduce(function (a, b) { return b.p > 0 && b.p < a.p ? b : a; }, hit[0]);
    info.innerHTML = '「' + esc(q) + '」 딜 ' + hit.length + '개 · 제일 쌌던 가격 <b>' + won(low.p) + '</b> (' + when(low.s) + ', ' + esc(low.m) + ')';
    box.innerHTML = hit.slice(0, 60).map(function (d) {
      return '<li><a class="card" href="' + esc(d.u) + '"><span class="ph">' + (d.i ? '<img src="' + esc(d.i) + '" alt="' + esc(d.t) + '" loading="lazy" referrerpolicy="no-referrer">' : '') + '</span><span class="body">'
        + '<span class="m"><span class="mall">' + esc(d.m) + '</span>' + when(d.s) + (d.w ? ' 확인' : ' 보냄') + '</span><span class="t">' + esc(d.t) + '</span>'
        + '<span class="p">' + won(d.p) + (d.v ? '<span class="save">' + d.v + '%↓</span>' : '') + (d.b ? '<span class="was">' + won(d.b) + '</span>' : '') + '</span></span></a></li>';
    }).join('');
  }).catch(function () { info.textContent = '검색 자료를 불러오지 못했어요. 잠시 뒤 다시 해 주세요.'; });
})();
</script>` }));

// 쇼핑몰별
for (const m of MALLS) {
  write(`mall/${m}/index.html`, page({ title: `${m} 딜 모음 - ${SITE}`, desc: `핫딜베스트가 고른 ${m} 딜 ${byMall[m].length}개를 모았어요.`, canon: url('mall', m),
    crumbs: [['홈', '/'], [m, url('mall', m)]],
    body: `<h1>${esc(m)} 핫딜 모음</h1><p class="lead">핫딜베스트가 고른 ${esc(m)} 딜, 지금까지 <b>${byMall[m].length}개</b>예요. 최근 것부터 보여 드려요.</p>${grid(byMall[m])}${join}` }));
  add(url('mall', m), kst(byMall[m][0].sentAt).ymd);
}

// 전체 딜 (월별)
const months = {};
for (const d of deals) { const t = kst(d.sentAt); const k = `${t.y}-${String(t.mo).padStart(2, '0')}`; (months[k] = months[k] || []).push(d); }
write('deals/index.html', page({ title: `전체 딜 기록 - ${SITE}`, desc: `핫딜베스트가 지금까지 고른 딜 ${deals.length}개를 달별로 모았어요.`, canon: '/deals/', crumbs: [['홈', '/'], ['전체 딜', '/deals/']],
  body: `<h1>전체 핫딜 기록</h1><p class="lead">지금까지 고른 딜, 모두 <b>${deals.length}개</b>예요. 카톡방에는 아침 7시부터 밤 10시까지 보내고, 이 사이트에는 24시간 올려요.</p>` +
    Object.keys(months).sort().reverse().map(k => `<h2>${+k.slice(0, 4)}년 ${+k.slice(5)}월 <small>${months[k].length}개</small></h2>${grid(months[k])}`).join('') + join }));
add('/deals/', kst(deals[0].sentAt).ymd);

// 홈
const pile = deals.filter(d => d.image).slice(0, 7);
const POS = [[8, 30, -9], [118, 6, 6], [228, 34, -4], [40, 104, 7], [158, 92, -7], [262, 110, 9], [96, 150, -3]];
write('index.html', page({ ld: [
  { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, alternateName: '핫딜베스트', url: BASE + '/', inLanguage: 'ko',
    potentialAction: { '@type': 'SearchAction', target: BASE + '/search/?q={search_term_string}', 'query-input': 'required name=search_term_string' } },
  { '@context': 'https://schema.org', '@type': 'Organization', name: '주식회사 와우플러스', url: BASE + '/', logo: BASE + '/logo.png', sameAs: ['https://hotdeal.best/', 'https://www.youtube.com/@hotdealbest_kr', 'https://www.instagram.com/hotdeal.best/', 'https://www.threads.com/@hotdeal.best', 'https://www.tiktok.com/@hotdealbest_kr'] }], title: `${SITE} - 생필품 딜을 다른 곳 가격과 비교해 카톡으로`, desc: '싸게 뜬 생필품·식품 핫딜을 다른 곳 가격과 비교해서 카카오톡 오픈채팅으로 보내 드려요. 지금까지 보낸 딜과 품목별 가격 기록도 볼 수 있어요.', canon: '/',
  body: `<section class="hero"><div>
<span class="badge"><i></i>24시간 업데이트 · 카톡방은 아침 7시 ~ 밤 10시</span>
<h1>생필품 핫딜, <span class="hl">다른 곳 가격과 비교해서</span> 카톡으로 보내드려요</h1>
<p class="lead">쿠팡·지마켓·롯데온·11번가에서 싸게 뜬 식품·생필품을 다른 곳 가격이랑 견줘 보고, 괜찮을 때만 카톡방에 보내요.</p>
${ctaBtn}${assure}
<div class="stats"><div class="stat"><b>${deals.length.toLocaleString('ko-KR')}</b><span>지금까지 고른 딜</span></div><div class="stat"><b>${AVG_SAVE}%</b><span>다른 곳보다 평균</span></div><div class="stat"><b>${Math.round(deals.length / DAYS)}개</b><span>하루 평균</span></div></div>
</div><div class="pile" aria-hidden="true">${pile.map((d, i) => `<img src="${esc(d.image)}" alt="" referrerpolicy="no-referrer" style="left:${POS[i][0]}px;top:${POS[i][1]}px;transform:rotate(${POS[i][2]}deg);z-index:${i % 3 + 1}">`).join('')}</div></section>
${sbox()}
<h2>방금 보낸 딜 <small id="livetag" class="livetag">실시간</small> <small><a href="/deals/">전체 ${deals.length}개 →</a></small></h2><ul class="grid" id="recent">${deals.slice(0, 100).map(card).join('')}</ul>
<section class="why"><h2>핫딜 가격은 오래 가지 않아요</h2>${flow}<p class="note">위 기록은 보낸 때의 가격이에요. 지금 들어가면 이미 끝났을 수 있어서, 싸게 뜬 순간 카톡으로 보내 드려요. <a href="/about/">딜을 고르는 기준 보기 →</a></p></section>
<h2>분류별로 보기 <small><a href="/c/">전체 보기 →</a></small></h2><ul class="chips">${CATL.map(c => `<li><a href="${url('c', c)}">${esc(c)} <em>${byCat[c].length}</em></a></li>`).join('')}</ul>
<h2>품목별 가격 기록 보기 <small><a href="/k/">전체 보기 →</a></small></h2><ul class="chips">${KW.slice(0, 36).map(w => `<li><a href="${url('k', w)}">${esc(w)} <em>${byKw[w].length}</em></a></li>`).join('')}</ul>
<h2>쇼핑몰별로 보기</h2><ul class="chips">${MALLS.map(m => `<li><a href="${url('mall', m)}">${esc(m)} <em>${byMall[m].length}</em></a></li>`).join('')}</ul>
${joinPlain}${liveScript(deals.map(d => String(d.uid)))}` }));
add('/', kst(deals[0].sentAt).ymd);

// 소개 — 누가, 어떤 기준으로 고르는지(네이버 「콘텐츠 작성시 권장 사항」 전문성·투명성, 11/10 사장님 승인). 연락처 줄은 넣지 않음(사장님 결정).
// 숫자는 지금 돌아가는 기준 그대로: 카톡 20%(run.bat --rate-floor 20) · 사이트 전용 10%(webFloor) · 발송 7~22시. 데이터 출처 이름은 쓰지 않는다
write('about/index.html', page({ title: `소개 · 딜을 고르는 기준 - ${SITE}`, desc: '핫딜베스트는 주식회사 와우플러스가 운영해요. 다른 판매처보다 20% 이상 쌀 때만 카톡방으로 보내고, 확인한 시각의 가격을 기록으로 남겨요.', canon: '/about/',
  crumbs: [['홈', '/'], ['소개', '/about/']],
  ld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: `핫딜베스트 소개`, url: BASE + '/about/', publisher: { '@type': 'Organization', name: '주식회사 와우플러스', url: BASE + '/' } },
  body: `<h1>핫딜베스트는 이렇게 골라요</h1>
<section class="about"><h2>누가 운영하나요</h2><p>핫딜베스트는 <b>주식회사 와우플러스</b>가 운영해요. 쇼핑몰에 싸게 뜬 생필품·식품을 찾아서, 정말 싼지 다른 판매처 가격과 비교한 뒤 카카오톡 오픈채팅방으로 보내 드려요. 이 사이트는 그동안 보낸 딜과 가격을 모아 둔 기록이에요.</p></section>
<section class="about"><h2>카톡방에는 이럴 때만 보내요</h2><ol>
<li><b>비교할 수 있어야 해요.</b> 같은 규격의 상품을 다른 판매처에서도 파는지 찾아보고, 비교할 상품이 없으면 보내지 않아요.</li>
<li><b>다른 판매처보다 20% 이상 싸야 해요.</b> 배송비까지 확인할 수 있으면 배송비를 넣고 비교해요.</li>
<li><b>이상한 할인은 걸러요.</b> 구성이 다른 묶음 상품, 옵션 중 제일 싼 것만 내세운 가격, 지나치게 큰 할인율은 빼요.</li>
<li><b>아침 7시부터 밤 10시까지만 보내요.</b> 밤에 뜬 딜은 이 사이트에만 올려요.</li></ol></section>
<section class="about"><h2>사이트에만 올리는 딜도 있어요</h2><p>카톡방 기준(20%)에는 조금 못 미치지만 다른 곳보다 10% 넘게 싼 딜, 그리고 PC 용품·가전·해외 직구 상품은 카톡방 대신 이 사이트에만 올려요. 상세 페이지에 「사이트에만 올린 딜」이라고 표시해 둬요.</p></section>
<section class="about"><h2>무엇을 비교하나요</h2><ul>
<li>같은 규격 상품을 파는 다른 판매처의 가격과 배송비</li>
<li>지난 1년 동안 달마다 가장 낮았던 시세</li>
<li>개당·100g당·L당 같은 단가</li>
<li>같은 상품이 전에 얼마에 떴는지, 얼마나 자주 뜨는지</li></ul></section>
<section class="about"><h2>왜 지난 가격을 남겨 두나요</h2><p>핫딜은 쿠폰이나 재고에 따라 금방 끝나요. 그래서 상세 페이지의 가격은 지금 가격이 아니라 <b>우리가 확인한 그 시각의 가격</b>이에요. 페이지마다 확인한 날짜와 시각을 적어 두었으니, 사기 전에는 판매처에서 지금 가격을 꼭 확인해 주세요.</p><p>그래도 기록을 남기는 건, 같은 상품이 언제 얼마까지 내려갔는지 알면 「지금 사도 될지, 다음을 기다릴지」 판단하는 데 도움이 되기 때문이에요.</p></section>
<section class="about"><h2>하지 않는 것</h2><ul>
<li>「지금 최저가」라고 단정하지 않아요. 우리가 비교한 판매처 안에서, 확인한 그 시각 기준으로만 말해요.</li>
<li>할인율을 확인하지 못한 딜에는 할인율을 붙이지 않아요.</li></ul></section>
<section class="about"><h2>수수료에 대해</h2><p>이 사이트와 카톡방의 구매 링크 중 일부는 제휴 링크예요(쿠팡 파트너스, 링크프라이스 등). 이 링크로 사시면 핫딜베스트가 판매처로부터 일정액의 수수료를 받아요. 쇼핑몰마다 정해진 고지 문구를 구매 버튼 옆에 함께 적어 두고 있어요.</p></section>
${joinPlain}` }));
add('/about/', kst(deals[0].sentAt).ymd);

// 방금 들어온 딜의 상세. 정식 페이지가 만들어지기 전(보통 몇 분)에만 쓴다.
// 정식 페이지와 같은 함수(dealTop·storyBox 와 그 재료)를 그대로 브라우저에 넘겨 같은 모양으로 그린다 — 따로 짜면 둘이 어긋난다.
// 검색엔진에는 안 보인다(noindex) — 같은 딜의 정적 페이지가 곧 생기기 때문이다.
const CLIENT = [
  `var DISCLOSURE = ${JSON.stringify(DISCLOSURE)}, HIST_TERM = ${JSON.stringify(HIST_TERM)}, SRC = ${JSON.stringify(SRC)};`,
  'var sameItems = function () { return []; };',   // 지난 기록은 정식 페이지에서
  ...Object.entries({ esc, won, kst, dateKo, dateTime, dateShort, noteKo, disclosureFor, buyLink, niceStep, lineChart, trendChart, sellerHref, urlHref, sellersTable, compsTable, storyBox, dealTop })
    .map(([k, f]) => `var ${k} = ${f.toString()};`),
].join('\n');
write('new/index.html', page({ title: `새 딜 - ${SITE}`, desc: '방금 고른 핫딜', canon: '/new/', noindex: true,
  body: `<div id="nd"><p class="lead">딜을 불러오고 있어요…</p></div>${join}<script>
(function () {
${CLIENT}
  var id = new URLSearchParams(location.search).get('id') || '';
  var box = document.getElementById('nd');
  if (!/^[0-9]+$/.test(id)) { box.innerHTML = '<p class="lead">딜 번호가 없어요. <a href="/">홈으로</a></p>'; return; }
  function ready() { fetch('/deal/' + id + '/', { method: 'HEAD', cache: 'no-store' }).then(function (r) { if (r.ok) location.replace('/deal/' + id + '/'); }).catch(function () {}); }
  ready(); setInterval(ready, 30000);
  function draw(d) {
    if (!d || !d.uid || d.mall === '토스쇼핑' || /toss\\.(im|shopping)/.test(d.link || '')) { box.innerHTML = '<p class="lead">이 딜은 여기서 보여 드릴 수 없어요. <a href="/">홈으로</a></p>'; return; }
    document.title = d.title + ' ' + won(d.price) + ' 핫딜 - ${SITE}';
    box.innerHTML = dealTop(d) + storyBox(d) + '<p class="note">같은 품목 딜과의 비교, 지난 기록은 몇 분 안에 채워져요. 준비되면 이 화면이 저절로 바뀌어요.</p>';
    var e = box.querySelector('.ago'); if (e) { var m = (Date.now() - Date.parse(e.getAttribute('data-t'))) / 6e4; if (m >= 0) e.textContent = ' · ' + (m < 5 ? '방금 전' : m < 60 ? Math.floor(m) + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : Math.floor(m / 1440) + '일 전'); }
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

write('404.html', page({ title: `페이지가 없어요 - ${SITE}`, desc: '', canon: '/404.html', body: `<h1>페이지를 찾을 수 없어요</h1><p class="lead">주소가 바뀌었거나 없는 페이지예요.</p><p><a class="btn" href="/">홈으로</a></p>${join}` }));
// 다음 웹마스터도구 확인 줄은 robots.txt 안에 넣어야 한다. daum-robots.txt 에 그 줄을 두면 덧붙인다 (지우면 확인이 풀림)
const DAUM = path.join(__dirname, 'daum-robots.txt');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n` + (fs.existsSync(DAUM) ? '\n' + fs.readFileSync(DAUM, 'utf8').trim() + '\n' : ''));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(([u, m]) => `<url><loc>${BASE}${u}</loc><lastmod>${m}</lastmod></url>`).join('\n') + '\n</urlset>\n');
// RSS — 네이버 서치어드바이저에 사이트맵과 함께 낸다. 새 글을 빨리 알아챈다
const rfc = iso => new Date(iso).toUTCString();
// 네이버 가이드 「최신글은 본문 전체를 포함하여 RSS 피드에」 — 방금 쓴 상세 페이지의 <main> 을 기본 태그만 남겨 싣는다
const RSS_KEEP = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'b', 'strong', 'em', 'br', 'a', 'img']);
const rssBody = d => {
  const short = `${esc(d.mall)} ${won(d.price)}${d.baseline ? ' · 다른 곳 ' + won(d.baseline) + ' (' + d.saving + '% 낮음)' : ''}`;
  let h;
  try { h = fs.readFileSync(path.join(OUT, decodeURIComponent(dealUrl(d)).slice(1), 'index.html'), 'utf8'); } catch { return short; }
  const m = h.match(/<main[^>]*>([\s\S]*?)<\/main>/); if (!m) return short;
  const abs = u => /^https?:/.test(u) ? u : BASE + (u.startsWith('/') ? u : '/' + u);
  const body = m[1].replace(/<(script|style|svg|noscript|button|form)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi, (all, sl, tag, at) => {
      tag = tag.toLowerCase(); if (!RSS_KEEP.has(tag)) return tag === 'div' || tag === 'section' ? '\n' : ' ';
      if (sl) return `</${tag}>`;
      if (tag === 'a') { const x = at.match(/href="([^"]+)"/); return x ? `<a href="${abs(x[1])}">` : '<a>'; }
      if (tag === 'img') { const s = at.match(/src="([^"]+)"/), a = at.match(/alt="([^"]*)"/); return s ? `<img src="${abs(s[1])}" alt="${a ? a[1] : ''}">` : ''; }
      return `<${tag}>`;
    }).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return body.length > 200 ? `<![CDATA[${body.replace(/]]>/g, ']]&gt;')}]]>` : short;
};
write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${SITE}</title><link>${BASE}/</link><description>생필품 핫딜을 다른 판매처 가격과 비교해 고른 기록</description><language>ko</language>
<lastBuildDate>${rfc(deals[0].sentAt)}</lastBuildDate>
${deals.slice(0, 50).map(d => `<item><title>${esc(d.title)} ${won(d.price)}</title><link>${BASE}${dealUrl(d)}</link><guid>${BASE}${dealUrl(d)}</guid><pubDate>${rfc(d.sentAt)}</pubDate><description>${rssBody(d)}</description></item>`).join('\n')}
</channel></rss>
`);
write('.nojekyll', '');
// 검색 사이트 소유 확인 파일: verify/ 폴더에 넣어 두면 그대로 루트로 복사한다
const V = path.join(__dirname, 'verify');
if (fs.existsSync(V)) for (const f of fs.readdirSync(V)) fs.copyFileSync(path.join(V, f), path.join(OUT, f));

console.log(`딜 ${deals.length} · 품목 ${KW.length} · 쇼핑몰 ${MALLS.length} · 페이지 ${urls.length} → ${OUT}`);
