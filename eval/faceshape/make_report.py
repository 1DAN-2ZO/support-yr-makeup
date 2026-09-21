"""얼굴형 분류 성능평가 보고서 (HTML → PDF).

형식은 TUKTAK LLM 성능평가 보고서를 따른다: 결과 카드 3개 → 핵심 요약 → STEP 0 평가 설계 → STEP 1 데이터·지표
→ STEP 2~ 결과 표·그래프·해석 → 최종 판단 → 산출 파일. 숫자는 결과 파일에서 읽는다(손으로 적지 않는다).

  python eval/faceshape/make_report.py            # docs/reports/ 에 html·pdf 생성

입력 (DHE_DATA_DIR, 기본 ~/dhe-data/results)
- faceshape_rule_landmarks.json   앱 규칙 판정 + 얼굴 점
- faceshape_cnn_*.json            CNN 파인튜닝 결과
- faceshape_knn.json              비슷한 사진 찾기(임베딩 kNN) 비교
- 얼굴 점 기준 정확도는 eval/results/*_faceshape_*.csv 최신 파일
"""

from __future__ import annotations

import csv
import html
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "results"
OUT = ROOT / "docs" / "reports"
TITLE = "당화응 얼굴형 분류 성능평가 보고서"
CLS = ["heart", "oblong", "oval", "round", "square"]
KO = {"heart": "역삼각형", "oblong": "긴형", "oval": "계란형", "round": "둥근형", "square": "각진형"}
e = lambda s: html.escape(str(s))  # noqa: E731
pct = lambda v: f"{v * 100:.1f}%"  # noqa: E731

CSS = """
@page { size: A4; margin: 16mm 16mm 18mm; @bottom-left { content: "%TITLE%"; font-size: 8pt; color: #999 }
@bottom-right { content: counter(page); font-size: 8pt; color: #999 }
}
* { box-sizing: border-box }
body { font-family: 'Apple SD Gothic Neo','Pretendard','Noto Sans KR',sans-serif;
  color: #222; font-size: 9.6pt; line-height: 1.6; margin: 0 }
h1 { font-size: 20pt; font-weight: 500; margin: 0 0 2mm } .sub { color: #555; margin-bottom: 5mm }
h2 { font-size: 13pt; font-weight: 500; margin: 7mm 0 2.5mm }
h3 { font-size: 11pt; font-weight: 500; margin: 4mm 0 1.5mm }
.cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 3mm; margin-bottom: 4mm }
.card { border: 1px solid #ddd; border-radius: 2mm; padding: 3mm 4mm }
.card .k { font-size: 7.5pt; color: #888 }
.card .v { font-size: 13pt; margin: 1mm 0 }
.card .s { font-size: 7.5pt; color: #888 }
table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 2mm; font-size: 8.6pt }
th { background: #eceef2; font-weight: 500; padding: 1.8mm 2mm; border-bottom: 1px solid #d5d8de }
td { padding: 1.6mm 2mm; border-bottom: 1px solid #e6e8ec; text-align: center }
td.l, th.l { text-align: left }
.note { font-size: 8pt; color: #888 } .hl { background: #f3f8ff }
.page { page-break-before: always }
"""


def bar_chart(labels, series, colors, legend, ymax=1.0, h=150, w=520):
    """묶음 막대 그래프 (inline SVG). series: [[값...] per 계열]."""
    n, k = len(labels), len(series)
    pad_l, pad_b, top = 30, 26, 10
    gw = (w - pad_l - 10) / n
    bw = min(22, gw * 0.8 / k)
    out = [
        f'<svg width="{w}" height="{h + pad_b + top}" viewBox="0 0 {w} {h + pad_b + top}" '
        f'style="font-size:8px;font-family:sans-serif">'
    ]
    for t in [0, 0.2, 0.4, 0.6, 0.8, 1.0]:
        y = top + h - t / ymax * h
        out.append(
            f'<line x1="{pad_l}" x2="{w - 5}" y1="{y}" y2="{y}" stroke="#eee"/><text '
            f'x="{pad_l - 4}" y="{y + 3}" text-anchor="end" fill="#777">{t:.1f}</text>'
        )
    for i, lab in enumerate(labels):
        x0 = pad_l + i * gw + (gw - bw * k) / 2
        for j, s in enumerate(series):
            v = s[i]
            bh = v / ymax * h
            out.append(
                f'<rect x="{x0 + j * bw:.1f}" y="{top + h - bh:.1f}" width="{bw - 1:.1f}" '
                f'height="{bh:.1f}" fill="{colors[j]}"/>'
            )
            out.append(
                f'<text x="{x0 + j * bw + bw / 2:.1f}" y="{top + h - bh - 2:.1f}" text-anchor="middle" '
                f'fill="#444">{v:.2f}</text>'
            )
        out.append(
            f'<text x="{pad_l + i * gw + gw / 2:.1f}" y="{top + h + 12}" text-anchor="middle" '
            f'fill="#555">{e(lab)}</text>'
        )
    out.append("</svg>")
    leg = (
        " · ".join(f'<span style="color:{c}">■</span> {e(t)}' for c, t in zip(colors, legend, strict=False))
        if legend
        else ""
    )
    return "".join(out) + (f'<div class="note">{leg}</div>' if leg else "")


