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
    change_rate,
    field_agreement,
    field_change_mean,
    fleiss_kappa,
    follows_rule,
    mode,
    mode_share,
    quantile,
    rationale_mismatch,
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


def test_rationale_mismatch():
    # 실험에서 본 문장: 입술을 올렸다면서 오버라인 0
    assert rationale_mismatch({"lip": "입술이 얇아 보이니 입술을 살짝 올렸어요"}, {"lip.overline": 0}) == [
        "lip"
    ]
    assert rationale_mismatch({"lip": "윗입술이 도톰해서 입술선은 그대로 뒀어요"}, {"lip.overline": 0}) == []
    assert rationale_mismatch({"lip": "입술선은 그대로 뒀어요"}, {"lip.overline": 0.1}) == ["lip"]
    assert rationale_mismatch({"shadow": "눈두덩이 넓어 섀도를 넓혔어요"}, {"shadow.range": 1}) == ["shadow"]
    assert rationale_mismatch({"shadow": "눈두덩이 좁아 섀도를 줄였어요"}, {"shadow.range": 0.9}) == []
    assert rationale_mismatch({}, {"lip.overline": 0}) == []


def test_change_rate_treats_missing_intensity_as_one():
    a, b = {"blush.position": "standard"}, {"blush.position": "standard", "intensity.lip": 1}
    assert change_rate([(a, b)], ["blush.position", "intensity.lip"]) == 0
    assert change_rate([(a, {**b, "intensity.lip": 1.1})], ["intensity.lip"]) == 1
    assert change_rate([], ["x"]) is None
    # 필드 평균 — 넷 중 하나만 바뀌면 '하나라도' 는 1, 평균은 0.25
    p = [({"a": 1, "b": 1, "c": 1, "d": 1}, {"a": 2, "b": 1, "c": 1, "d": 1})]
    assert change_rate(p, list("abcd")) == 1
    assert field_change_mean(p, list("abcd")) == 0.25


def test_parse_cond_and_pick_swap():
    pytest.importorskip("httpx")
    from run import parse_cond, pick_swap  # noqa: PLC0415

    assert parse_cond("A") == ("A", True, None)
    assert parse_cond("Au") == ("A", False, None)
    assert parse_cond("E.swap") == ("E", True, "swap")
    me = {"id": "aaa", "photo": "ffhq_000001.jpg"}
    pool = [{"id": "p1", "photo": "c000_000001.jpg"}, {"id": "p2", "photo": "c001_000002.jpg"}]
    for rep in range(5):
        assert pick_swap(me, pool, "daily", rep)["id"] == "p2"  # 같은 사람(000001)은 뽑지 않는다
    assert pick_swap(me, pool, "daily", 0) == pick_swap(me, pool, "daily", 0)  # 다시 돌려도 같다


def test_ef_schema_offers_every_value_the_gate_accepts():
    # v6 (2026-10-01): 얼굴별로 좁히던 선택지를 풀었다 — 오버라인 · drop · 진하기 상한 모두 전 범위
    m = core([{"op": "measure", "lm": LM}])[0]
    m["lip"]["upperLowerRatio"] = 0.9  # 목표(0.8) 이상이어도 오버라인 전 범위
    for e in ("R", "L"):
        m["eye"][e]["tiltDeg"] = 8  # 처진 눈 아님이어도 drop 을 준다
    s, p = core(
        [{"op": "schema", "variant": "E", "m": m}, {"op": "prompt", "m": m, "look": "daily", "variant": "E"}]
    )
    props = s["properties"]
    assert list(props)[:2] == ["observation", "rationale"]  # 관찰 → 근거 → 결정
    assert props["lip"]["properties"]["overline"]["enum"] == [0, 0.1, 0.2, 0.3, 0.4, 0.5]
    assert "drop" in props["liner"]["properties"]["style"]["enum"]
    assert max(props["intensity"]["properties"]["brow"]["enum"]) == 1.5
    tail = p[p.index("## 정할 것") :]
    assert '"range":1' not in tail and "나쁜 예" not in tail  # 예시 값·예시 문장 없음
    assert "규칙" not in p[p.index("## 이 사람의 얼굴") : p.index("## 정할 것")]  # v6 부터 E 도 규칙 값 없음


# ---------- 앱 코드 다리 ----------


