/**
 * [dev 전용] 제품 입력 화면 (product-admin.html).
 *
 * 색조 제품 목록을 긁어 올 길이 없어서 사람이 보고 적는다 — 네이버 검색 API 는
 * 2026-09 약관 개정으로 결과 저장·DB화를 금지했고, 올리브영은 봇을 막고, 화해는
 * robots.txt 로 제품 페이지를 막았다. 식약처 공공데이터에는 색조 제품이 없다.
 *
 * 적은 것은 브라우저에 바로 저장하고(새로고침해도 안 날아간다), JSON 으로 내려받아
 * 서버 DB 에 심는다. 이 화면이 서버에 바로 쓰지 않는 이유는, 공개 주소에 인증 없는
 * 쓰기 창구를 두면 아무나 제품 목록을 바꿀 수 있기 때문이다.
 *
 * 계열 이름은 손으로 적지 않고 고르게 한다 — 손으로 적으면 "브릭" 과 "브릭색" 처럼
 * 어긋나서 화면에서 제품이 안 걸린다.
 */

// 앱 CSS 는 안 쓴다 — 이 화면은 제 스타일만 쓴다 (앱 배경색이 덮어쓴다)
import { familiesOf } from "@core/color-name";
import type { PalettePart } from "@core/color-family";
import type { ProductPick } from "@core/product-picks";

const PARTS: { id: PalettePart; name: string }[] = [
  { id: "brow", name: "눈썹" },
  { id: "shadow", name: "아이섀도우" },
  { id: "liner", name: "아이라인" },
  { id: "cheek", name: "블러셔" },
  { id: "lip", name: "립" },
];

/** 한 계열에 이만큼은 있어야 추천이 궁하지 않다 */
const WANT_PER_FAMILY = 2;
const KEY = "dhe.product-admin.v1";

interface Row extends ProductPick {
  part: PalettePart;
  id: string;
}

function load(): Row[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch {
    return [];
  }
}
function save(rows: Row[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* 저장이 막혀도 화면은 돈다 */
  }
}

let rows = load();
let part: PalettePart = "brow";
let picked = new Set<string>();
/** 지금 고른 사진 (작게 줄인 data URL) */
let photo: string | null = null;

/** 사진은 작게 줄여 둔다 — 브라우저 저장 공간이 5MB 쯤이라 원본을 넣으면 몇 장 못 담는다 */
const PHOTO_SIDE = 240;
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    const s = Math.min(1, PHOTO_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    if (!g) throw new Error("캔버스 없음");
    g.drawImage(bmp, 0, 0, w, h);
    return cv.toDataURL("image/jpeg", 0.75);
  } finally {
    bmp.close();
  }
}

const app = document.getElementById("app")!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function partName(p: PalettePart): string {
  return PARTS.find((x) => x.id === p)?.name ?? p;
}

/** 계열마다 몇 개 채웠는지 — 어디가 비었는지 바로 보이게 */
function coverage(p: PalettePart): { fam: string; n: number }[] {
  return familiesOf(p).map((fam) => ({
    fam,
    n: rows.filter((r) => r.part === p && r.families.includes(fam)).length,
  }));
}

