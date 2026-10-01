# Open-weight small/medium VLM candidates (2026) for a Korean makeup-coaching service on one RTX 3060 12GB

Research date: 2026-09-29. Scope: ~2B–12B open-weight VLMs that could run locally (no cloud) on one RTX 3060 12GB under Windows. 20 tool calls were used. Every number below comes from the linked page. Numbers from aggregators are marked "(secondary)". Anything not found is listed under Gaps.

## Which open VLM families are current in 2026 in the ~2B–12B range, and what are their latest versions?

### Takeaway
The newest general-purpose small VLMs are **Qwen3.5 Small** (0.8B/2B/4B/9B, natively multimodal, released March 2026) and **Gemma 4** (E2B/E4B/12B, plus larger 26B-A4B and 31B, released 2026). The 2025 generation is still widely used: Qwen3-VL-4B/8B, InternVL3.5-4B/8B and MiniCPM-V 4.5 (8.7B). Four Korean-developed VLMs are open-weight: Kanana-1.5-v-3b (Kakao), HyperCLOVAX-SEED-Vision-Instruct-3B and SEED-Omni-8B (Naver), VARCO-VISION-2.0 1.7B/14B (NCSOFT) and EXAONE 4.5 (LG). EXAONE 4.5 is 33B, too large for a 3060, and non-commercial.

### Candidate table (10 models)

| # | Model | Params | Release | License / commercial use | Image input | Key published scores | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Qwen3.5-9B** (also 4B / 2B) | 9B | Feb–Mar 2026 | Apache-2.0: commercial use OK | Native multimodal (early fusion) | MMMU 78.4, MMMU-Pro 70.1, MMBench 90.1, OCRBench 89.2, RealWorldQA 80.3, MMStar 79.7, HallusionBench 69.3 | Current |
| 2 | **Gemma 4 E4B / 12B** (also E2B) | E4B: 8B total / 4.5B effective; 12B: 11.95B | Apr 2026 (Google blog/search) vs "July 2026" (model card); conflict unresolved | Apache-2.0 (first Gemma with this license) | Variable resolution with visual token budgets of 70/140/280/560/1120 | MMMU-Pro: 12B 69.1, E4B 52.6, E2B 44.2. MATH-Vision: 12B 79.7, E4B 59.5 | Current |
| 3 | **Qwen3-VL-8B / 4B-Instruct** | 8B card lists "9B" | late 2025 | Apache-2.0 | OCR in 32 languages; 256K context | Numbers not extracted (card shows charts only) | Superseded by Qwen3.5 but still maintained |
| 4 | **MiniCPM-V 4.5** | 8.7B (Qwen3-8B + SigLIP2-400M) | Sep 2025 | Apache-2.0 (feedback questionnaire optional) | Up to 1.8MP (1344×1344), fewer visual tokens | OpenCompass avg 77.0. Claims top OCRBench, above GPT-4o-latest | 2025 generation |
| 5 | **InternVL3.5-8B** (also 4B) | 8.5B (InternViT-300M + Qwen3-8B) | Aug 2025 | Apache-2.0 | Dynamic 448px tiles, up to 12 tiles | MMMU 73.4, OCRBench 840/1000 (secondary, DataCamp) | 2025 generation |
| 6 | **Kanana-1.5-v-3b-instruct** (Kakao) | 3.67B | 2025-07-24 | **Kanana License**: conditional, see below | Multi-image, PIL RGB | Korean average 68.27 (KoOCRBench 85.93, Korean chart 84.96). English average 74.00 (DocVQA 93.06, ChartQA 81.20, OCRBench 82.50). MIABench 90.28, Korean MIABench 91.17 | Korean, 2025 |
| 7 | **HyperCLOVAX-SEED-Vision-Instruct-3B** (Naver) | 3.63B | 2025-04-22 | "hyperclovax-seed" custom license; terms not verified | 378px grid, AnyRes up to 9 grids (~1.29MP) | MMBench-val 81.8, TextVQA 79.2, K-VisIT-Bench 37.0, KoNet 69.2 | Korean, 2025 |
| 8 | **HyperCLOVAX-SEED-Omni-8B** (Naver) | 8B any-to-any | ~late 2025/2026 | Custom "HyperCLOVA X SEED 8B Omni Model License" | Image/video/audio input | Evaluated on K-MMBench, SEED-IMG, AI2D; numbers not extracted | **Not viable**: card says it needs 4× A100 80GB (~48GB for encoders and decoders) |
| 9 | **VARCO-VISION-2.0-1.7B / 14B** (NCSOFT) | 1.7B / ~15B | 2025-07-16 | **CC-BY-NC-4.0: commercial use not allowed** | AnyRes tiling (SigLIP2 + Qwen3). Upscale to 2304px recommended for OCR | 14B: K-MMBench 87.7, K-SEED 77.2, K-MMStar 63.6, K-LLaVA-W 94.1, OCRBench 86.9. 1.7B: K-MMBench-dev 77.9 | Excluded because of the license |
| 10 | **EXAONE 4.5** (LG) | 33B (1.2B vision encoder) | 2026-04-09 | EXAONE AI Model License 1.2-**NC** (non-commercial) | – | Claims top results on Korean context and documents | Excluded: size and license |

