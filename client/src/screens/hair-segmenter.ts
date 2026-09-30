/**
 * 머리카락 분할 (MediaPipe Image Segmenter) — 사진 한 장 → 머리카락 확률 마스크(0~1).
 * 화면 5 채점이 앞머리·옆머리 칸을 빼는 데 쓴다 (core/sampling HairMask). AR 피부 보정(④ #173)도 같은 걸 쓰면 된다.
 * 근거: docs/research/hair-skin-2026-09-29/보고서.md
 *
 * 모델 (둘 다 Apache 2.0):
 *  1. hair_segmenter — 머리카락/배경 2부류, 입력 512, Pixel 6 GPU 52ms. 머리카락 = 1번 마스크
 *  2. selfie_multiclass_256x256 — 1번이 머리카락. 1 을 못 불러올 때만 (4채널 입력 오류 보고가 있어서).
 *     iOS Safari GPU 에서 부류 순서가 뒤섞이는 버그(mediapipe #6142)가 있어 CPU 로만 돌린다
 * 로컬 사본(client/public/models/, 저장소에 안 넣음)이 있으면 그것, 없으면 공식 CDN — landmarker.ts 와 같다.
 *
 * 실패해도 멈추지 않는다: 마스크 없이(null) 채점한다 — 전과 같은 결과.
 */

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { RgbaImage } from "../core/color";
import type { HairMask } from "../core/sampling";

const WASM_BASE = import.meta.env.DEV ? "/node_modules/@mediapipe/tasks-vision/wasm" : `${import.meta.env.BASE_URL}mediapipe/wasm`;

interface ModelChoice {
  local: string;
  cdn: string;
  hairIndex: number;
  delegates: readonly ("GPU" | "CPU")[];
}

const MODELS: readonly ModelChoice[] = [
  {
    local: "/models/hair_segmenter.tflite",
    cdn: "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite",
    hairIndex: 1,
    delegates: ["GPU", "CPU"],
  },
  {
    local: "/models/selfie_multiclass_256x256.tflite",
    cdn: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    hairIndex: 1,
    delegates: ["CPU"],
  },
];

/** 사진 한 장 → 마스크. 못 만들면 null */
export interface HairSegmenter {
  segment(im: RgbaImage): HairMask | null;
}

/** MediaPipe 확률 마스크 목록에서 머리카락 칸을 꺼내 복사한다 (마스크는 결과를 닫으면 사라진다) */
export function maskFromConfidence(
  masks: readonly { width: number; height: number; getAsFloat32Array(): Float32Array }[] | undefined,
  hairIndex: number,
): HairMask | null {
  const m = masks?.[hairIndex];
  if (!m) return null;
  return { w: m.width, h: m.height, data: Float32Array.from(m.getAsFloat32Array()) };
}

async function pathOf(c: ModelChoice): Promise<string> {
  return fetch(c.local, { method: "HEAD" })
    .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? c.local : c.cdn))
    .catch(() => c.cdn);
}

/** 브라우저에서 실제 모델을 불러온다. 후보를 차례로 — 다 안 되면 던진다 */
export async function loadHairSegmenter(): Promise<HairSegmenter> {
  const files = await FilesetResolver.forVisionTasks(WASM_BASE);
  let last: unknown = null;
  for (const c of MODELS) {
    const modelAssetPath = await pathOf(c);
    for (const delegate of c.delegates) {
      try {
        const seg = await ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        return {
          segment(im) {
            const r = seg.segment(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h));
            try {
              return maskFromConfidence(r.confidenceMasks, c.hairIndex);
            } finally {
              r.close();
            }
          },
        };
      } catch (e) {
        last = e;
      }
    }
  }
  throw last instanceof Error ? last : new Error("hair_segmenter");
}

export type HairMasker = (im: RgbaImage) => Promise<HairMask | null>;

/**
 * 모델은 처음 부를 때 한 번만 불러온다(몇 부위를 채점해도). 불러오기가 실패하면 다시 시도하지 않고 계속 null.
 * onError 는 불러오기 실패·한 장 분할 실패 때 — 불러오기 실패는 한 번만 알린다
 */
export function createHairMasker(load: () => Promise<HairSegmenter> = loadHairSegmenter, onError?: (e: unknown) => void): HairMasker {
  let seg: Promise<HairSegmenter | null> | null = null;
  return async (im) => {
    seg ??= load().catch((e: unknown) => {
      onError?.(e);
      return null;
    });
    const s = await seg;
    if (!s) return null;
    try {
      return s.segment(im);
    } catch (e) {
      onError?.(e);
      return null;
    }
  };
}

/**
 * 그림(캔버스·ImageBitmap) 한 장 → 머리카락 마스크. 화면 3 완성본이 쓴다 (#173 셰이더).
 * 처음엔 모델을 내려받아서, timeoutMs 안에 안 오면 null — 마스크 없이 그린다 (화면 5 와 같은 원칙)
 */
export async function maskOfImage(masker: HairMasker, img: CanvasImageSource, w: number, h: number, timeoutMs = 3000): Promise<HairMask | null> {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const late = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([masker({ data: px.data, w, h }).catch(() => null), late]);
}
