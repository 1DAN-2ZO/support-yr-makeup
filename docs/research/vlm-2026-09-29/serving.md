# Serving ~2B–12B VLMs locally on one RTX 3060 12GB (Windows 10 Home), as of Sep 2026

Research date: 2026-09-29. About 17 search/fetch calls. **Main gap: I found no published VLM-specific TTFT or image-prefill timings on an RTX 3060.** The throughput numbers below are for text-only models of the same size on a 3060. Treat them as an upper bound for the decode phase only.

## 1. Which runtimes support VLMs and run on Windows (natively or via WSL2)? Windows caveats in 2026

### Takeaway
On Windows 10 Home the easiest native routes are llama.cpp (`llama-server` + `--mmproj`) and Ollama/LM Studio, which are both built on llama.cpp. LMDeploy also claims native Windows support (TurboMind, tp=1). vLLM and SGLang are Linux-first. On this machine they realistically run under WSL2 or Docker Desktop (WSL2 backend). Community native-Windows vLLM forks exist but are unofficial and fast-moving.

### Cited Findings
- vLLM has no official Windows support as of May 2026. Its install docs list Linux GPU/CPU targets, not Windows — [fazm.ai](https://fazm.ai/t/vllm-windows-support-2026); [DEV "vllm-review-2026"](https://dev.to/jovan_chan_9500711396d4e6/vllm-review-2026-5gmc)
- There are three working vLLM-on-Windows paths: (1) WSL2, which the vLLM team recommends and which behaves like a Linux server; (2) Docker Model Runner with a vLLM backend (added Dec 2025, needs Docker Desktop 4.54+, WSL2, and an NVIDIA GPU with compute capability ≥ 8.0; the 3060 is sm_86, so it qualifies); (3) the community fork SystemPanic/vllm-windows (v0.20.0, 30 Apr 2026, Python 3.12, CUDA 13, PyTorch 2.11) — [fazm.ai](https://fazm.ai/t/vllm-windows-support-2026); [Docker blog](https://www.docker.com/blog/docker-model-runner-vllm-windows/)
- The same page reports roughly a 20–40% throughput penalty for WSL2 compared with native Linux. This is a secondary-blog figure and was not independently verified — [fazm.ai](https://fazm.ai/t/vllm-windows-support-2026)
- More native-Windows vLLM builds exist (aivrar/vllm-windows-build: 0.27.1 / 0.29.0 with CUDA 13.x; AviBackToBlack/vllm-windows-native releases dated Sep 2026). All are unofficial community projects — [aivrar/vllm-windows-build](https://github.com/aivrar/vllm-windows-build); [AviBackToBlack/vllm-windows-native](https://github.com/AviBackToBlack/vllm-windows-native/releases/tag/release/sm20e-acceptance-20260927-01)
- One search snippet said native Windows vLLM "requires CUDA 13.0 and RTX 6000 Ada or newer" and that WSL2 is more reliable for older hardware. I could not confirm this in the primary source, so treat it as unverified — [Dasroot](https://dasroot.net/posts/2026/05/run-vllm-natively-windows-without-wsl/) (snippet only)
- Qwen3-VL needs `vllm>=0.11.0`. Qwen also publishes a Docker image `qwenllm/qwenvl:qwen3vl-cu128` and lists SGLang as an alternative — [Qwen3-VL README](https://github.com/QwenLM/Qwen3-VL/blob/main/README.md)
- SGLang does not support Windows or macOS because it depends on Linux-specific CUDA kernels. WSL2 is the recommended route — [sglang Discussion #4095](https://github.com/sgl-project/sglang/discussions/4095); [WSL2 + CUDA 12.8 gist](https://gist.github.com/dtunai/5a403eb5ef5cce63b100d3d4e45858d1)
- Unsloth Studio now installs vLLM/SGLang on Windows by setting up a private WSL2 Ubuntu 24.04 distro automatically — [unsloth PR #12024](https://github.com/unslothai/unsloth/pull/12024)
- llama.cpp `llama-server` serves VLMs by pairing `-m model.gguf` with `--mmproj mmproj.gguf`. The mmproj file downloads automatically with `--hf-repo`. It exposes an OpenAI-compatible `/v1/chat/completions` that accepts base64 images — [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md); [multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Qwen publishes official GGUFs (including mmproj) for Qwen3-VL-8B-Instruct and shows `llama-server` usage — [Qwen/Qwen3-VL-8B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF)
- Known llama.cpp VLM bug: with Qwen3-VL-8B on llama-server, the second consecutive multimodal request came back as gibberish ("????"), which suggests the KV cache was not released. `/slots/reset` returned 501. It was reported on Jetson Orin/ARM64 Linux, is marked "bug-unconfirmed/stale", and no fix is recorded — [llama.cpp #17200](https://github.com/ggml-org/llama.cpp/issues/17200)
- Another llama.cpp mmproj issue: for Qwen3.5-122B the CLIP graph uses operators the backend does not support. This is not relevant to small models but shows mmproj support varies by model and backend — [llama.cpp #21268](https://github.com/ggml-org/llama.cpp/issues/21268)
- LMDeploy says it supports LLM/VLM deployment on Linux and Windows (CUDA ≥ 11.3). Windows support is TurboMind with tp=1. The default wheels are built on CUDA 12.8. Its VLM list includes Qwen2.5-VL, Qwen3-VL (2B–235B), InternVL3/3.5, Gemma3, MiniCPM-V 2.6 and Phi-3.5-vision. Docs are v0.13.0 (May/Jun 2026) and PyPI lists 0.17.0 — [LMDeploy GitHub](https://github.com/InternLM/lmdeploy); [LMDeploy docs PDF](https://lmdeploy.readthedocs.io/_/downloads/en/latest/pdf/); [PyPI](https://pypi.org/project/lmdeploy/0.17.0/)
- LMDeploy has two engines. TurboMind is C++/CUDA and built for performance. The PyTorch engine is pure Python. Model support differs between them — [LMDeploy GitHub](https://github.com/InternLM/lmdeploy)

### Inferences
- The lowest-friction, native-Windows choice for a 3060 is llama.cpp `llama-server` (prebuilt CUDA Windows binaries) or Ollama. Both install without WSL2.
- If the team wants vLLM's features (xgrammar guided decoding, the batch-invariant deterministic mode), the supported route is WSL2 or Docker Desktop. This costs extra RAM and disk and may cost some throughput.
- LMDeploy on native Windows is plausible, but I found no 2026 user report confirming TurboMind + a VLM on Windows with a 30-series card. Test it before committing.
- TensorRT-LLM, HF transformers, and LM Studio were not researched in depth (see Gaps).

### Gaps
- TensorRT-LLM Windows status in 2026 and its VLM support on consumer Ampere: not researched.
- LM Studio: I found no primary source on its VLM/structured-output behaviour. I believe it uses llama.cpp and MLX engines, but I did not verify this.
- HF transformers is expected to be slow (one Qwen3-VL-8B issue reports minutes per image on some hardware: [Qwen3-VL #1923](https://github.com/QwenLM/Qwen3-VL/issues/1923), not fetched in full). I did not verify the hardware or details.

## 2. Which runtimes support constrained decoding (JSON schema / grammar)?

### Takeaway
All the main candidates support schema-constrained JSON. llama.cpp uses GBNF grammars or JSON schema (`--json-schema`, `response_format`). Ollama uses the `format` field with a JSON schema. vLLM uses guided decoding (xgrammar/outlines backends). Constrained decoding works with vision input on llama.cpp and Ollama.

### Cited Findings
- llama-server supports `--grammar` / `--grammar-file` (GBNF) and `--json-schema` / `--json-schema-file`. `/v1/chat/completions` accepts `response_format` as `{"type":"json_object"}` or a schema-constrained object — [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- Ollama supports structured outputs through a JSON schema in the `format` parameter. Pydantic `model_json_schema()` works. The blog example uses the vision model `llama3.2-vision`, which shows it works with images. Ollama recommends temperature 0 for schema adherence — [Ollama blog: Structured outputs](https://ollama.com/blog/structured-outputs); [Towards Data Science](https://towardsdatascience.com/structured-llm-output-using-ollama-73422889c7ad/)
- Deeply nested or recursive schemas may cause problems in Ollama. Keep schemas simple — [glukhov.org](https://www.glukhov.org/post/2025/09/llm-structured-output-with-ollama-in-python-and-go/)
- NVIDIA NIM for VLMs also documents structured generation (JSON schema, regex, choice). It is a Linux container, so it is included only for reference — [NVIDIA NIM VLM structured generation](https://docs.nvidia.com/nim/vision-language-models/1.7.0/structured-generation.html)

### Inferences
- For a ~300-token fixed-shape JSON, constraining with a flat schema on llama.cpp or Ollama should prevent parse failures. Grammar overhead per token is usually small, but I found no 3060-specific measurement.

### Gaps
- vLLM's current guided-decoding docs (xgrammar default, `structured_outputs` / `guided_json` parameter names in 2026) were not fetched. The parameter names changed across 0.x releases, so check the docs for the installed version.
- LMDeploy's guided decoding / JSON-schema support for VLMs: not confirmed in the sources I fetched.

## 3. VRAM at 4/8-bit for 3B / 4B / 7–8B / 12B VLMs; image token counts; resolution vs prefill

### Takeaway
A 7–8B VLM at Q4_K_M/AWQ fits in 12 GB with room for a few thousand tokens of context. 12B at 4-bit is tight but possible, with small context and one slot. 3–4B models fit easily, even at 8-bit. The image token count is the main prefill cost and can be controlled. Qwen2.5-VL uses 1 token per 28×28 px. Qwen3-VL uses 1 token per 32×32 px, with a recommended 256–1280 tokens per image. Gemma 3 uses a fixed 256 tokens per 896×896 crop.

### Cited Findings
- Qwen3-VL-8B: Q4_K_M GGUF needs about 8–12 GB VRAM and Q8_0 about 12–16 GB, so Q8 of 8B does not comfortably fit a 3060 — [modelfit.io/gpu/rtx-3060](https://modelfit.io/gpu/rtx-3060/) (aggregator, moderate reliability)
- Qwen2.5-VL: each visual token covers a 28×28 px area (14 px patches, 2×2 merge). The default range is 4–16384 visual tokens per image. `min_pixels`/`max_pixels` can cap it, e.g. to 256–1280 tokens. The model's `max_pixels` ceiling is 12,845,056 (= 16384 × 28²) — [Qwen2.5-VL-7B-Instruct model card](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct); [mlx-vlm #1175](https://github.com/Blaizzy/mlx-vlm/issues/1175)
- mlx-vlm #1175 argues the default `max_pixels` is 12× the training resolution and hurts grounding accuracy. So capping pixels can help quality as well as speed — [mlx-vlm #1175](https://github.com/Blaizzy/mlx-vlm/issues/1175)
- Qwen3-VL: patch size 16 with 32× spatial compression (one token ≈ 32×32 px). The recommended range is 256–1280 image tokens. `resized_height`/`resized_width` round to multiples of 32. Sizes: 2B, 4B, 8B (Instruct/Thinking), 30B-A3B, 235B-A22B. FP8 variants exist — [Qwen3-VL README](https://github.com/QwenLM/Qwen3-VL/blob/main/README.md)
- Qwen2.5-VL has official AWQ versions at 3B/7B/72B, and Qwen2-VL had GPTQ-Int4/Int8 — [Qwen3-VL README](https://github.com/QwenLM/Qwen3-VL/blob/main/README.md)
- Gemma 3 (4B/12B/27B) uses a 400M SigLIP encoder at 896×896. Each image becomes 256 tokens (4×4 average pooling). Optional pan-and-scan crops add another 256 tokens per crop — [Google Gemma vision docs](https://ai.google.dev/gemma/docs/capabilities/vision); [Gemma 3 Technical Report](https://arxiv.org/pdf/2503.19786)
- Image tokens are prefilled like a longer text prompt: more image tokens mean more compute and more KV cache per request — [Spheron blog](https://www.spheron.network/blog/cost-per-token-for-vision-language-models-image-tokens-cost-/)
- Ollama KV cache quantization: `OLLAMA_KV_CACHE_TYPE=q8_0` uses about half the memory of f16, and `q4_0` about a quarter. Flash attention reduces memory at long context — [Ollama FAQ](https://docs.ollama.com/faq)
- A Qwen2.5-VL-3B user reports an 8 GB RTX 3060 seemed insufficient (thread title; not read in full) — [HF discussion](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/discussions/20)
- vLLM reserves 90% of GPU memory by default (`--gpu-memory-utilization`). Quantization shrinks weights but the value still needs tuning — [Qwen vLLM docs](https://qwen.readthedocs.io/en/v2.5/deployment/vllm.html)

### Inferences (my estimates — not measured)
- Weights only, approximately: 4-bit ≈ 0.55–0.6 GB per 1B params. So ~4.5–5 GB for 8B, ~7 GB for 12B, ~2.5 GB for 4B. Add the vision encoder / mmproj (Qwen ViT ≈ 0.6B params, Gemma SigLIP 400M, both usually kept at f16 → ~0.8–1.3 GB) and CUDA context (~0.5 GB).
- A 7–8B Q4 VLM therefore needs about 7–8 GB before KV cache. That leaves ~3–4 GB for a 4k context at batch 1, which is enough for 1 image (~256–1280 tok) + 1–2k text + 300 output.
- Gemma 3 12B at Q4 comes to roughly 9–10 GB before KV. It fits for one request at short context; KV-cache quantization helps.
- To keep prefill small and predictable, fix the input resolution. For Qwen3-VL, e.g. 512×512 → (512/32)² = 256 tokens; for Qwen2.5-VL, 448×448 → 256 tokens. The total prompt stays around 1.5–2.5k tokens.

### Gaps
- No primary measurement of total VRAM (weights + ViT + KV) for specific VLMs on a 3060.
- Token counts for InternVL3/3.5 (448 px tiles, 256 tokens per tile with dynamic tiling), MiniCPM-V and Phi-4-multimodal were not verified in this session.

## 4. Measured tokens/sec and TTFT on RTX 3060 12GB

### Takeaway
There are reliable text-only decode numbers for the 3060. I found no reliable VLM TTFT or image-prefill numbers for the 3060. On text-only Q4_K_M models under llama.cpp, a 3060 decodes ~42–70 tok/s for 7–8B and ~128 tok/s for 3B, so a 300-token output costs roughly 4.5–7 s for 7–8B and ~2.5 s for 3–4B, **before** prefill.

### Cited Findings
- RTX 3060 12GB, llama.cpp router mode, Q4_K_M, Debian 13, 8k context: Llama-3.1-8B 64.5 t/s, Qwen2.5-Coder-7B 69.3 t/s, Llama-3.2-3B 128.3 t/s, Qwen2.5-Coder-14B 35.8 t/s, Qwen3-14B 33.4 t/s, Llama-3.2-1B 211.9 t/s. "20B models don't fit." The only VLM tested (MiMo-VL-7B Q4_K_M) had poor text-benchmark scores, and no image speed was reported — [tyolab.com (May 2026)](https://www.tyolab.com/blog/2026/05/11-64gb-ram-12gb-vram-the-honest-local-llm-benchmark/)
- RTX 3060 12GB runs Qwen2.5-7B Q4_K_M at about 55–63 tok/s — [SpecPicks](https://specpicks.com/reviews/qwen2-5-7b-rtx-3060-12gb-vs-ryzen-5-5600g-igpu-2026) (review aggregator, moderate reliability)
- The same source family puts the RTX 3060 at about 42 tok/s for 8B models with llama.cpp — [modelfit.io](https://modelfit.io/gpu/rtx-3060/)
- One GitHub issue says Qwen3-VL-8B inference takes minutes per image (search snippet mentions 5–7 min with HF transformers). The hardware is unclear, and this reflects unoptimised transformers use rather than llama.cpp/vLLM — [Qwen3-VL #1923](https://github.com/QwenLM/Qwen3-VL/issues/1923)

### Inferences (estimates, clearly not measured)
- 300-token JSON output at batch 1 on a 3060:
  - 7–8B Q4: 300 / (42–65 t/s) ≈ **4.6–7.1 s** of decode alone. This misses or only just meets a 3–5 s target.
  - 3–4B Q4/Q8: 300 / (~100–130 t/s) ≈ **2.3–3 s** of decode.
  - 12B Q4: 300 / (~35–40 t/s, extrapolated from 14B at 33–36) ≈ **7.5–9 s**. This misses the target.
- Prefill: ~1.5–2.5k tokens plus the ViT encode of one image. No 3060 VLM prefill figure was found. On Ampere, llama.cpp text prompt-processing for 7–8B is generally in the high hundreds to low thousands of tok/s, which would add about 1–2 s, but that is not sourced here. Measure it with `llama-bench` / the server's `timings` field.
- Conclusion for the 3–5 s budget: a **2B–4B VLM** (e.g. Qwen3-VL-4B/2B, Gemma 3 4B) at Q4–Q8, with image tokens capped at ~256 and a flat schema, is the realistic fit. 7–8B only fits if the output is shortened (e.g. ≤150 tokens via compact keys/enums) or if decode speed on the actual box beats ~65 t/s. JSON with short keys and enum values also cuts output tokens.

### Gaps
- No RTX 3060 (or 3060-class 12 GB Ampere) TTFT or image-encode timing for Qwen2.5-VL/Qwen3-VL/Gemma 3/MiniCPM-V/InternVL/Phi-4-MM on any runtime. Recommend benchmarking on the target machine.
- No vLLM/AWQ decode numbers on a 3060 were found.

## 5. Determinism: does temperature 0 / greedy decoding give identical outputs?

### Takeaway
Greedy decoding with batch size 1 is usually repeatable on the same machine, binary and settings, but it is not guaranteed bit-identical. Different batch sizes (concurrent requests, prompt-cache reuse vs fresh prefill) change the floating-point reduction order and can flip tokens. vLLM has an opt-in batch-invariant mode (`VLLM_BATCH_INVARIANT=1`, sm80+, Qwen3-VL validated). llama.cpp explicitly warns that prompt caching breaks bit-exactness.

### Cited Findings
- llama.cpp server: `cache_prompt` (on by default) reuses the KV cache, but "logits are **not** guaranteed to be bit-for-bit identical for different batch sizes (prompt processing vs. token generation)". The docs note that enabling this option can cause nondeterministic results — [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- The main cause of temperature-0 nondeterminism is batch-size dependence of reduction kernels (RMSNorm, matmul, attention), not "GPU randomness" as such. Temperature 0 plus a fixed seed does not guarantee identical output when batching or scheduling varies — [vLLM Batch Invariance docs](https://docs.vllm.ai/en/latest/features/batch_invariance/); [zansara substack](https://zansara.substack.com/p/setting-the-temperature-to-zero-will); [arXiv 2506.09501](https://arxiv.org/pdf/2506.09501)
- vLLM batch invariance: set `VLLM_BATCH_INVARIANT=1`. It needs NVIDIA compute capability ≥ 8.0 (the 3060 at sm_86 qualifies) and is in beta. It disables some optimizations and may cost performance. Validated models include Qwen3 dense/MoE and **Qwen3-VL** (single image and video) and Qwen2.5 — [vLLM Batch Invariance docs](https://docs.vllm.ai/en/latest/features/batch_invariance/)
- vLLM reproducibility for offline mode: set `VLLM_ENABLE_V1_MULTIPROCESSING=0` for deterministic scheduling, or use batch invariance — [vLLM Reproducibility docs](https://docs.vllm.ai/en/latest/usage/reproducibility/)
- Reported cost of batch-invariant kernels: bit-identical over 1,000 runs on Qwen3-8B at about a 61.5% throughput cost in a baseline implementation. This comes from secondary summaries of the Thinking Machines work — [Medium (S. Gupta)](https://medium.com/@siddhantg314/defeating-nondeterminism-in-llm-inference-in-practice-38a7dd1e4112); [hidekazu-konishi.com](https://hidekazu-konishi.com/entry/reproducible_llm_inference.html)
- A 2026 paper argues quantization amplifies cache-induced divergence in LLM serving: the same request can give a different answer depending on cache state, and the effect is worse with quantized models — [arXiv 2609.04748](https://arxiv.org/pdf/2609.04748) (title/abstract level only)

### Inferences
- Practical recipe for repeatable output on one 3060:
  - Greedy decoding (temperature 0 / top_k 1), fixed seed.
  - One slot (`-np 1` on llama.cpp; `OLLAMA_NUM_PARALLEL=1`) so the batch composition never changes.
  - Disable prompt caching (`cache_prompt: false` per request on llama.cpp) if bit-exactness matters more than latency.
  - Fixed image resize (the same pixels in give the same tokens).
  - Pinned runtime version, model file and GPU driver.
- Expect differences across runtime versions, quant files and GPUs. For scoring, treat outputs as "stable, not guaranteed" and design a tolerance (e.g. schema enums, rounding) instead of relying on bit-exactness.
- A quantized GGUF/AWQ model plus prompt-cache reuse is the combination most likely to show occasional flips (see arXiv 2609.04748).

### Gaps
- No source checked whether Ollama exposes a way to disable prompt-cache reuse per request, or whether its outputs are identical across runs with vision input.
- Whether llama.cpp's mmproj/CLIP encode is itself deterministic on CUDA was not documented anywhere I found.

## 6. Concurrency: how many simultaneous requests on one 3060; queueing

### Takeaway
On a 12 GB card with a 7–8B VLM, use 1 slot (maybe 2 with a 3–4B model), and queue the rest. Each extra parallel slot multiplies context and KV memory, and batching also undermines determinism. Both Ollama and llama.cpp queue excess requests.

### Cited Findings
- Ollama: `OLLAMA_NUM_PARALLEL` defaults to 1 request per model. Increasing it multiplies context memory (e.g. 2k context × 4 parallel = 8k context allocated). `OLLAMA_MAX_QUEUE` defaults to 512, after which requests get HTTP 503. `OLLAMA_KEEP_ALIVE` defaults to 5 minutes; a negative value keeps the model loaded forever — [Ollama FAQ](https://docs.ollama.com/faq)
- llama.cpp: `-np/--parallel N` sets the number of server slots (default -1 = auto). Continuous batching is on by default (`-cb`). Requests beyond the available slots wait — [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- vLLM does continuous batching, and the default `--gpu-memory-utilization` is 0.9. On small GPUs, reduce `--max-model-len` and limit images per prompt to avoid OOM — [Qwen vLLM docs](https://qwen.readthedocs.io/en/v2.5/deployment/vllm.html); [vLLM forum: Problem with Qwen2.5-VL-7b](https://discuss.vllm.ai/t/problem-with-qwen2-5-vl-7b/1065)

### Inferences
- With a ~4 s service time at batch 1, one 3060 handles about 15 requests/minute sequentially. A queue in front (the runtime's own queue, or an app-level queue with a timeout and "busy" UI) matters more than raising parallelism.
- Parallel slots raise aggregate throughput somewhat, but they raise per-request latency and memory, and they break batch invariance on llama.cpp and Ollama. That conflicts with both the 3–5 s budget and determinism. Recommend `parallel=1` and `keep_alive=-1` so the model never unloads, since a model reload would blow the latency budget.

### Gaps
- No measured multi-request VLM throughput or latency curves on a 3060.

## Summary table (sources above; estimates marked)

| Runtime | Windows 10 Home | VLM support (examples) | JSON schema / grammar | Determinism controls | Notes |
|---|---|---|---|---|---|
| llama.cpp `llama-server` | Native (CUDA binaries) | Qwen2.5-VL/Qwen3-VL/Gemma 3 etc. via `--mmproj` | GBNF, `--json-schema`, `response_format` | seed, temp 0, `-np 1`, disable `cache_prompt` | Qwen3-VL consecutive-request gibberish bug reported (#17200, Orin, unconfirmed) |
| Ollama | Native | Yes (built on llama.cpp) | `format` = JSON schema | temp 0, seed, `OLLAMA_NUM_PARALLEL=1` | Queue 512; KV quant q8_0/q4_0 |
| LM Studio | Native | Not verified here | Not verified here | — | Gap |
| vLLM | WSL2 / Docker Desktop (official); unofficial native forks | Qwen3-VL (≥0.11), Qwen2.5-VL AWQ, etc. | Guided decoding (xgrammar/outlines; check current param names) | `VLLM_BATCH_INVARIANT=1` (sm80+, beta, Qwen3-VL validated) | 20–40% WSL2 penalty claim (unverified) |
| SGLang | WSL2 only | Qwen3-VL | Yes (not verified this session) | — | Not supported on native Windows |
| LMDeploy | Claims native Windows (TurboMind tp=1) | Qwen2.5-VL, Qwen3-VL, InternVL3/3.5, Gemma3, MiniCPM-V 2.6 | Not verified here | — | Verify Windows + VLM on 30-series first |
| TensorRT-LLM / HF transformers | Not researched / slow | — | — | — | Gap |