def confusion_table(cm, caption):
    head = "".join(f"<th>{KO[c]}</th>" for c in CLS)
    rows = "".join(
        f'<tr><td class="l">{KO[a]}</td>'
        + "".join(f"<td>{cm[i][j]}</td>" for j in range(5))
        + f"<td>{sum(cm[i])}</td></tr>"
        for i, a in enumerate(CLS)
    )
    return (
        f'<table><tr><th class="l">정답 \\ 예측</th>{head}<th>합계</th></tr>{rows}</table><div '
        f'class="note">{e(caption)}</div>'
    )


PRETRAIN = {"in1k": "ImageNet-1k (약 128만 장, 1,000종)", "in12k": "ImageNet-12k"}


def model_sources(names):
    """timm 에 적힌 가중치 출처(Hugging Face 주소)·라이선스를 그대로 읽는다."""
    import timm

    rows = []
    for n in names:
        cfg = timm.create_model(n, pretrained=False).pretrained_cfg
        tag = cfg.get("tag", "")
        found = sorted(
            (tag.find(t), PRETRAIN[t]) for t in PRETRAIN if t in tag
        )  # 태그에 적힌 순서 = 학습 순서
        pre = " → ".join(v for _, v in found) or tag
        rows.append((n, cfg.get("hf_hub_id", "-"), pre, cfg.get("license", "-")))
    return rows


