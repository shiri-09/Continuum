# Continuum verification record

Date: 26 September 2026. Results below are engineering evidence, not clinical validation.

## Verified so far

- Production TypeScript/Vite build passed.
- 32 unit tests passed in the 12:04 local run: session transitions, recovery invariants, temporal gesture detector, camera resource cleanup, personal language model and its benchmark.
- Browser interaction: select phrase → review exact text → authorize installed local Microsoft voice → browser speech completion reported.
- Browser interaction: type a draft → inject explicitly simulated input loss → draft remains → first Space opens recovery only → explicit Resume restores the workspace.
- Updated desktop layout and presentation opening slide visually inspected in the Codex browser at its default 1280 × 720 viewport.
- Camera model and matching WASM runtime assets downloaded locally.
- Dependency audit after Vitest update reported zero vulnerabilities.

## Production startup and HTTP verification — 26 September, approximately 12:25 local

- `npm run build` passed with Vite 6.4.3. The Windows startup script was parsed by PowerShell and then executed successfully with `-NoOpen`.
- Production server launched hidden on **127.0.0.1:4173**. Its identified process was restarted after server-route changes; the Vite development server on 5173 was left running.
- `/health`, `/`, `/pitch.html`, `/models/wasm/vision_wasm_internal.wasm` and `/models/face_landmarker.task` returned HTTP 200. WASM returned `application/wasm`; the model returned `application/octet-stream`.
- `/api/model-status` returned HTTP 200 with `available:false` at this check; optional generative-model readiness was not claimed.
- Request guards: GET `/api/assist` → 405; foreign-origin POST → 403; invalid assist payload → 400; unknown API → 404; missing WASM → 404; malformed URL escape → 400; encoded traversal → 403; POST static entry → 405.
- Read-only Windows device inspection found **ASUS FHD webcam** and **ASUS IR camera**, both with status OK. User and machine webcam consent registry values were `Allow`. This does **not** establish browser site permission, successful capture or useful face tracking; no camera capture was performed in this check.

Source files continue changing during development. The startup script rebuilds newer sources; a running Node server must be restarted separately after `server.mjs` changes. The evidence above covers the checked versions and routes, not future route implementations.

## Measured language-model microbenchmark

One development run with 512 learned phrases and 200 warm requests recorded 5.125 ms median and 8.38 ms p95. A later run recorded 2.825 ms median and 4.251 ms p95. Variability is expected. These are JS suggestion timings on this development machine, not complete communication times or clinical measurements.

## Assistant integration and startup — 26 September, updated after guided-setup tests

- Complete `npm test` run: **81 tests passed in 12 files**, followed by successful `npm run build` (strict TypeScript and production Vite bundle).
- New hook/component integration tests use stubbed HTTP responses. They verify no execution before confirmation, exact proposal-ID submission, same-turn duplicate-confirmation suppression, input-loss invalidation, draft revision abort, stale-response cancellation, rejection of unsupported tools and malformed metadata, and rendering of the resulting execution receipt.
- The duplicate-confirmation test initially failed with two execute requests. A synchronous request guard and consumed-ID check were added; the regression now passes. Malformed `null`/array arguments, empty IDs and missing summaries are rejected before display.
- Existing 14 rendered App integration tests passed with the current assistant controls.
- Production server was restarted to load final route changes; only its verified Node process was stopped, leaving Vite untouched. `START_CONTINUUM.ps1 -NoOpen` then reused the healthy server and optional local model successfully. `START_LOCAL_AI.ps1` passed PowerShell parsing.
- Live `/api/model-status` now returns `available:true`, `runtime:"llama.cpp"`, `model:"qwen3:0.6b"`. This supersedes the earlier unavailable-model observation above. The standalone startup script's **existing-process reuse** path was tested; its exact launch command had been verified separately on this laptop by the runtime setup agent. The new script has not yet been tested from a complete machine reboot.
- The local generative model is pretrained Qwen3 0.6B; it is separate from the count-trained personal ranker. Model availability is not evidence of reliable generated meaning. Physical-camera and intended-user evaluations remain outstanding.

## Still to verify

- Responsive layout at narrower viewports.
- End-to-end live model/tool behavior beyond mocked UI tests; see the runtime agent's separately recorded endpoint checks. Model readiness itself is verified above.
- Physical webcam permission, calibration and gesture completion with a consenting person. Embedded browser initialization waited without a visible permission prompt; bounded startup timeouts and actionable errors were added.
- Full offline restart and local voice playback without external network access.

## Interpretation

Software tests use scripted state/input sequences and mock speech where needed. They cannot establish accessibility for a diagnostic population, real-world false-activation rates or a reduction in caregiver burden. Live developer interactions test mechanics. Intended-user co-design and evaluation remain future work.



## Latest setup and runtime update

The completed full suite now reports **81 Vitest tests in 12 files**, including guided-onboarding interaction coverage; the independent Node automation suite reports **6 passing tests**. A further optional audio-input feature is under development and is outside this recorded count. Runtime setup verified the official 1.7B GGUF SHA256 and launched Qwen3 1.7B on loopback8082. Core `/api/model-status` now reports `qwen3:1.7b`. The startup script’s preferred-existing-runtime path was executed successfully; fresh-process launch and cold reboot remain distinct checks. Runtime/API tests are recorded by the runtime agent.

The visual design now uses a black/silver palette, guided setup and a speaking orb. Root-agent CUA verification is the authority for the live UI. The pitch was updated without further browser automation; final layout inspection of the modified deck remains outstanding.


## Final production checkpoint — 26 September, 13:12 local

- Production build passed; **85 Vitest tests in 13 files and 6 Node automation tests passed** after the optional recorder controls were integrated.
- Final app: http://127.0.0.1:4180 . Updated server was launched separately after automatic approval review rejected stopping the previous process. The previous listeners were left running. START_CONTINUUM.ps1 now targets 4180; its build/health/runtime reuse path was successfully executed.
- Local runtime reports Qwen3 1.7B via llama.cpp on this laptop. The official model SHA256 was verified by the runtime agent. Sixteen bounded sentence-editing development outputs and actual API tool/conversation cases were inspected; they do not establish general semantic accuracy.
- CUA browser verification of guided onboarding: real speech onstart status observed; Space selected Yes and No, saved three phrases and skipped one, then entered the assistant. This verifies the switch path, not facial motor performance.
- CUA browser verification of production 1.7B note action: exact title/content reviewed, explicit Confirm pressed, success receipt returned, UTF-8 file read back and matched. Observed generation 0.37 seconds for this one request.
- Local installed Microsoft speech reported completion after explicit message confirmation in the redesigned UI.
- Voice recording is an optional local clip, with explicit microphone permission, preview and download. No transcription, speaker cloning or speech-model training is implemented. Audio API tests use mocks; real microphone capture and playback remain unverified.
- Physical camera calibration and intended-user performance still require a real person. A webcam device listing, detector tests, or switch tests cannot substitute for that check.
