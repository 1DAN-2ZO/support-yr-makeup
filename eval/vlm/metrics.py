"""VLM 선정 실험 — 지표 계산 (순수 함수, GPU 없이 테스트한다: eval/vlm/test_vlm.py)."""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Iterable, Sequence


def quantile(xs: Sequence[float], q: float) -> float | None:
    """선형 보간 분위수. 비었으면 None"""
    if not xs:
        return None
    s = sorted(xs)
    if len(s) == 1:
        return float(s[0])
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return float(s[lo] + (s[hi] - s[lo]) * (pos - lo))


def mode_share(values: Sequence[object]) -> float | None:
    """가장 많이 나온 값의 비율 — 같은 입력을 여러 번 돌렸을 때 한 필드가 얼마나 같은 답을 냈나.
    1.0 = 늘 같음"""
    if not values:
        return None
    return Counter(map(_key, values)).most_common(1)[0][1] / len(values)


def mode(values: Sequence[object]) -> object | None:
    if not values:
        return None
    k = Counter(map(_key, values)).most_common(1)[0][0]
    return next(v for v in values if _key(v) == k)


def _key(v: object) -> object:
    # 0.3 과 0.30000001 을 같은 답으로 본다 (JSON 숫자 표기 차이). 계획 전체(dict)도 셀 수 있게
    if isinstance(v, dict):
        return tuple(sorted((k, _key(x)) for k, x in v.items()))
    if isinstance(v, list):
        return tuple(_key(x) for x in v)
    return round(v, 2) if isinstance(v, float) else v


def field_agreement(runs: Sequence[dict[str, object]]) -> dict[str, float]:
    """반복 실행(결정 필드 dict 목록) → 필드별 최빈값 비율"""
    fields = sorted({k for r in runs for k in r})
    return {f: mode_share([r.get(f) for r in runs]) or 0.0 for f in fields}


def fleiss_kappa(table: Sequence[Sequence[int]]) -> float | None:
    """Fleiss' κ. table[i][j] = 대상 i 를 범주 j 로 본 횟수 (대상마다 합이 같아야 한다).
    여기서는 대상 = 사진, 평가자 = 반복 실행. 모든 답이 한 범주면 None (정의 안 됨)"""
    if not table:
        return None
    n = sum(table[0])
    if n < 2 or any(sum(r) != n for r in table):
        return None
    N, k = len(table), len(table[0])
    p = [sum(r[j] for r in table) / (N * n) for j in range(k)]
    P = [(sum(c * c for c in r) - n) / (n * (n - 1)) for r in table]
    pbar, pe = sum(P) / N, sum(x * x for x in p)
    if pe >= 1:
        return None
    return (pbar - pe) / (1 - pe)


def kappa_from_runs(per_photo: Sequence[Sequence[object]]) -> float | None:
    """사진별 반복 답 목록 → Fleiss' κ (범주는 등장한 값 전부)"""
    cats = sorted({repr(_key(v)) for vs in per_photo for v in vs})
    if not cats:
        return None
    idx = {c: i for i, c in enumerate(cats)}
    table = []
    for vs in per_photo:
        row = [0] * len(cats)
        for v in vs:
            row[idx[repr(_key(v))]] += 1
        table.append(row)
    return fleiss_kappa(table)


def direction(before: object, after: object) -> int | str:
    """값이 어느 쪽으로 바뀌었나: 숫자면 -1/0/+1, 범주면 '같음' 또는 바뀐 값"""
    if isinstance(before, (int, float)) and isinstance(after, (int, float)) and not isinstance(before, bool):
        d = round(float(after) - float(before), 2)
        return 0 if d == 0 else (1 if d > 0 else -1)
    return "same" if before == after else f"→{after}"


def follows_rule(
    vlm_before: object, vlm_after: object, rule_before: object, rule_after: object
) -> bool | None:
    """4단계: 측정값 하나를 뒤집었을 때 VLM 이 규칙과 같은 방향으로 바뀌었나.
    규칙이 안 바뀌는 뒤집기는 판정하지 않는다(None). 범주는 VLM 의 새 값이 규칙의 새 값과 같아야 통과"""
    rd = direction(rule_before, rule_after)
    if rd in (0, "same"):
        return None
    if isinstance(rd, int):
        return direction(vlm_before, vlm_after) == rd
    return vlm_after == rule_after


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """이항 비율의 95% 윌슨 신뢰구간 — 6단계 승률"""
    if n == 0:
        return None
    ph = k / n
    den = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / den
    h = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


def share(flags: Iterable[bool | None]) -> tuple[int, int]:
    """(참 개수, 판정한 개수) — None 은 뺀다"""
    xs = [f for f in flags if f is not None]
    return sum(1 for f in xs if f), len(xs)