function render(): void {
  const fams = familiesOf(part);
  const cov = coverage(part);
  const filled = cov.filter((c) => c.n >= WANT_PER_FAMILY).length;
  const mine = rows.filter((r) => r.part === part);

  app.innerHTML = `
    <h1>제품 입력</h1>
    <p class="sub">부위와 색 계열을 고르고 제품을 적어요. 적은 것은 이 브라우저에 바로 저장돼요 — 새로고침해도 안 날아가요.</p>

    <div class="card">
      <div class="grid">
        <div>
          <label for="f-part">부위</label>
          <select id="f-part">${PARTS.map((p) => `<option value="${p.id}"${p.id === part ? " selected" : ""}>${p.name}</option>`).join("")}</select>
        </div>
        <div>
          <label for="f-brand">브랜드</label>
          <input id="f-brand" placeholder="예) 클리오" />
        </div>
        <div>
          <label for="f-name">제품명</label>
          <input id="f-name" placeholder="예) 킬 브로우 오토 하드 브로우 펜슬" />
        </div>
        <div>
          <label for="f-shade">호수 (색상 이름)</label>
          <input id="f-shade" placeholder="예) 3호 라이트브라운 — 모르면 비워요" />
        </div>
        <div style="grid-column: 1 / -1">
          <label for="f-kind">제형·도구 한 줄</label>
          <input id="f-kind" placeholder="예) 펜슬 — 가늘어서 한 올씩 그리기 좋아요" />
        </div>
        <div style="grid-column: 1 / -1">
          <label>제품 사진 <span class="count">(파일을 고르거나 사진 주소를 붙여넣어요)</span></label>
          <div class="photo-pick">
            ${photo ? `<img src="${esc(photo)}" alt="고른 제품 사진" onerror="this.style.opacity=.3" />` : '<span class="photo-empty">없음</span>'}
            <div style="flex:1; min-width:0">
              <div class="row" style="margin:0 0 8px">
                <button id="pick-photo">파일 고르기</button>
                ${photo ? '<button class="danger" id="drop-photo">빼기</button>' : ""}
                <input type="file" id="photo-file" accept="image/*" style="display:none" />
              </div>
              <input id="f-photo-url" placeholder="또는 사진 주소 붙여넣기 (https://...)" />
            </div>
          </div>
          <p class="hint">주소로 넣으면 그 사진이 지워지거나 막히면 화면에서 안 보일 수 있어요. 파일로 넣으면 우리가 들고 있어서 안 깨져요.</p>
        </div>
      </div>

      <div style="margin-top:14px">
        <label>색 계열 <span class="count">(여러 개 고를 수 있어요 — 이 제품이 어울리는 계열 전부)</span></label>
        <div class="fams" id="f-fams">
          ${fams.map((f) => `<label class="${picked.has(f) ? "on" : ""}"><input type="checkbox" value="${esc(f)}"${picked.has(f) ? " checked" : ""} />${esc(f)}</label>`).join("")}
        </div>
      </div>

      <div class="row">
        <button class="primary" id="add">추가</button>
        <button id="clear-form">비우기</button>
      </div>
      <div id="warn"></div>
    </div>

    <div class="card">
      <strong>${partName(part)} — 계열 채움 정도</strong>
      <p class="hint">계열마다 ${WANT_PER_FAMILY}개씩 있으면 추천이 궁하지 않아요. <b>${filled} / ${cov.length}</b> 계열 채움</p>
      <div class="bar"><i style="width:${cov.length ? Math.round((filled / cov.length) * 100) : 0}%"></i></div>
      <table>
        <tr><th>계열</th><th>채운 수</th></tr>
        ${cov.map((c) => `<tr><td class="fam">${esc(c.fam)}</td><td>${c.n === 0 ? "— 비었어요" : `${c.n}개`}</td></tr>`).join("")}
      </table>
    </div>

    <div class="card">
      <strong>${partName(part)} 에 적은 제품 <span class="count">${mine.length}개</span></strong>
      ${mine.length === 0 ? '<p class="hint">아직 없어요.</p>' : `
      <table>
        <tr><th>사진</th><th>브랜드</th><th>제품</th><th>호수</th><th>계열</th><th>제형</th><th></th></tr>
        ${mine.map((r) => `
          <tr>
            <td>${r.photo ? `<img class="thumb" src="${r.photo}" alt="" />` : '<span class="count">—</span>'}</td>
            <td>${esc(r.brand)}</td>
            <td>${esc(r.name)}</td>
            <td>${r.shade ? esc(r.shade) : '<span class="count">모름</span>'}</td>
            <td class="fam">${r.families.map(esc).join(" · ")}</td>
            <td class="count">${esc(r.kind)}</td>
            <td><button class="danger" data-del="${r.id}">지우기</button></td>
          </tr>`).join("")}
      </table>`}
    </div>

    <div class="card">
      <strong>전체 ${rows.length}개</strong>
      <p class="hint">다 적었으면 내려받아서 주세요. 그대로 서버 DB 에 심어요.</p>
      <div class="row">
        <button class="primary" id="dl">JSON 내려받기</button>
        <button id="up">불러오기</button>
        <input type="file" id="file" accept="application/json" style="display:none" />
      </div>
    </div>
  `;

  (document.getElementById("f-part") as HTMLSelectElement).onchange = (e) => {
    part = (e.target as HTMLSelectElement).value as PalettePart;
    picked = new Set();
    render();
  };
  document.getElementById("f-fams")!.onclick = (e) => {
    const box = (e.target as HTMLElement).closest("label")?.querySelector("input");
    if (!box) return;
    // 체크 상태가 바뀐 뒤에 읽는다
    queueMicrotask(() => {
      picked = new Set([...document.querySelectorAll<HTMLInputElement>("#f-fams input:checked")].map((i) => i.value));
      for (const l of document.querySelectorAll("#f-fams label")) {
        l.classList.toggle("on", !!l.querySelector<HTMLInputElement>("input")?.checked);
      }
    });
  };
  document.getElementById("add")!.onclick = add;
  document.getElementById("clear-form")!.onclick = () => { picked = new Set(); photo = null; render(); };
  document.getElementById("pick-photo")!.onclick = () => document.getElementById("photo-file")!.click();
  const urlBox = document.getElementById("f-photo-url") as HTMLInputElement | null;
  if (urlBox) {
    urlBox.onchange = () => {
      const u = urlBox.value.trim();
      if (!u) return;
      const keep = { brand: val("f-brand"), name: val("f-name"), shade: val("f-shade"), kind: val("f-kind") };
      photo = u;
      render();
      (document.getElementById("f-brand") as HTMLInputElement).value = keep.brand;
      (document.getElementById("f-name") as HTMLInputElement).value = keep.name;
      (document.getElementById("f-shade") as HTMLInputElement).value = keep.shade;
      (document.getElementById("f-kind") as HTMLInputElement).value = keep.kind;
    };
  }
  document.getElementById("drop-photo")?.addEventListener("click", () => { photo = null; render(); });
  (document.getElementById("photo-file") as HTMLInputElement).onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    // 적던 내용이 날아가지 않게 들고 있다가 다시 넣는다
    const keep = { brand: val("f-brand"), name: val("f-name"), shade: val("f-shade"), kind: val("f-kind") };
    void shrink(f).then((d) => {
      photo = d;
      render();
      (document.getElementById("f-brand") as HTMLInputElement).value = keep.brand;
      (document.getElementById("f-name") as HTMLInputElement).value = keep.name;
      (document.getElementById("f-shade") as HTMLInputElement).value = keep.shade;
      (document.getElementById("f-kind") as HTMLInputElement).value = keep.kind;
    }).catch(() => {
      document.getElementById("warn")!.innerHTML = `<div class="warn">사진을 읽지 못했어요.</div>`;
    });
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-del]")) {
    b.onclick = () => { rows = rows.filter((r) => r.id !== b.dataset.del); save(rows); render(); };
  }
  document.getElementById("dl")!.onclick = download;
  document.getElementById("up")!.onclick = () => document.getElementById("file")!.click();
  (document.getElementById("file") as HTMLInputElement).onchange = upload;
}

