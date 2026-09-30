"""VLM 선정 실험 코드 시험 — GPU 없이 돈다 (가짜 llama-server).

uv run --extra vlm --extra dev pytest eval/vlm
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from metrics import (  # noqa: E402
    field_agreement,
    fleiss_kappa,
    follows_rule,
    mode,
    mode_share,
    quantile,
    wilson,
)

SYNTH = json.loads((HERE / "fixtures" / "synth.lm.json").read_text())
LM = [{"x": x, "y": y} for x, y in SYNTH]


def core(reqs):
    r = subprocess.run(
        ["node", str(HERE / "vlm_core.mjs")],
        input=json.dumps(reqs),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(r.stdout)


# ---------- 지표 ----------


def test_quantile_and_mode_share():
    assert quantile([1, 2, 3, 4], 0.5) == 2.5
    assert quantile([], 0.5) is None
    assert mode_share(["a", "a", "b", "a"]) == 0.75
    assert mode_share([0.3, 0.30000001, 0.4]) == pytest.approx(2 / 3)  # 숫자 표기 차이는 같은 답


def test_mode_counts_whole_plans():
    a, b = {"x": 1, "y": "p"}, {"y": "p", "x": 1.0000001}
    assert mode([a, b, {"x": 2}]) in (a, b)


def test_field_agreement():
    runs = [{"style": "winged", "r": 1.0}, {"style": "winged", "r": 1.1}, {"style": "extend", "r": 1.0}]
    ag = field_agreement(runs)
    assert ag["style"] == pytest.approx(2 / 3) and ag["r"] == pytest.approx(2 / 3)


def test_fleiss_kappa_perfect_and_undefined():
    assert fleiss_kappa([[3, 0], [0, 3]]) == pytest.approx(1.0)
    assert fleiss_kappa([[3, 0], [3, 0]]) is None  # 모두 한 범주 — 정의 안 됨


def test_follows_rule():
    assert follows_rule(0.0, 0.2, 0.0, 0.23) is True  # 규칙이 올리면 VLM 도 올려야
    assert follows_rule(0.2, 0.2, 0.0, 0.23) is False
    assert follows_rule("winged", "extend", "winged", "extend") is True
    assert follows_rule("winged", "drop", "winged", "extend") is False
    assert follows_rule(1.0, 0.9, 1.0, 1.0) is None  # 규칙이 안 바뀌면 판정 안 함


def test_wilson():
    lo, hi = wilson(7, 10)
    assert 0.39 < lo < 0.41 and 0.88 < hi < 0.90
    assert wilson(0, 0) is None


# ---------- 앱 코드 다리 ----------


def test_prompt_variants_share_everything_but_measures():
    m = core([{"op": "measure", "lm": LM}])[0]
    a, b, c, d = core([{"op": "prompt", "m": m, "look": "daily", "variant": v} for v in "ABCD"])
    assert len({a, b, c, d}) == 4
    tail = a[a.index("## 정할 것") :]
    assert all(p.endswith(tail) for p in (b, c, d))  # 정할 것·답 형식은 같다
    assert "°" not in b[b.index("## 이 얼굴을 잰 값") : b.index("## 정할 것")]  # B 는 숫자 없음


def test_gate_rejects_garbage_and_accepts_rule_consistent():
    m = core([{"op": "measure", "lm": LM}])[0]
    bad, rule = core([{"op": "gate", "m": m, "raw": "not json"}, {"op": "rule", "m": m}])
    assert bad["parsed"] is False and bad["ok"] is False
    ok = core([{"op": "gate", "m": m, "raw": json.dumps({"liner": {"style": rule["liner.style"]}})}])[0]
    assert ok["ok"] is True


def test_flips_move_the_rule():
    m = core([{"op": "measure", "lm": LM}])[0]
    m["lip"]["upperLowerRatio"] = 0.9
    fl = {f["name"]: f for f in core([{"op": "flips", "m": m}])[0]}
    for name in ("droop", "lidGap", "lip"):
        assert fl[name]["ruleBefore"] != fl[name]["ruleAfter"], name


# ---------- 가짜 서버로 전체 흐름 ----------


def test_end_to_end_with_fake_server(tmp_path):
    Image = pytest.importorskip("PIL.Image")  # vlm 묶음(uv --extra vlm)이 없으면 건너뛴다

    data = tmp_path / "data"
    photos, work = data / "vlm-eval" / "photos", data / "vlm-eval" / "work"
    photos.mkdir(parents=True)
    work.mkdir(parents=True)
    Image.new("RGB", (600, 600), (224, 172, 140)).save(photos / "p1.jpg")
    m = core([{"op": "measure", "lm": LM}])[0]
    m["lip"]["upperLowerRatio"] = 0.9
    (work / "p1.json").write_text(
        json.dumps(
            {"id": "abc123def456", "photo": "p1.jpg", "sha256": "x", "w": 600, "h": 600, "lm": LM, "m": m}
        ),
        encoding="utf-8",
    )
    models = tmp_path / "models.json"
    models.write_text(
        json.dumps(
            {
                "llama_server": [sys.executable, str(HERE / "fake_server.py")],
                "models": {"fake": {"gguf": "x.gguf", "mmproj": "x.mmproj"}},
            }
        ),
        encoding="utf-8",
    )
    env = {
        **os.environ,
        "DHE_DATA_DIR": str(data),
        "DHE_VLM_MODELS": str(models),
        "PYTHONIOENCODING": "utf-8",
    }
    run = [
        sys.executable,
        str(HERE / "run.py"),
        "--model",
        "fake",
        "--looks",
        "daily",
        "--smoke",
        "3",
        "--speed-photos",
        "1",
        "--reps",
        "2",
        "--reps-det",
        "2",
        "--port",
        "8791",
    ]
    r = subprocess.run(run, env=env, capture_output=True, text=True, encoding="utf-8", timeout=600)
    assert r.returncode == 0, r.stdout + r.stderr
    for st in range(5):
        assert (data / "vlm-eval" / "runs" / "fake" / f"stage{st}.jsonl").exists(), st

    rep = subprocess.run(
        [sys.executable, str(HERE / "report.py"), "--model", "fake"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert rep.returncode == 0, rep.stdout + rep.stderr
    summary = (data / "vlm-eval" / "out" / "fake-summary.md").read_text(encoding="utf-8")
    assert "깨진 출력(요청 실패·JSON 아님) **0**" in summary
    assert "## 4. 측정값 뒤집기" in summary
    csvs = list((HERE.parent / "results").glob("*_vlm_fake.csv"))
    assert csvs
    for c in csvs:
        c.unlink()  # 시험 결과는 남기지 않는다

    sh = subprocess.run(
        [sys.executable, str(HERE / "report.py"), "--model", "fake", "--sheet"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert sh.returncode == 0, sh.stdout + sh.stderr
    assert (data / "vlm-eval" / "out" / "sheet-fake.html").exists()
