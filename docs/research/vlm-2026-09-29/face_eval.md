# VLM face-attribute perception and how to evaluate a VLM for makeup personalization (as of 2026-09)

Scope: open VLMs (Qwen-VL, InternVL, Gemma, MiniCPM-V) for perceiving fine-grained facial attributes on mostly Korean (East Asian) adult faces; prior makeup/beauty LLM work; prompting (measured numbers vs. words); a small evaluation protocol (10–30 team photos).
Status labels: [PEER] peer-reviewed venue, [PRE] arXiv preprint only, [IND] industry/press.

## Q1. Are there facial-attribute VQA benchmarks, and how do open models score on them?

### Takeaway
Yes: FaceBench (CVPR 2025), FaceXBench (IEEE journal, 2025/26), and Face-MLLM's zero-shot attribute set. They all show that general open VLMs of 7–8B size get roughly 50–60% on fine-grained face questions. Accuracy on intrinsic facial parts (eyelid, eye shape, lips) is lower than on obvious attributes such as glasses or gender. Eyelid type and lip shape come out close to chance in the one benchmark that measures them directly. Asking the model to reason (CoT) made face tasks worse. Treat the VLM's own reading of the face as unreliable. Measured values should be the source of truth.

### Cited Findings
- **FaceBench** [PEER, CVPR 2025]: 5 views, more than 210 attributes and 700 values, 49,919 eval VQA pairs plus 23,841 fine-tuning pairs. The authors conclude that "existing MLLMs are far from satisfactory in understanding fine-grained facial attributes" — [arXiv 2503.21457](https://arxiv.org/abs/2503.21457); [CVPR poster](https://cvpr.thecvf.com/virtual/2025/poster/34717); [GitHub](https://github.com/CVI-SZU/FaceBench)
- FaceBench overall accuracy (from the arXiv HTML, as extracted by the fetch tool): GPT-4o 63.21%, Gemini-1.5-Pro 62.72%, Face-LLaVA-13B 61.16%, **MiniCPM-V-8B 60.67%**, **InternVL2-8B 57.69%**, **Qwen2-VL-7B 57.19%**, DeepSeek-VL-7B 56.09%, Qwen-VL-Chat-7B 48.27%. Human baseline is 67.38%. Fine-grained facial parts (lips, eyebrows, chin) range from about 20% to 77% depending on attribute. Easy attributes (mask, headphones, gender) are above 90% — [arXiv HTML 2503.21457](https://arxiv.org/html/2503.21457). (These numbers were extracted by the fetch tool. Verify them against the paper's table before quoting.)
- **FaceXBench** [PEER, IEEE journal per Xplore; also arXiv]: 5,000 MCQ VQA items from 25 datasets across 14 tasks and 6 categories. It covers 26 open models plus GPT-4o (50.24%) and Gemini-1.5-Pro (54.40%) — [arXiv 2501.10360](https://arxiv.org/abs/2501.10360); [IEEE Xplore](https://ieeexplore.ieee.org/document/11358941/); [GitHub](https://github.com/Kartik-3004/facexbench)
- FaceXBench open-model overall scores: Qwen2-VL-72B 57.86%, InternVL2-76B 57.80%, LLaVA-OV-72B 56.42%, InternVL2-8B 53.24%, **Qwen2-VL-7B 51.58%**, LLaVA-OV-7B 48.98%, Phi-3.5-Vision 45.16%, **MiniCPM-Llama3-V2.5 40.70%**. On the Face Analysis (attributes) category, the best large models score 57–65% — [arXiv HTML 2501.10360](https://arxiv.org/html/2501.10360)
- FaceXBench prompting results: **CoT prompting lowered accuracy** by 11.96 points for Qwen2-VL-7B, 11.80 for Phi-3.5-V, and 4.36 for InternVL2-8B. Adding an in-context task description also slightly lowered accuracy (Qwen2-VL-7B −1.26) — [arXiv HTML 2501.10360](https://arxiv.org/html/2501.10360)
- **Face-MLLM** [PRE]: this is the only benchmark found that directly tests **eyelid type**. The zero-shot set has 300 images and 760 questions on "fine-grained features commonly found in Chinese traditional aesthetics." Face-MLLM (fine-tuned) scores eyelid type 59.3%, eye shape 53.9%, nose shape 65.3%, lip shape 50.0% (mean 57.1%). Baselines are lower: LLaVA-1.5-7B mean 40.7%, InternVL-1.5-26B mean 48.6% — [arXiv 2410.20717](https://arxiv.org/html/2410.20717)
- **FaceLLM** [PEER workshop, ICCV 2025 W]: InternVL3 fine-tuned with LoRA on FairFaceGPT. FaceLLM-38B scores 60.52% on FaceXBench, with 71.40% on bias/fairness and 65.12% on face analysis — [arXiv 2507.10300](https://arxiv.org/html/2507.10300); [CVF open access](https://openaccess.thecvf.com/content/ICCV2025W/FoundGen-Bio/papers/Shahreza_FaceLLM_A_Multimodal_Large_Language_Model_for_Face_Understanding_ICCVW_2025_paper.pdf)
- **FaceInsight** [PEER, ACM MM 2025]: compared against InternVL2.5-8B, Qwen2.5-VL-7B, MiniCPM-Llama3-V2.5, Phi-3.5-V, NVILA-8B and others. General MLLMs showed "hallucinations and logical inconsistencies when processing facial content." One example is claiming both bangs and a receding hairline at once. The paper also reports over-reliance on linguistic patterns rather than visual cues — [arXiv 2504.15624](https://arxiv.org/html/2504.15624); [ACM DL](https://dl.acm.org/doi/10.1145/3746027.3755634)
- A search-result summary states that Qwen2.5-VL and Gemma3 were the strongest base families for facial understanding, and Janus-Pro and Llama-3.2-Vision the weakest. I could not confirm which paper's table this comes from — [emergentmind FaceLLM topic](https://www.emergentmind.com/topics/facellm) (unverified aggregator)
- **Bias / East Asian faces**: GPT-4o's race accuracy fell to 68% when East Asian and Southeast Asian were separate classes [PRE] — [arXiv 2410.24148](https://arxiv.org/pdf/2410.24148). In another study, LLaVA-1.5-7B predicted Southeast Asian faces as East Asian 73–84% of the time. Loose cropping raised one model's East Asian accuracy by 24.3 points, which means it relies on background cues [PRE] — [arXiv 2609.01318](https://arxiv.org/pdf/2609.01318) (per search snippet)
- Skin-tone labels are subjective even for humans. Within-rater agreement is high, but inter-annotator agreement is moderate to low [PEER, NeurIPS 2023 D&B] — [Consensus and Subjectivity of Skin Tone Annotation](https://arxiv.org/pdf/2305.09073). The GRAS benchmark found high demographic bias in 5 VLMs; the best GRAS Bias Score was 98, where 0 means unbiased [PRE] — [arXiv 2508.18989](https://arxiv.org/pdf/2508.18989v2)

### Inferences
- Small open VLMs are near chance on monolid/double-eyelid and lip-shape judgments, so the VLM should not be asked to perceive these. It should receive measured values and choose a style. The app's design (measurements go in as text, rule gates check the output) is consistent with the evidence.
- MiniCPM-V-8B looked relatively strong on FaceBench but weak (V2.5) on FaceXBench. Rankings are unstable across benchmarks, so an in-house check on our own photos is needed.
- CoT off (or a short rationale produced after the JSON decision) is the safer default for face tasks.

### Gaps
- No public benchmark found specifically for Korean or East Asian faces covering eyelid type, canthal tilt, or lip ratio. Face-MLLM's set is Chinese-aesthetics oriented, but its demographics are not stated.
- No published FaceBench/FaceXBench numbers found for Qwen2.5-VL/Qwen3-VL, InternVL3.5, Gemma 3 at 4–12B, or MiniCPM-V 4.x on eyelid or face-shape questions.
- Per-attribute numbers for face shape and skin tone at 7B scale: not found.

## Q2. What prior work uses LLMs/VLMs for makeup recommendation or beauty personalization?

### Takeaway
Research on makeup focuses mostly on generation and transfer (diffusion models). No peer-reviewed paper was found in which a VLM outputs structured makeup-technique choices (liner style, blush position) from face measurements. Industry uses LLMs mainly as a conversational layer on top of separate face or skin analysis tools.

### Cited Findings
- **BeautyBank** [PEER, WACV 2025]: encodes facial makeup in a latent space for transfer and editing. It is not an LLM recommender — [GitHub](https://github.com/CyberAgentAILab/BeautyBank)
- **DreamMakeup** [PRE]: training-free diffusion makeup customization. Text descriptions can come from an LLM — [arXiv 2510.10918](https://arxiv.org/abs/2510.10918)
- Face-MakeUp / Face-MakeUpV2 and FFHQ-Makeup: text-to-image makeup generation and datasets, not recommendation — [2501.02523](https://arxiv.org/html/2501.02523v1); [2510.21775](https://arxiv.org/pdf/2510.21775); [2508.03241](https://arxiv.org/pdf/2508.03241)
- **Amorepacific WANNA-BEAUTY AI** [IND, CES 2025 Innovation Award honoree]: a generative-AI voice chatbot. It analyzes skin tone, facial features and proportions from photos. It then gives makeup recommendations "trained with data from makeup artists," with virtual try-on built with KAIST. No accuracy data is published — [Amorepacific](https://www.apgroup.com/int/en/news/2025-01-06-1.html); [GCI](https://www.gcimagazine.com/brands-products/news/news/22930234/shiseido-china-research-center-co-ltd-new-beauty-tech-at-ces-2025-amorepacific-and-shiseido)
- **Amorepacific AI Beauty Counselor** [IND, Mar 2025]: uses GPT-4o and 4o-mini on Azure OpenAI with purchase history, reviews and skin diagnosis. Photo-based skin diagnosis was to be integrated later. No evaluation metrics are disclosed — [Microsoft Source Asia](https://news.microsoft.com/source/asia/features/meet-your-ai-beauty-counselor-k-beauty-giant-amorepacific-builds-an-ai-app-for-personalized-advice/)
- FaceInsight lists makeup analysis (type and application) among face-perception tasks, which shows makeup attributes appear in face-MLLM training data — [arXiv 2504.15624](https://arxiv.org/html/2504.15624)

### Inferences
- The "measurement to VLM chooses from an enum to rule gate" pattern appears to be novel in public literature. There is no external baseline to copy, so evaluation must be done in-house.

### Gaps
- "MakeupGPT"-style papers: not found. Olive Young, Chinese apps (Meitu etc.) and Perfect Corp LLM technical details were not verified in this pass.

## Q3. Do measured numbers vs. verbal descriptors, JSON schema, few-shot, or CoT help small VLMs follow given facts?

### Takeaway
Evidence is indirect but consistent. VLMs tend to follow text over image when the two conflict, especially on simple queries and with small models. So injected measurements are likely to be followed, including wrong ones. Pure numbers with no semantic label work worse for LLMs than natural-language templates. CoT tends to hurt face tasks. Constrained decoding makes schema validity essentially guaranteed and slightly improves task quality.

### Cited Findings
- VLMs favor text on simpler queries and shift toward the image as complexity rises. The image-vs-text preference ranges from +56.8% (image) to −74.4% (text) depending on task and model. Mitigations (prompt tweaks, explicit conflict instructions, decomposition) had mixed effect [PRE] — [arXiv 2504.08974](https://arxiv.org/abs/2504.08974)
- In clinical VLMs, conflicting text collapsed accuracy from 0.66–0.83 to 0.17–0.34. Between one-third and two-thirds of correct decisions flipped. Small open models (Qwen2-VL-7B, LLaVA-1.5-7B, MedGemma-4B) were the least robust. "Image-priority" prompting did not change behavior [PRE] — [arXiv 2605.17436](https://arxiv.org/html/2605.17436)
- In TabLLM, natural-language text templates ("feature is value") beat list or bare-value serialization zero-shot. Value-only serialization was poor at zero or few shots. Differences vanished at about 8 examples. LLMs struggle with numeric features that lack semantic meaning [PEER, AISTATS 2023] — [TabLLM PMLR](https://proceedings.mlr.press/v206/hegselmann23a/hegselmann23a.pdf); [arXiv 2210.10723](https://arxiv.org/pdf/2210.10723)
- CoT reduced face-task accuracy for small VLMs by up to about 12 points (FaceXBench, see Q1) — [arXiv HTML 2501.10360](https://arxiv.org/html/2501.10360)
- **JSONSchemaBench** [PRE; OpenReview version exists]: 10K real schemas, testing Guidance, Outlines, llama.cpp, XGrammar, OpenAI and Gemini. Constrained decoding speeds generation by up to 50% and improves downstream task accuracy by up to 4%. The best framework supports twice as many schemas as the worst — [arXiv 2501.10868](https://arxiv.org/abs/2501.10868)

### Inferences
- Send measurements as both a number and a label, for example `눈꼬리 기울기: +6.2° (올라감)` ("eye-corner tilt: +6.2° (upturned)"), so the fact is semantically anchored. The rule gate then protects against wrong numbers that the model follows faithfully.
- Use grammar- or schema-constrained decoding (llama.cpp GBNF / XGrammar / Outlines / Ollama `format`) with enums for liner, blush and similar fields. Put the Korean rationale in a bounded string field, and place the decision fields before the rationale.
- Give 2–4 few-shot examples mapping measurements to choices. TabLLM suggests about 8 examples erase serialization differences, but prompt length and VRAM on a 12GB card limit this.

### Gaps
- No study found that directly compares "numbers vs. verbal descriptors" for small VLMs with a face image. This should be tested in-house as an A/B condition.

## Q4. How should we design a small evaluation with 10–30 team photos?

### Takeaway
Small models are measurably non-deterministic even at temperature 0, so repeat each input. Measure four things: schema validity, gate-pass (agreement with measurements), self-consistency across repeats and small perturbations, and blinded human preference. Pass criteria below are proposals derived from the cited evidence, not published standards.

### Cited Findings
- Small 2–8B LLMs answered consistently on only about 50–80% of questions across 10 repeat trials at low temperature. Medium models (50–80B) were substantially more consistent. Accuracy among consistent answers tracks overall accuracy [PRE] — [arXiv 2509.09705](https://arxiv.org/abs/2509.09705)
- Up to 15% accuracy variation across runs with the same input under "deterministic" settings [PRE] — [arXiv 2604.22411](https://arxiv.org/html/2604.22411). The cause is batch-size-dependent numerics; batch-invariant kernels give identical results across 1,000 runs — [LLM Watch explainer](https://www.llmwatch.com/p/eli5-defeating-nondeterminism-in) (secondary)
- Predictions can flip under semantically equivalent prompt wording [PRE] — [arXiv 2609.00293](https://arxiv.org/html/2609.00293) (per search snippet)
- Human skin-tone labels have low inter-rater agreement, so human-rated ground truth needs multiple raters — [arXiv 2305.09073](https://arxiv.org/pdf/2305.09073)
- A general guide to evaluating LLM systems [PRE] — [arXiv 2506.13023](https://arxiv.org/pdf/2506.13023)

### Inferences — concrete protocol (proposal)
1. **Set**: 20–30 frontal bare-face photos, with the team's consent, covering monolid, inner-fold and double eyelids, up- and down-turned tilt, and varied lip ratios. Include 3–5 borderline cases, such as tilt near 0°.
2. **Conditions**: (A) numbers plus Korean labels, (B) labels only, (C) numbers only, and optionally (D) image without measurements, to measure how much the model relies on the image. Keep CoT off. Test with and without constrained decoding.
3. **Repeats**: at temperature 0, run each photo 5–10 times (the 10-repeat design follows arXiv 2509.09705). Also run 2 paraphrased prompts and 2 image perturbations: slight crop or brightness change, and a second photo of the same person.
4. **Metrics**:
   - Schema validity rate: parses and passes schema and enums. Target 100% with constrained decoding; report the unconstrained rate separately.
   - Gate-pass rate: share of proposals the rule gate does not reject. Target at least 95%. Also log which rule failed.
   - Self-consistency: per field, the modal-answer share across repeats and Fleiss' κ across runs. For ordinal intensity, report the standard deviation. A proposed target is at least 90% identical categorical fields on identical input.
   - Perturbation stability: whether the field agrees between photos of the same person.
   - Counterfactual sensitivity: flip one measurement (for example tilt +6° to −6°). The liner choice should change as the rules expect. This tests whether the model uses the given fact.
   - Rationale faithfulness: whether the Korean rationale cites the measurement correctly (manual or regex check), plus a Korean fluency and "no-mention-of-unseen-attributes" check for hallucination.
   - Human preference: 3 or more raters, ideally including a makeup-literate member. Show the VLM proposal and a rule-only baseline in random order, then a pairwise choice plus a 1–5 appropriateness score. Report win rate with a binomial CI and inter-rater κ.
5. **Latency and VRAM** on the RTX 3060 12GB, reported as p50/p95, since repeats multiply cost.
6. **Decision rule**: choose the model or condition with 100% schema validity and at least 95% gate-pass that beats the rule-only baseline on preference. Consistency is the tie-breaker. With 20–30 photos, only large effects can be detected; treat the results as a screening test, not proof.

### Gaps
- No published standard pass thresholds exist for this kind of task. The targets above are engineering proposals.
- No published human-preference protocol for makeup recommendations was found.
