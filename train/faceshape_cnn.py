"""얼굴형 5종 분류 CNN 파인튜닝 — S-2 후보 C (#65).

ImageNet으로 미리 학습된 모델을 가져와 마지막 층만 5종(heart·oblong·oval·round·square)으로 바꾸고
공개 얼굴형 데이터로 다시 학습한다. 규칙 기준선(22.3%)·얼굴 점 기준(46~51%)과 같은 test 998장으로 잰다.

  uv run python train/faceshape_cnn.py --data <데이터 폴더> --model mobilenetv3_large_100 --epochs 8

데이터 폴더 구조: <data>/{heart,oblong,oval,round,square}/*.jpg (학습), <data>/test/{Heart,...}/*.jpg (시험)
학습 폴더에서 10%를 떼어 검증용으로 쓰고, test 는 마지막에 한 번만 잰다.
학습 폴더와 test 에 같은 사진이 있으면 정확도가 부풀려지므로, 시작 전에 겹침을 확인해 학습에서 뺀다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
import timm
import torch
from PIL import Image, ImageFile
from torch import nn
from torch.utils.data import DataLoader, Dataset

CLASSES = ["heart", "oblong", "oval", "round", "square"]
ImageFile.LOAD_TRUNCATED_IMAGES = True  # 데이터셋에 끝이 잘린 JPEG 가 섞여 있다 — 읽을 수 있는 만큼 읽는다


def dhash(path: Path, size: int = 8) -> str:
    """사진이 조금 달라도(재압축·크기 변경) 같은 값이 나오는 지문. 학습·시험 겹침 확인용."""
    im = Image.open(path).convert("L").resize((size + 1, size), Image.BILINEAR)
    a = np.asarray(im, dtype=np.int16)
    return hashlib.md5((a[:, 1:] > a[:, :-1]).tobytes()).hexdigest()


def list_images(data: Path):
    train = [
        (p, CLASSES.index(c))
        for c in CLASSES
        for p in sorted((data / c).glob("*"))
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    ]
    test = [
        (p, CLASSES.index(d.name.lower()))
        for d in sorted((data / "test").iterdir())
        if d.is_dir()
        for p in sorted(d.glob("*"))
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    ]
    return train, test


class Faces(Dataset):
    def __init__(self, items, tf):
        self.items, self.tf = items, tf

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        p, y = self.items[i]
        return self.tf(Image.open(p).convert("RGB")), y


def evaluate(model, loader, device):
    model.eval()
    ys, ps = [], []
    with torch.no_grad():
        for x, y in loader:
            ps.append(model(x.to(device)).argmax(1).cpu())
            ys.append(y)
    y, p = torch.cat(ys).numpy(), torch.cat(ps).numpy()
    cm = np.zeros((5, 5), int)
    for a, b in zip(y, p, strict=True):
        cm[a, b] += 1
    return float((y == p).mean()), cm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--model", default="mobilenetv3_large_100")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--bs", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="eval/results")
    ap.add_argument(
        "--save", default=None, help="가장 좋은 모델 가중치를 저장할 경로(.pt). 앱 연결·추가 평가에 필요"
    )
    args = ap.parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")

    data = Path(args.data)
    train_all, test = list_images(data)
    test_hashes = {dhash(p) for p, _ in test}
    before = len(train_all)
    train_all = [(p, y) for p, y in train_all if dhash(p) not in test_hashes]
    print(
        f"학습 후보 {before}장 중 test 와 겹치는 {before - len(train_all)}장 "
        f"제외 → {len(train_all)}장, test {len(test)}장"
    )

    random.shuffle(train_all)
    n_val = len(train_all) // 10
    val, train = train_all[:n_val], train_all[n_val:]

    model = timm.create_model(args.model, pretrained=True, num_classes=5).to(device)
    cfg = timm.data.resolve_data_config({}, model=model)
    tf_train = timm.data.create_transform(**cfg, is_training=True, hflip=0.5, color_jitter=0.2)
    tf_eval = timm.data.create_transform(**cfg)

    def dl(items, tf, sh):
        return DataLoader(Faces(items, tf), batch_size=args.bs, shuffle=sh, num_workers=0)

    tr, va, te = dl(train, tf_train, True), dl(val, tf_eval, False), dl(test, tf_eval, False)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.05)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs * len(tr))
    lossf = nn.CrossEntropyLoss(label_smoothing=0.1)
    best, best_state, t0 = -1.0, None, time.time()
    for ep in range(args.epochs):
        model.train()
        tl = 0.0
        for x, y in tr:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = lossf(model(x), y)
            loss.backward()
            opt.step()
            sched.step()
            tl += loss.item()
        va_acc, _ = evaluate(model, va, device)
        print(
            f"epoch {ep + 1}/{args.epochs}  loss {tl / len(tr):.3f}  val {va_acc:.3f} "
            f" ({time.time() - t0:.0f}s)",
            flush=True,
        )
        if va_acc > best:
            best, best_state = va_acc, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    model.load_state_dict(best_state)
    te_acc, cm = evaluate(model, te, device)
    n_params = sum(p.numel() for p in model.parameters())
    print(
        f"\n[{args.model}] test 정확도 {te_acc:.3f}  (val 최고 {best:.3f}, 파라미터 {n_params / 1e6:.1f}M, "
        f"{time.time() - t0:.0f}s)"
    )
    print("정답(행) × 예측(열)", CLASSES)
    print(cm)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rec = {
        "model": args.model,
        "epochs": args.epochs,
        "lr": args.lr,
        "bs": args.bs,
        "seed": args.seed,
        "device": device,
        "n_train": len(train),
        "n_val": len(val),
        "n_test": len(test),
        "val_best": best,
        "test_acc": te_acc,
        "params_m": round(n_params / 1e6, 2),
        "seconds": round(time.time() - t0),
        "confusion": cm.tolist(),
        "classes": CLASSES,
    }
    (out / f"faceshape_cnn_{args.model}_s{args.seed}.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=1)
    )
    if args.save:
        Path(args.save).parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "model": args.model,
                "classes": CLASSES,
                "state_dict": best_state,
                "data_config": cfg,
                "record": rec,
            },
            args.save,
        )
        print("saved", args.save)


if __name__ == "__main__":
    main()