### Cited Findings
- Qwen3.5-9B: Apache-2.0, released Feb 2026. MMMU 78.4, MMMU-Pro 70.1, MMBench 90.1, OCRBench 89.2, RealWorldQA 80.3, MMStar 79.7, HallusionBench 69.3. Covers 201 languages and dialects. Thinking mode is on by default; turn it off with `enable_thinking: False`. Recommended runtimes are vLLM, SGLang and Transformers. — [HF Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
  - The card summary called the architecture "Gated DeltaNet + sparse MoE". The 9B is marketed as a small dense model, so the MoE claim is doubtful and should be checked on the card.
- Qwen3.5 Small (0.8B/2B/4B/9B) was released 2026-03-02. It is trained with early fusion on multimodal tokens. At 4-bit, the 9B needs about 6GB and the 4B about 3GB. — [MarkTechPost](https://www.marktechpost.com/2026/03/02/alibaba-just-released-qwen-3-5-small-models-a-family-of-0-8b-to-9b-parameters-built-for-on-device-applications/), [VentureBeat](https://venturebeat.com/technology/alibabas-small-open-source-qwen3-5-9b-beats-openais-gpt-oss-120b-and-can-run)
- Gemma 4 sizes: E2B (2.3B effective / 5.1B total), E4B (4.5B / 8B), 12B (11.95B), 26B-A4B MoE and 31B. License is Apache-2.0. Supports 35+ languages out of the box and was pretrained on 140+. Visual token budgets are 70–1120. Has native structured tool use. The 12B is a "unified" encoder-free design. — [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)
- Gemma 4 release is given as April 2026 by [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) and [Wikipedia](https://en.wikipedia.org/wiki/Gemma_(language_model)). This conflicts with the model card, which says July 2026 (possibly the date of the 12B addition or a card update).
- Qwen3-VL-4B and 8B are Apache-2.0, OCR covers 32 languages, and context is 256K. — [HF Qwen3-VL-8B](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct), [HF Qwen3-VL-4B](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct)
- MiniCPM-V 4.5: 8.7B, Apache-2.0, up to 1.8MP, OpenCompass 77.0. Supports 30+ languages (Korean not named). GGUF and int4 builds exist, and llama.cpp supports it from b6282. — [HF MiniCPM-V-4_5](https://huggingface.co/openbmb/MiniCPM-V-4_5)
- InternVL3.5-8B: Apache-2.0, 448px tiles with up to 12 tiles, supported by LMDeploy and vLLM. — [HF InternVL3_5-8B](https://huggingface.co/OpenGVLab/InternVL3_5-8B). MMMU 73.4 and OCRBench 840 — [DataCamp (secondary)](https://www.datacamp.com/blog/top-vision-language-models)
- Kanana-1.5-v-3b scores are as in the table above. It is Korean/English only and has not been evaluated in other languages. — [HF kanana-1.5-v-3b-instruct](https://huggingface.co/kakaocorp/kanana-1.5-v-3b-instruct)
- HyperCLOVAX-SEED-Vision-3B specs and scores are as in the table above. — [HF card](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Vision-Instruct-3B)
- HyperCLOVAX-SEED-Omni-8B deployment requires 4× A100 80GB. — [HF card](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Omni-8B)
- VARCO-VISION-2.0 is CC-BY-NC-4.0. Its Korean scores are compared with Qwen2.5-VL-7B (K-MMBench 84.7, K-MMStar 49.3) and InternVL3-14B (K-MMBench 89.1, K-MMStar 64.9). — [HF VARCO-VISION-2.0-14B](https://huggingface.co/NCSOFT/VARCO-VISION-2.0-14B), [tech report](https://arxiv.org/html/2509.10105)
- EXAONE 4.5: 33B, license is EXAONE 1.2-NC. — [GitHub](https://github.com/LG-AI-EXAONE/EXAONE-4.5), [arXiv](https://arxiv.org/html/2604.08644v1)
- Kakao's newer omni model, Kanana-1.5-o-9.8B-instruct-2602, was released as an **API**. Its HF repo is "API_Doc", so it does not appear to be open weights. — [HF](https://huggingface.co/kakaocorp/Kanana-1.5-o-9.8B-instruct-2602-API_Doc)

### Inferences
- A 9B/8B model at 4-bit (about 6GB), or at 8-bit if it fits, leaves room for image tokens on 12GB. 12B-class models (Gemma 4 12B) need 4-bit quantization and a modest visual token budget.
- Qwen3.5-9B has the strongest published general vision scores among the models that fit.

### Gaps
- Phi-4-multimodal, Llama vision (3.2-11B or later), Pixtral/Mistral Small vision and SmolVLM2 were not researched within the tool budget. Their status and licenses are unverified here.
- Qwen3-VL-8B/4B benchmark numbers were not extracted.
- Gemma 4 MMBench and OCRBench scores were not on the card extract.
- Whether HyperCLOVAX has a newer small vision model after SEED-Vision-3B (e.g., a Think-14B with vision) was not confirmed.

## Which have licenses allowing commercial deployment?

### Takeaway
Apache-2.0, so commercial use is allowed: Qwen3.5, Qwen3-VL, Gemma 4, MiniCPM-V 4.5 and InternVL3.5. Kanana-1.5-v-3b uses a custom license that requires attribution and **needs a separate commercial license for on-premise/SI solutions, API/cloud offering or on-device embedding**. VARCO-VISION-2.0 and EXAONE 4.5 are **non-commercial**.

### Cited Findings
- Kanana License terms: commercial use needs a separate license if you (i) offer API/cloud access, (ii) provide SI or on-premise solutions, (iii) embed in on-device domains, or have more than 10M MAU. Required: display "Powered by Kanana", include the copyright notice, and prefix derivative model names with "Kanana". — [Kanana LICENSE](https://huggingface.co/kakaocorp/kanana-1.5-v-3b-instruct/blob/main/LICENSE)
- Kakao's own press release says the July 2025 release is "Apache 2.0, permitting commercial use". — [Kakao press](https://www.kakaocorp.com/page/detail/11671?lang=ENG). **This conflicts with the model repo's LICENSE file**, which is the Kanana License. Apache may apply only to the text/MoE models, so treat the repo file as authoritative.
- VARCO-VISION-2.0 is CC-BY-NC-4.0. — [HF](https://huggingface.co/NCSOFT/VARCO-VISION-2.0-14B)
- EXAONE 4.5 is NC. — [GitHub](https://github.com/LG-AI-EXAONE/EXAONE-4.5)
- Gemma 4 moved to Apache-2.0, dropping the earlier Gemma Terms of Use. — [Gemma 4 card](https://ai.google.dev/gemma/docs/core/model_card_4)

### Inferences
- Self-hosting Kanana on the academy PC to serve our own web service may fall under the "on-premise solutions" clause. This is ambiguous and needs legal review or a question to Kakao. The Apache-2.0 models avoid that risk.

### Gaps
- The full text of the HyperCLOVAX SEED license (commercial terms, MAU caps) was not retrieved. The card extract listed no restrictions, but the LICENSE file should be read directly.

## Which are strongest at Korean text generation?

### Takeaway
On published Korean VLM benchmarks, the Korean-built models (VARCO-2.0, Kanana-v-3b) report the best results for their size. VARCO is non-commercial, though. No source directly compares Qwen3.5 or Gemma 4 on Korean VLM benchmarks. Qwen claims 201 languages and Gemma 4 claims 35+ out of the box.

### Cited Findings
- Kanana-1.5-v-3b beats HCX-SEED-Vision-3B, Qwen2.5-VL-3B and InternVL2.5-4B on Korean benchmarks (average 68.27). — [HF Kanana](https://huggingface.co/kakaocorp/kanana-1.5-v-3b-instruct)
- HCX-SEED-Vision-3B's Korean text ability drops compared with its text-only base (KMMLU 44.22 vs 48.47). Korean VisIT-Bench is 37.0. — [HF HCX](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Vision-Instruct-3B)
- Qwen2.5-VL-7B scores K-MMStar 49.3 vs VARCO-14B 63.6, a gap on Korean reasoning. The two are tied on K-LLaVA-W (Korean free-form generation) at 94.1. — [HF VARCO](https://huggingface.co/NCSOFT/VARCO-VISION-2.0-14B)
- KOFFVQA is a Korean free-form VQA benchmark: 275 questions with rule-based grading. Its leaderboard covered 81 VLMs as of 2025-04-25, so it predates Qwen3.5 and Gemma 4. — [GitHub KOFFVQA](https://github.com/maum-ai/KOFFVQA), [leaderboard](https://huggingface.co/spaces/maum-ai/KOFFVQA-Leaderboard)
- K-MMBench is published by NCSOFT. — [HF dataset](https://huggingface.co/datasets/NCSOFT/K-MMBench)

### Inferences
- For natural Korean coaching text, the family matters less than whether there is a Korean in-house eval set. Build a small Korean makeup-feedback eval of about 30–50 photos and run each shortlisted model on it.

### Gaps
- No K-MMBench or KOFFVQA scores were found for Qwen3.5, Qwen3-VL, Gemma 4, MiniCPM-V 4.5 or InternVL3.5.
- The actual KOFFVQA leaderboard rows were not retrieved because the Space did not render through fetch.

## Which support constrained/structured JSON output well?

### Takeaway
JSON reliability comes mainly from the **serving layer**: vLLM structured outputs with the xgrammar backend, or llama.cpp grammars. Any model served that way gets schema-constrained decoding. Model-side, Qwen3.5 (tool calling) and Gemma 4 ("native structured tool use") advertise it. No Korean model card documents JSON mode.

### Cited Findings
- vLLM guided decoding masks invalid tokens per step and supports full JSON Schema. Its backends are xgrammar, lm-format-enforcer and others. — [vLLM docs](https://docs.vllm.ai/en/latest/features/structured_outputs/), [Red Hat](https://developers.redhat.com/articles/2025/06/03/structured-outputs-vllm-guiding-ai-responses)
- Gemma 4 has "native support for structured tool use". — [Gemma 4 card](https://ai.google.dev/gemma/docs/core/model_card_4)
- Qwen3.5 supports tool calling and JSON through serving frameworks. — [HF Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)
- VARCO notes "unusually low" MMLU for some models due to output-format issues. — [HF VARCO](https://huggingface.co/NCSOFT/VARCO-VISION-2.0-14B)
- MiniCPM-V 4.5 runs in llama.cpp and GGUF. — [HF](https://huggingface.co/openbmb/MiniCPM-V-4_5)

### Inferences
- vLLM does not officially support native Windows, and running it in WSL2 is likely needed (not verified in this research). On native Windows, llama.cpp or Ollama with a JSON-schema grammar is the practical path, if the model has GGUF and mmproj support.
- Qwen3.5 has thinking on by default. Turn it off, or strip `<think>`, before JSON-constrained output.

### Gaps
- No benchmark measuring JSON-schema adherence for these VLMs was found.
- llama.cpp support status for Qwen3.5 vision and Gemma 4 vision was not verified here.

### Shortlist (4–5) for the RTX 3060 12GB, commercial use, Korean
1. **Qwen3.5-9B** (fallback: Qwen3.5-4B): Apache-2.0 and the strongest published vision scores (MMBench 90.1, OCRBench 89.2, HallusionBench 69.3). Thinking must be turned off for latency and JSON. Korean ability is unmeasured on Korean VLM benchmarks.
2. **Gemma 4 E4B or 12B (4-bit)**: Apache-2.0, adjustable visual token budget, native structured tool use. The E4B is weaker (MMMU-Pro 52.6); the 12B fits only with tight quantization.
3. **Qwen3-VL-8B-Instruct**: Apache-2.0, mature tooling, a non-thinking Instruct variant. A 2025 model, superseded by Qwen3.5.
4. **MiniCPM-V 4.5**: Apache-2.0, high-resolution (1.8MP) and token-efficient, with GGUF and llama.cpp support that suits Windows. Korean ability not documented.
5. **Kanana-1.5-v-3b-instruct** as the Korean-native comparison: best published Korean scores at 3B. Its **license needs review** (on-premise clause, "Powered by Kanana" display).

Excluded: VARCO-VISION-2.0 (CC-BY-NC), EXAONE 4.5 (33B, NC), HyperCLOVAX-SEED-Omni-8B (needs 4× A100). HyperCLOVAX-SEED-Vision-3B is a possible sixth pending its license text.

Known weaknesses to test for makeup use: none of the sources evaluate fine-grained color, shade or skin-tone perception. All the scores above are generic (OCR, charts, MMBench). Makeup-specific ability has to be measured with an in-house eval set.