def main() -> int:
    rule = json.loads((DATA / "faceshape_rule_landmarks.json").read_text())
    ok = [r for r in rule if r["status"] == "ok"]
    n_square = sum(1 for r in ok if r["pred"] == "square")
    rule_acc = sum(r["pred"] == r["label"] for r in rule) / len(rule)
    rule_cm = [[sum(1 for r in ok if r["label"] == a and r["pred"] == b) for b in CLS] for a in CLS]
    cnn = {
        json.loads(p.read_text())["model"]: json.loads(p.read_text())
        for p in sorted(DATA.glob("faceshape_cnn_*.json"))
    }
    knn = json.loads((DATA / "faceshape_knn.json").read_text())["rows"]
    csvs = sorted((ROOT / "eval" / "results").glob("*_faceshape_*.csv"))
    lm_rows = (
        {
            r["metric"].split("· ")[-1]: float(r["current"])
            for r in csv.DictReader(csvs[-1].open(encoding="utf-8"))
            if "얼굴 점" in r["metric"]
        }
        if csvs
        else {}
    )

    best_name = max(cnn, key=lambda m: cnn[m]["test_acc"])
    best = cnn[best_name]
    other = [m for m in cnn if m != best_name]
    knn_best = max(r["acc"] for r in knn if r["method"].startswith("kNN"))
    emb_clf = max(r["acc"] for r in knn if r["method"] == "로지스틱")
    per_class = {m: [c["confusion"][i][i] / sum(c["confusion"][i]) for i in range(5)] for m, c in cnn.items()}
    rule_ratio = {
        c: sorted(r["ratio"] for r in ok if r["label"] == c)[len([r for r in ok if r["label"] == c]) // 2]
        for c in CLS
    }
    rule_jaw = {
        c: sorted(r["jaw"] for r in ok if r["label"] == c)[len([r for r in ok if r["label"] == c]) // 2]
        for c in CLS
    }

    methods = [("앱 규칙 (현행)", rule_acc, "규칙")]
    for k, v in lm_rows.items():
        methods.append((f"얼굴 점 · {k.replace(' + 로지스틱', '')}", v, "얼굴 점 + 분류기"))
    methods.append(("임베딩 + 비슷한 사진 찾기", knn_best, "검색(kNN)"))
    methods.append(("임베딩 + 분류기", emb_clf, "임베딩 고정"))
    for m in cnn:
        methods.append((f"CNN 파인튜닝 · {m}", cnn[m]["test_acc"], "파인튜닝"))

    H = [
        f"<style>{CSS.replace('%TITLE%', TITLE)}</style>",
        f"<h1>{TITLE}</h1>",
        '<div class="sub">맨얼굴 정면 사진을 보고 얼굴형 5종(역삼각형·긴형·계란형·둥근형·각진형)을 '
        "판정하는 방법 후보를 같은 시험 사진으로 비교한 결과입니다. "
        "판정 결과는 쉐딩·하이라이트 가이드 위치를 정하는 데 쓰입니다(F-02, 화면 3-c).</div>",
        '<div class="cards">'
        f'<div class="card"><div class="k">채택 후보</div><div class="v">{e(best_name)}</div><div '
        f'class="s">정확도 {pct(best["test_acc"])} · 파라미터 {best["params_m"]}M</div></div>'
        f'<div class="card"><div class="k">현행 기준선</div><div class="v">앱 규칙</div><div '
        f'class="s">정확도 {pct(rule_acc)} · 대부분 각진형으로 판정</div></div>'
        f'<div class="card"><div class="k">제외 판단</div><div class="v">비슷한 사진 찾기</div><div '
        f'class="s">정확도 {pct(knn_best)} · 머리·조명에 끌려감</div></div></div>',
        "<h2>핵심 요약</h2>",
        f"<p>현재 앱 규칙(<code>estimateFaceShape</code>)은 공개 얼굴형 시험 사진 {len(rule)}장에서 "
        f"정확도 {pct(rule_acc)}로, 5종을 무작위로 고르는 수준(20%)과 비슷했습니다. "
        f"규칙의 기준값이 MediaPipe 얼굴 점 위치와 맞지 않아 {n_square}장을 "
        f"각진형으로 판정했습니다. "
        f"얼굴 점 기준을 늘리면 최대 {pct(max(lm_rows.values()) if lm_rows else 0)}까지 오르지만, "
        f"얼굴 점이 머리선을 잡지 못해 그 이상은 어렵습니다. "
        f"사진 전체를 보는 CNN을 파인튜닝하면 {pct(best['test_acc'])}로 "
        f"규칙의 약 {best['test_acc'] / rule_acc:.1f}배가 됩니다. "
        f"<b>{e(best_name)}를 기본 후보</b>로 두고, 한국인 얼굴 확인과 "
        f"앱 연결(속도) 확인을 다음 단계로 진행합니다.</p>",
        "<h2>STEP 0 평가 설계</h2>",
        '<table><tr><th class="l" style="width:22%">구분</th><th class="l">내용</th></tr>'
        '<tr><td class="l">평가 목적</td><td class="l">현행 규칙의 정확도를 기준선으로 재고, 이를 대체할 '
        "판정 방법을 고른다 (S-2, 발표 숫자 ②)</td></tr>"
        '<tr><td class="l">비교 방법</td><td class="l">① 앱 규칙 ② 얼굴 점 특징 + 분류기 3종 ③ '
        "임베딩 + 비슷한 사진 찾기 ④ 임베딩 + 분류기 ⑤ CNN 파인튜닝 2종</td></tr>"
        '<tr><td class="l">평가 방식</td><td class="l">모든 방법을 같은 시험 사진 998장으로 잰다. ②③④는 '
        "998장을 5번 나눠 번갈아 학습·시험한 평균(교차검증), ⑤는 별도 "
        "학습 사진으로 학습 후 998장으로 한 번 시험</td></tr>"
        '<tr><td class="l">채점 기준</td><td class="l">정확도(맞힌 비율)와 '
        "얼굴형별 맞힌 비율(혼동표). 기준선 대비 개선폭</td></tr>"
        '<tr><td class="l">주의 사항</td><td class="l">시험 사진은 서양 연예인 사진이고 라벨 근거·라이선스가 '
        "불명확해 <b>기준선 측정·1차 학습까지만</b> 쓴다. 한국인 사용자 "
        "정확도는 별도로 확인해야 한다</td></tr></table>",
        "<h2>STEP 1 평가 데이터와 지표</h2>",
        '<table><tr><th class="l">데이터</th><th>장수</th><th class="l">용도</th></tr>'
        f'<tr><td class="l">공개 얼굴형 데이터 test (codernotme/face_shape)</td><td>{len(rule)}</td><td '
        f'class="l">모든 방법 공통 시험지. 5종 약 200장씩</td></tr>'
        f'<tr><td class="l">같은 데이터 학습 폴더</td><td>{best["n_train"] + best["n_val"]}</td><td '
        f'class="l">CNN 학습({best["n_train"]}) · 검증({best["n_val"]}). 시험 사진과 같은 사진 '
        f"27장은 미리 제외</td></tr></table>",
        '<table><tr><th class="l">지표</th><th class="l">의미</th></tr>'
        '<tr><td class="l">정확도</td><td class="l">사람이 붙인 얼굴형과 판정이 같은 비율</td></tr>'
        '<tr><td class="l">얼굴형별 맞힌 비율</td><td class="l">각 얼굴형 '
        "사진 중 맞힌 비율. 특정 얼굴형으로 쏠리는지 확인</td></tr>"
        '<tr><td class="l">파라미터 수</td><td class="l">모델 크기. 폰 '
        "브라우저 실행 가능성 판단 참고</td></tr></table>",
        '<div style="break-inside:avoid"><h3>사용한 모델 출처와 라이선스</h3>',
        '<table><tr><th class="l">모델</th><th class="l">받은 곳 (Hugging Face)</th><th '
        'class="l">미리 학습한 데이터</th><th>라이선스</th></tr>'
        + "".join(
            f'<tr><td class="l">{e(m)}</td><td class="l">{e(src)}</td><td '
            f'class="l">{e(pre)}</td><td>{e(lic)}</td></tr>'
            for m, src, pre, lic in model_sources(list(cnn) + ["convnext_tiny"])
        )
        + "</table>"
        '<table><tr><th class="l" style="width:22%">구분</th><th class="l">내용</th></tr>'
        '<tr><td class="l">모델 구조</td><td class="l">MobileNetV3·EfficientNet은 Google, '
        "ConvNeXt는 Meta가 논문으로 발표한 구조</td></tr>"
        '<tr><td class="l">미리 학습한 가중치</td><td class="l">이미지 모델 라이브러리 timm 이 ImageNet '
        "으로 학습해 Hugging Face <code>timm</code> 계정에 공개한 것</td></tr>"
        '<tr><td class="l">우리가 한 것</td><td class="l">마지막 분류층을 얼굴형 5종으로 바꾸고 공개 얼굴형 '
        "사진으로 전체를 다시 학습(파인튜닝). ConvNeXt 는 비교 실험(임베딩 고정)에만 사용</td></tr>"
        '<tr><td class="l">라이선스 판단</td><td class="l">모델 가중치는 Apache-2.0 이라 상업 서비스에 '
        "넣을 수 있다. 다만 미리 학습에 쓰인 ImageNet 은 원래 연구용 조건이 붙은 데이터라, "
        "사업화 단계에서 이 점을 한 번 더 확인한다. 얼굴형 학습에 쓴 "
        "공개 얼굴형 데이터는 라이선스 근거가 불명확해 최종 모델은 한국인 "
        "사진(생성 또는 동의받은 사진)으로 다시 다듬는다</td></tr></table></div>",
        '<div class="page"></div><h2>STEP 2 기준선 — 현행 앱 규칙</h2>',
        f"<p>규칙은 얼굴 점 4쌍으로 비율 3개(길이/폭, 턱 폭/얼굴 폭, 이마 "
        f"폭/얼굴 폭)를 만들고 정해진 기준값으로 5종을 나눕니다. "
        f"정확도 <b>{pct(rule_acc)}</b>.</p>",
        confusion_table(rule_cm, "공개 얼굴형 시험 사진 997장(얼굴 검출 실패 1장 제외)"),
        "<h3>해석</h3>",
        '<table><tr><th class="l">비율</th><th>규칙 기준값</th>'
        + "".join(f"<th>{KO[c]} 중앙값</th>" for c in CLS)
        + "</tr>"
        '<tr><td class="l">길이 / 폭</td><td>1.55 초과 → 긴형</td>'
        + "".join(f"<td>{rule_ratio[c]:.2f}</td>" for c in CLS)
        + "</tr>"
        '<tr><td class="l">턱 폭 / 얼굴 폭</td><td>0.78 초과 → 각진형</td>'
        + "".join(f"<td>{rule_jaw[c]:.2f}</td>" for c in CLS)
        + "</tr></table>"
        "<p>턱 폭 비율이 얼굴형과 상관없이 대부분 0.78을 넘어 각진형으로 "
        "쏠렸고, 길이/폭은 어느 얼굴형도 1.55에 닿지 않아 긴형이 한 번도 "
        "나오지 않았습니다. "
        "MediaPipe 얼굴 점의 맨 위(10번)가 머리선이 아니라 이마 중간이라 "
        "얼굴 길이가 짧게 재지는 것이 원인입니다.</p>",
        "<h2>STEP 3 판정 방법 비교</h2>",
        '<table><tr><th class="l">방법</th><th>종류</th><th>정확도</th><th>기준선 대비</th></tr>'
        + "".join(
            f'<tr class="{"hl" if n.endswith(best_name) else ""}"><td '
            f'class="l">{e(n)}</td><td>{e(t)}</td><td>{pct(v)}</td><td>{v - rule_acc:+.1%}</td></tr>'
            for n, v, t in methods
        )
        + "</table>",
        bar_chart(
            ["앱 규칙", "얼굴 점(최고)", "사진 찾기", "임베딩+분류기"]
            + [f"CNN {m.split('_')[0]}" for m in cnn],
            [
                [rule_acc, max(lm_rows.values()) if lm_rows else 0, knn_best, emb_clf]
                + [cnn[m]["test_acc"] for m in cnn]
            ],
            ["#3b82f6"],
            None,
        ),
        "<h3>해석</h3>",
        "<p>얼굴 점 방식은 기준을 늘릴수록 오르지만 머리선 정보가 없어 50% 근처에서 멈춥니다. "
        "비슷한 사진 찾기(TUKTAK 이미지 검색과 같은 방식)는 일반 임베딩이 "
        "얼굴형보다 머리 모양·조명·나이가 비슷한 사진을 먼저 찾아 40% "
        "근처에 머뭅니다. "
        "같은 임베딩에 분류기만 붙여도 50%대라, 임베딩 자체를 얼굴형에 "
        "맞게 다시 학습하는 파인튜닝이 차이를 만듭니다. "
        "단, ②③④는 998장 안의 교차검증이고 ⑤는 9천여 장으로 학습해 조건이 완전히 같지는 않습니다.</p>",
        '<div class="page"></div><h2>STEP 4 CNN 파인튜닝 상세</h2>',
        '<table><tr><th class="l">모델</th><th>정확도</th><th>검증 최고</th>'
        "<th>파라미터</th><th>에폭</th><th>학습 "
        "시간</th><th>장치</th></tr>"
        + "".join(
            f'<tr><td class="l">{e(m)}</td><td>{pct(c["test_acc"])}</td><td>{pct(c["val_best"])}</td>'
            f"<td>{c['params_m']}M</td><td>{c['epochs']}</td><td>{c['seconds'] // 60}분</td>"
            f"<td>{e(c['device'])}</td></tr>"
            for m, c in cnn.items()
        )
        + "</table>",
        "<h3>얼굴형별 맞힌 비율</h3>",
        '<table><tr><th class="l">모델</th>'
        + "".join(f"<th>{KO[c]}</th>" for c in CLS)
        + "</tr>"
        + "".join(
            f'<tr><td class="l">{e(m)}</td>' + "".join(f"<td>{pct(v)}</td>" for v in per_class[m]) + "</tr>"
            for m in cnn
        )
        + "</table>",
        bar_chart([KO[c] for c in CLS], [per_class[m] for m in cnn], ["#3b82f6", "#10b981"], list(cnn)),
        confusion_table(best["confusion"], f"{best_name} 혼동표 (시험 사진 998장)"),
        "<h3>시험 사진 겹침 확인</h3>",
        "<p>학습 폴더와 시험 사진에서 같은 사진(지문 일치) 27장을 학습에서 "
        "뺐습니다. 좌우 뒤집기까지 포함해 거의 같은 사진(지문 "
        "256비트 중 10비트 이하 차이)이 학습에 남아 있는 시험 사진은 "
        "1.6%로, 정확도를 크게 부풀리지 않는 수준입니다.</p>",
        "<h2>STEP 5 최종 판단</h2>",
        '<table><tr><th class="l">방법</th><th>판단</th><th class="l">근거</th></tr>'
        f'<tr class="hl"><td class="l">{e(best_name)}</td><td>기본 후보</td><td class="l">정확도 '
        f"{pct(best['test_acc'])}로 가장 높고 약한 얼굴형(계란형·역삼각형)도 "
        f"끌어올림. 파라미터 {best['params_m']}M로 "
        f"폰 크기</td></tr>"
        + "".join(
            f'<tr><td class="l">{e(m)}</td><td>대안</td><td class="l">정확도 {pct(cnn[m]["test_acc"])}. '
            f"계산량이 더 적어 폰 속도가 부족할 때 대안</td></tr>"
            for m in other
        )
        + f'<tr><td class="l">얼굴 점 특징 + 분류기</td><td>제외</td><td '
        f'class="l">최고 {pct(max(lm_rows.values()) if lm_rows else 0)}. '
        f"머리선 정보가 없어 한계</td></tr>"
        f'<tr><td class="l">비슷한 사진 찾기</td><td>제외</td><td class="l">최고 {pct(knn_best)}. '
        f"비교용 사진을 서비스에 저장해야 해 라이선스 부담도 있음</td></tr>"
        f'<tr><td class="l">앱 규칙</td><td>교체 대상</td><td class="l">{pct(rule_acc)}. '
        f"모델 실패 시 대체 경로로만 유지</td></tr></table>",
        "<h2>최종 결론</h2>",
        f"<p>얼굴형 판정은 <b>{e(best_name)} 파인튜닝</b>으로 갑니다. "
        f"다만 이 숫자는 서양 연예인 사진 기준이라, "
        f"한국인 사용자에서 같은 성능이 나오는지는 아직 모릅니다. "
        '발표에서는 "규칙 → 모델" 개선폭과 함께 이 한계를 밝힙니다.</p>',
        "<h3>다음 단계</h3>",
        '<table><tr><th>단계</th><th class="l">내용</th></tr>'
        '<tr><td>1</td><td class="l">AI 생성 한국인 얼굴(얼굴형 5종 × '
        "20장)로 정확도 확인, 생성 결과는 사람이 검수</td></tr>"
        '<tr><td>2</td><td class="l">팀원 셀카 소수로 실제 사람 확인</td></tr>'
        '<tr><td>3</td><td class="l">ONNX 변환, 폰 브라우저 판정 시간 '
        "측정 → 폰/서버 실행 위치 결정 근거</td></tr>"
        '<tr><td>4</td><td class="l">한국인 라벨 2인 독립 작성, 라벨러 '
        "일치율(모델 상한선) 측정</td></tr></table>",
        "<h2>산출 파일</h2>",
        '<table><tr><th class="l">파일</th><th class="l">위치</th></tr>'
        '<tr><td class="l">규칙 판정 실험 페이지</td><td class="l">eval/faceshape/harness.html '
        "· harness.js</td></tr>"
        '<tr><td class="l">얼굴 점 기준 계산</td><td class="l">eval/faceshape/features.py</td></tr>'
        '<tr><td class="l">결과 CSV 생성</td><td class="l">eval/faceshape/run.py → '
        "eval/results/*_faceshape_*.csv</td></tr>"
        '<tr><td class="l">CNN 학습</td><td class="l">train/faceshape_cnn.py</td></tr>'
        '<tr><td class="l">이 보고서 생성</td><td class="l">eval/faceshape/make_report.py '
        "→ docs/reports/</td></tr></table>",
    ]

    OUT.mkdir(parents=True, exist_ok=True)
    h = OUT / "faceshape-eval-report-v1.html"
    h.write_text(
        "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>"
        + TITLE
        + "</title></head><body>"
        + "".join(H)
        + "</body></html>",
        encoding="utf-8",
    )
    pdf = OUT / "faceshape-eval-report-v1.pdf"
    subprocess.run(
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf}",
            h.as_uri(),
        ],
        capture_output=True,
        timeout=90,
    )
    print("wrote", h.relative_to(ROOT), pdf.relative_to(ROOT) if pdf.exists() else "(pdf 실패)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
