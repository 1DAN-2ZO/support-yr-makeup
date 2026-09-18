"""합성 데이터로 화장 영역 분할 모델(F-08) 0차 학습.

기능 정의서 13장 "1주차 실기기 검증 7. 합성 데이터 생성기 100장 → 분할 모델 0차 학습 가능 여부"에
해당하는 실험이다. **모델 품질을 자랑하려는 게 아니라 파이프라인이 도는지 확인하는 것이다.**

    # 1) 얼굴 크롭으로 데이터 생성
    for i in 1 2 3 4 5; do
      python generate.py --photo ../samples/phone-portraits-20/person_${i}_front_open.jpg \
        --n 100 --seed $(( (i-1)*100 )) --crop face --size 256 --out ds/person_$i
    done

    # 2) 학습 (사람 1~4로 배우고, 한 번도 못 본 5번으로 평가)
    python train.py --data ds --val-person 5 --epochs 25

클래스 불균형 대응
    배경이 94.7%, 아이라이너가 0.34%다. 그냥 학습하면 전부 배경이라고 답하고도
    정확도 94.7%가 나온다. 그래서 두 가지를 쓴다.
      - 손실에 클래스 가중치 (빈도의 역제곱근). 드문 클래스의 오답을 더 크게 벌준다
      - 평가 지표를 정확도가 아니라 **클래스별 IoU**로 본다. IoU는 배경에 속지 않는다
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.nn.functional as Fn
    from PIL import Image
    from torch.utils.data import DataLoader, Dataset
except ImportError as e:
    sys.exit(f"필요한 패키지가 없습니다 ({e.name}):  pip install torch pillow numpy")

from core import PART_IDS, PART_LABEL

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

CLASS_NAMES = ["배경", "눈썹", "아이라이너", "섀도우", "입술", "볼터치"]
NCLS = len(CLASS_NAMES)


# ---------------- 데이터 ----------------

class SynthSet(Dataset):
    """generate.py가 만든 폴더를 읽는다. 라벨 PNG의 픽셀값이 곧 클래스 번호다."""

    def __init__(self, dirs: list[Path], flip: bool = False):
        self.items: list[tuple[Path, Path]] = []
        for d in dirs:
            for p in sorted(d.glob("photo_*.png")):
                lab = d / p.name.replace("photo_", "label_")
                if lab.exists():
                    self.items.append((p, lab))
        if not self.items:
            sys.exit(f"학습할 이미지가 없습니다: {[str(d) for d in dirs]}")
        self.flip = flip

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        ph, lb = self.items[i]
        x = np.asarray(Image.open(ph).convert("RGB"), dtype=np.float32) / 255.0
        y = np.asarray(Image.open(lb), dtype=np.int64)
        if self.flip and np.random.rand() < 0.5:      # 좌우 뒤집기. 클래스는 좌우 구분이 없어 안전하다
            x, y = x[:, ::-1].copy(), y[:, ::-1].copy()
        return torch.from_numpy(x).permute(2, 0, 1), torch.from_numpy(y)


# ---------------- 모델 ----------------

def block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
    )


class TinyUNet(nn.Module):
    """경량 U-Net. 온디바이스 배포를 염두에 두고 작게 잡았다 (base=16이면 약 20만 파라미터)."""

    def __init__(self, ncls=NCLS, base=16):
        super().__init__()
        b = base
        self.e1, self.e2, self.e3, self.e4 = block(3, b), block(b, b*2), block(b*2, b*4), block(b*4, b*8)
        self.pool = nn.MaxPool2d(2)
        self.u3 = nn.ConvTranspose2d(b*8, b*4, 2, stride=2)
        self.d3 = block(b*8, b*4)
        self.u2 = nn.ConvTranspose2d(b*4, b*2, 2, stride=2)
        self.d2 = block(b*4, b*2)
        self.u1 = nn.ConvTranspose2d(b*2, b, 2, stride=2)
        self.d1 = block(b*2, b)
        self.out = nn.Conv2d(b, ncls, 1)

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(self.pool(e1))
        e3 = self.e3(self.pool(e2))
        e4 = self.e4(self.pool(e3))
        d3 = self.d3(torch.cat([self.u3(e4), e3], 1))
        d2 = self.d2(torch.cat([self.u2(d3), e2], 1))
        d1 = self.d1(torch.cat([self.u1(d2), e1], 1))
        return self.out(d1)


# ---------------- 지표 ----------------

def confusion(pred, true, n=NCLS):
    k = (true * n + pred).reshape(-1)
    return torch.bincount(k, minlength=n*n).reshape(n, n)


def iou_from_confusion(cm):
    """클래스별 IoU. 배경이 아무리 많아도 드문 클래스의 점수를 가려 주지 않는다."""
    inter = cm.diag().float()
    union = cm.sum(0).float() + cm.sum(1).float() - inter
    return torch.where(union > 0, inter / union, torch.full_like(union, float("nan")))


# ---------------- 학습 ----------------

def main() -> int:
    ap = argparse.ArgumentParser(description="합성 데이터로 분할 모델 0차 학습")
    ap.add_argument("--data", type=Path, required=True, help="person_* 폴더들이 든 상위 폴더")
    ap.add_argument("--val-person", type=int, default=5, help="검증에 쓸 사람 번호 (학습에서 제외)")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--base", type=int, default=16, help="U-Net 채널 폭")
    ap.add_argument("--out", type=Path, default=Path("train_out"))
    ap.add_argument("--no-weight", action="store_true", help="클래스 가중치 없이 (비교용)")
    args = ap.parse_args()

    torch.manual_seed(0)
    np.random.seed(0)

    dirs = sorted(d for d in args.data.glob("person_*") if d.is_dir())
    val_dirs = [d for d in dirs if d.name == f"person_{args.val_person}"]
    trn_dirs = [d for d in dirs if d not in val_dirs]
    if not val_dirs:
        sys.exit(f"검증용 폴더가 없습니다: person_{args.val_person}")

    trn = SynthSet(trn_dirs, flip=True)
    val = SynthSet(val_dirs, flip=False)
    print(f"학습 {len(trn)}장 ({', '.join(d.name for d in trn_dirs)})")
    print(f"검증 {len(val)}장 ({val_dirs[0].name}) — 학습에서 한 번도 안 본 얼굴\n")

    trn_ld = DataLoader(trn, batch_size=args.batch, shuffle=True, num_workers=0)
    val_ld = DataLoader(val, batch_size=args.batch, shuffle=False, num_workers=0)

    # 클래스 빈도 → 가중치 (빈도의 역제곱근). 역수는 너무 세서 학습이 흔들린다
    cnt = torch.zeros(NCLS, dtype=torch.double)
    for _, y in trn_ld:
        cnt += torch.bincount(y.reshape(-1), minlength=NCLS).double()
    freq = cnt / cnt.sum()
    w = torch.ones(NCLS) if args.no_weight else (1.0 / freq.sqrt()).float()
    w = w / w.mean()
    print("클래스 빈도와 손실 가중치")
    for i, n in enumerate(CLASS_NAMES):
        print(f"  {n:<10} {freq[i]*100:6.2f}%   가중치 {w[i]:5.2f}")
    print()

    model = TinyUNet(base=args.base)
    nparam = sum(p.numel() for p in model.parameters())
    print(f"모델 TinyUNet(base={args.base}) 파라미터 {nparam:,}개\n")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    lossf = nn.CrossEntropyLoss(weight=w)

    args.out.mkdir(parents=True, exist_ok=True)
    history, best = [], -1.0
    t0 = time.time()

    for ep in range(1, args.epochs + 1):
        model.train()
        tl, nb = 0.0, 0
        for x, y in trn_ld:
            opt.zero_grad()
            loss = lossf(model(x), y)
            loss.backward()
            opt.step()
            tl += loss.item(); nb += 1
        sched.step()

        model.eval()
        cm = torch.zeros(NCLS, NCLS, dtype=torch.long)
        with torch.no_grad():
            for x, y in val_ld:
                cm += confusion(model(x).argmax(1), y)
        iou = iou_from_confusion(cm)
        mk = iou[1:]                       # 화장 부위만 (배경 제외)
        miou = float(np.nanmean(mk.numpy()))
        history.append({"epoch": ep, "loss": tl/nb, "iou": [float(v) for v in iou], "makeup_miou": miou})

        mark = ""
        if miou > best:
            best = miou
            torch.save({"model": model.state_dict(), "base": args.base,
                        "classes": CLASS_NAMES, "labels": PART_LABEL}, args.out/"best.pt")
            mark = "  ← 최고"
        print(f"[{ep:2d}/{args.epochs}] loss {tl/nb:.4f}  화장 mIoU {miou:.3f}  "
              f"({'  '.join(f'{CLASS_NAMES[i+1]} {mk[i]:.2f}' for i in range(len(mk)))}){mark}")

    dt = time.time() - t0
    print(f"\n학습 시간 {dt/60:.1f}분 · 최고 화장 mIoU {best:.3f}")

    json.dump({"history": history, "best_makeup_miou": best, "classes": CLASS_NAMES,
               "train": [d.name for d in trn_dirs], "val": val_dirs[0].name,
               "params": nparam, "weighted": not args.no_weight, "minutes": dt/60},
              open(args.out/"history.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 검증 세트 예측 저장 (눈으로 확인용)
    model.load_state_dict(torch.load(args.out/"best.pt")["model"])
    model.eval()
    with torch.no_grad():
        for i in range(min(8, len(val))):
            x, y = val[i]
            p = model(x[None]).argmax(1)[0].numpy().astype(np.uint8)
            Image.fromarray(p).save(args.out/f"pred_{i:02d}.png")
            Image.fromarray(y.numpy().astype(np.uint8)).save(args.out/f"true_{i:02d}.png")
            Image.fromarray((x.permute(1,2,0).numpy()*255).astype(np.uint8)).save(args.out/f"in_{i:02d}.png")
    print(f"결과 저장 → {args.out}/  (best.pt, history.json, 예측 8장)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
