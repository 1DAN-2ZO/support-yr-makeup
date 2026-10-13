/**
 * [dev 전용] 템플릿 준비물 만들기 (template-build.html, #420).
 *
 * 화장 템플릿 사진(PNG 10장)마다 사용자 참고 사진 길과 똑같이 돌려 결과만 파일로 남긴다:
 *   analyzeRefPhoto  얼굴 찾기 · 색 팔레트 (화면 3 이 쓰는 값)
 *   shrinkForUpload  서버가 쓸 템플릿 사진 — 사용자 사진을 올릴 때와 같은 규격. 앱은 이 사진을 보내지 않고 번호만 보낸다
 * 이름 · 썸네일은 만들지 않는다 — 고르는 화면(core/templates.ts, #433)이 갖고 있다. 번호는 그쪽과 같은 01~10.
 * 저장은 dev 서버의 /__templates/<파일> (vite.config.ts):
 *   server/<NN>.<확장자>   → server/app/templates/NN.<확장자>   (서버가 번호로 꺼내는 사진)
 *   prep/templates.json    → client/public/templates/prep/       (앱이 읽는 색 팔레트)
 * 원본 PNG 는 저장하지 않는다. 사진마다 어느 부위 색이 읽혔는지 보이니 눈으로 검수한 뒤 저장한다.
 */

import type { TemplateEntry, TemplateManifest } from "@core/template-prep";
import { shrinkForUpload } from "./answer-make";
import { analyzeRefPhoto, REF_FAIL_TEXT } from "./ref-analyze";
import type { RefFailure } from "./ref-analyze";

interface Built {
  entry: TemplateEntry;
  ref: Blob;
  w: number;
  h: number;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const logEl = $("log");
const log = (s: string): void => { logEl.textContent += `${s}\n`; };

const extOf = (b: Blob): string => (b.type === "image/webp" ? "webp" : "jpg");

async function build(file: File, num: string): Promise<Built | string> {
  const res = await analyzeRefPhoto(file);
  if (typeof res === "string") return REF_FAIL_TEXT[res as RefFailure];
  const ref = await shrinkForUpload(file);
  const bmp = await createImageBitmap(ref);
  const w = bmp.width, h = bmp.height;
  bmp.close();
  const id = num;
  return {
    entry: { id, colors: res.colors },
    ref,
    w,
    h,
  };
}

function rowFor(b: Built | string, file: File): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  if (typeof b === "string") {
    row.innerHTML = `<div><h3>${file.name}</h3><div class="bad">${b}</div></div>`;
    return row;
  }
  const { entry } = b;
  const parts = Object.entries(entry.colors)
    .map(([part, c]) => `<span class="sw"><i style="background:${c.hex}"></i>${part} ${c.name.text} · ${c.n}px</span>`)
    .join("");
  const missing = 5 - Object.keys(entry.colors).length;
  row.innerHTML = `
    <img src="${URL.createObjectURL(b.ref)}" alt="${entry.id}" />
    <div>
      <h3>${entry.id}</h3>
      <div class="meta">${file.name} · 서버용 사진 ${b.w}×${b.h} ${(b.ref.size / 1024).toFixed(0)}KB</div>
      <div>${parts}</div>
      ${missing > 0 ? `<div class="bad">색을 못 읽은 부위 ${missing}개 — 저장 전에 사진을 확인하세요</div>` : `<div class="ok">다섯 부위 색을 모두 읽었어요</div>`}
    </div>`;
  return row;
}

let built: Built[] = [];

$<HTMLInputElement>("files").addEventListener("change", async (e) => {
  const files = [...((e.target as HTMLInputElement).files ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const list = $("list");
  list.replaceChildren();
  built = [];
  $<HTMLButtonElement>("save").disabled = true;
  for (const f of files) {
    const num = /^(\d{2})[_-]/.exec(f.name)?.[1];
    if (!num) { list.append(rowFor("파일 이름이 두 자리 번호로 시작하지 않아요 (예: 01_…)", f)); continue; }
    log(`${f.name} …`);
    try {
      const b = await build(f, num);
      list.append(rowFor(b, f));
      if (typeof b !== "string") built.push(b);
    } catch (err) {
      list.append(rowFor(`처리 실패: ${(err as Error).message}`, f));
    }
  }
  $<HTMLButtonElement>("save").disabled = built.length === 0;
  log(`${built.length}/${files.length} 장 준비됨`);
});

async function put(name: string, body: Blob | string): Promise<void> {
  const r = await fetch(`/__templates/${name}`, { method: "POST", body });
  if (!r.ok) throw new Error(`${name} 저장 실패 (${r.status})`);
}

$<HTMLButtonElement>("save").addEventListener("click", async () => {
  const version = $<HTMLInputElement>("version").value.trim();
  if (!version) { log("버전을 적어 주세요"); return; }
  $<HTMLButtonElement>("save").disabled = true;
  try {
    const manifest: TemplateManifest = { version, items: built.map((b) => b.entry).sort((a, b) => a.id.localeCompare(b.id)) };
    for (const b of built) {
      await put(`server/${b.entry.id}.${extOf(b.ref)}`, b.ref);
    }
    await put("prep/templates.json", JSON.stringify(manifest, null, 2) + "\n");
    log(`저장 완료 — ${built.length}종 · ${version} → server/app/templates/ (사진) · client/public/templates/prep/ (색)`);
  } catch (err) {
    log(`저장 중 멈춤: ${(err as Error).message}`);
  } finally {
    $<HTMLButtonElement>("save").disabled = false;
  }
});