def test_prompt_variants_share_everything_but_measures():
    m = core([{"op": "measure", "lm": LM}])[0]
    a, b, c, d = core([{"op": "prompt", "m": m, "look": "daily", "variant": v} for v in "ABCD"])
    assert len({a, b, c, d}) == 4
    tail = a[a.index("## 정할 것") :]
    assert all(p.endswith(tail) for p in (b, c, d))  # 정할 것·답 형식은 같다
    assert "°" not in b[b.index("## 이 사람의 얼굴") : b.index("## 정할 것")]  # B 는 숫자 없음


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
        "DHE_RESULTS_DIR": str(tmp_path / "results"),  # 저장소 eval/results 의 진짜 결과를 건드리지 않게
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
    assert list((tmp_path / "results").glob("*_vlm_fake.csv"))

    sh = subprocess.run(
        [sys.executable, str(HERE / "report.py"), "--model", "fake", "--sheet"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert sh.returncode == 0, sh.stdout + sh.stderr
    page = (data / "vlm-eval" / "out" / "sheet-fake.html").read_text(encoding="utf-8")
    for hole in ("N", "LOOK", "PHOTO", "MODEL", "COUNT", "DATA", "BUNDLE", "CARDS"):
        assert "{{" + hole + "}}" not in page, hole  # 틀의 빈칸이 다 채워졌다 (묶은 JS 안의 {{ 는 상관없다)
    assert "renderSheet" in page  # 앱 렌더러가 묶여 들어갔다
    key = json.loads((data / "vlm-eval" / "out" / "sheet-fake.key.json").read_text(encoding="utf-8"))
    assert page.count("<section data-n=") == len(key)  # 문항이 한 번씩만 (주석 안에 또 들어가지 않게)
    blob = page[page.index("id=data>") + 8 : page.index("</script>", page.index("id=data>"))]
    sheet_data = json.loads(blob)
    it = sheet_data["items"][0]
    assert it["photo"] in sheet_data["photos"] and len(it["lm"]) == 478
    for side in ("A", "B"):
        assert it[side]["liner"]["plan"]["style"] in ("winged", "extend", "drop")  # 렌더러가 받는 계획 전체
    # 가림: 렌더러에 넘기는 계획만 들어가고, 누가 VLM 인지는 페이지에 없다
    assert '"vlm"' not in blob and '"rule"' not in blob and '"source"' not in blob
    assert (data / "vlm-eval" / "out" / "why-fake.html").exists()

    # 평가자 두 명이 돌려준 결과(화장 비교) + 한 명(근거 문장) → 집계
    files = []
    for who, pick_vlm in (("가", True), ("나", False)):
        items = [{"n": k["n"], "pick": ("A" if (k["A"] == "vlm") == pick_vlm else "B")} for k in key]
        f = tmp_path / f"rating-{who}.json"
        f.write_text(
            json.dumps({"kind": "pref", "who": who, "model": "fake", "items": items}, ensure_ascii=False),
            encoding="utf-8",
        )
        files.append(str(f))
    f = tmp_path / "why-다.json"
    f.write_text(
        json.dumps(
            {"kind": "why", "who": "다", "model": "fake", "items": [{"n": 1, "nat": "4", "made_up": False}]}
        ),
        encoding="utf-8",
    )
    files.append(str(f))
    rt = subprocess.run(
        [sys.executable, str(HERE / "report.py"), "--ratings", *files],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert rt.returncode == 0, rt.stdout + rt.stderr
    summary = (data / "vlm-eval" / "out" / "ratings-fake.md").read_text(encoding="utf-8")
    assert f"VLM 승률 (비슷함 제외) {len(key)}/{2 * len(key)}" in summary and "| 가 |" in summary
    assert "자연스러움 평균 4.00" in summary

    # 선정 흐름 — E·F 형식, 빈 사진·다른 사람 사진 대조군, 모델 비교표
    pool = tmp_path / "pool" / "vlm-eval"
    (pool / "photos").mkdir(parents=True)
    (pool / "work").mkdir(parents=True)
    Image.new("RGB", (600, 600), (200, 150, 120)).save(pool / "photos" / "c000_999999.jpg")
    (pool / "work" / "c000_999999.json").write_text(
        json.dumps({"id": "ffffeeee0000", "photo": "c000_999999.jpg", "lm": LM, "m": m}), encoding="utf-8"
    )
    models_json = json.loads(models.read_text(encoding="utf-8"))
    models_json["models"]["fake2"] = models_json["models"]["fake"]
    models.write_text(json.dumps(models_json), encoding="utf-8")
    sel = [*run, "--model", "fake2", "--variant", "E,F", "--conds", "E,F,E.blank,E.swap,F.swap"]
    sel[sel.index("--model") + 1] = "fake2"
    r = subprocess.run(
        sel,
        env={**env, "DHE_SWAP_POOL": str(pool)},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    s2 = [
        json.loads(x)
        for x in (data / "vlm-eval" / "runs" / "fake2" / "stage2.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert {x["swap_id"] for x in s2 if x.get("perturb") == "swap"} == {"ffffeeee0000"}
    cmp_ = subprocess.run(
        [sys.executable, str(HERE / "report.py"), "--compare", "fake2"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    assert cmp_.returncode == 0, cmp_.stdout + cmp_.stderr
    text = (data / "vlm-eval" / "out" / "compare.md").read_text(encoding="utf-8")
    assert "규칙만 (VLM 없음)" in text and "| fake2 | E |" in text and "| fake2 | F |" in text
    assert list((tmp_path / "results").glob("*_vlm_compare.csv"))