function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value.trim();
}

function add(): void {
  const brand = val("f-brand"), name = val("f-name"), kind = val("f-kind"), shade = val("f-shade");
  // 파일로 고른 것이 없으면 주소 칸을 본다
  const urlPhoto = val("f-photo-url");
  const usePhoto = photo ?? (urlPhoto || null);
  const families = [...picked];
  const miss: string[] = [];
  if (!brand) miss.push("브랜드");
  if (!name) miss.push("제품명");
  if (!families.length) miss.push("색 계열");
  if (!kind) miss.push("제형 한 줄");
  const warn = document.getElementById("warn")!;
  if (miss.length) {
    warn.innerHTML = `<div class="warn">${miss.join(" · ")} 를 채워 주세요.</div>`;
    return;
  }
  // 같은 제품을 두 번 적는 것을 막는다
  if (rows.some((r) => r.part === part && r.brand === brand && r.name === name && (r.shade ?? "") === shade)) {
    warn.innerHTML = `<div class="warn">이미 적은 제품이에요.</div>`;
    return;
  }
  rows.push({ id: crypto.randomUUID(), part, brand, name, kind, families, ...(shade ? { shade } : {}), ...(usePhoto ? { photo: usePhoto } : {}) });
  save(rows);
  picked = new Set();
  photo = null;
  render();
}

function download(): void {
  const by: Record<string, ProductPick[]> = {};
  for (const p of PARTS) {
    by[p.id] = rows.filter((r) => r.part === p.id).map(({ families, brand, name, kind, shade, photo: ph }) => ({
      families, brand, name, kind, ...(shade ? { shade } : {}), ...(ph ? { photo: ph } : {}),
    }));
  }
  const blob = new Blob([JSON.stringify({ version: "products-v1", picks: by }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "products.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function upload(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  void f.text().then((t) => {
    try {
      const d = JSON.parse(t) as { picks?: Record<string, ProductPick[]> };
      if (!d.picks) throw new Error("모양이 달라요");
      const next: Row[] = [];
      for (const [p, list] of Object.entries(d.picks)) {
        for (const x of list) next.push({ ...x, part: p as PalettePart, id: crypto.randomUUID() });
      }
      rows = next;
      save(rows);
      render();
    } catch {
      document.getElementById("warn")!.innerHTML = `<div class="warn">읽지 못했어요. 이 화면에서 내려받은 JSON 인지 확인해 주세요.</div>`;
    }
  });
}

render();
