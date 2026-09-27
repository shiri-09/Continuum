# Continuum — presentation-ready brief

**Your words. Your way.**  
Updated 26 September 2026. Research prototype; intended-user and clinical evaluation remain future work.

## Read this first — current presentation page

**The problem:** When reliable speech and hand access are unavailable, communicating a thought and completing a simple computer task can both require help. Losing an alternative input can interrupt that attempt. The interface must preserve the person's work and require an explicit choice before speaking or acting.

**The product:** Continuum combines switch scanning, personally calibrated camera gestures, an editable communication workspace, draft-preserving recovery and a local AI assistant that proposes a small set of computer actions for review.

**The real demonstration:** In a developer browser run at approximately 12:30 on 26 September, selecting **Save a thought** sent a request to the local model. The model proposed a note with its title and contents visible. After **Confirm this action**, the app displayed a receipt; the resulting file contents were separately checked on disk. This proves that particular interaction, not general model accuracy or independent use by someone with a disability.

**What AI does:** A small count-trained personal model ranks recurring phrases. A separate **pretrained Qwen3 model** runs locally through llama.cpp on the laptop GPU and generates wording candidates/tool proposals. The current verified runtime is Qwen3 1.7B (4-bit) on GPU; the original complete browser-to-note demonstration used 0.6B. The final 1.7B endpoints were subsequently checked separately. We did not train Qwen3. Generated suggestions can be wrong, so exact wording and arguments remain reviewable.

**Engineering evidence:** 85 Vitest tests and 6 Node automation tests passed in the recorded runs; production build passed. These test counts are engineering checks, not participant counts. A warm proposal displayed **0.31 seconds in one observed run**; it is not a latency benchmark or a guarantee. The local ranker has a separate microbenchmark; do not combine the two numbers.

**Scope:** Create new local text notes; request opening Calculator/Notepad; request an approved HTTPS website. Launching an external app or browser does not mean Continuum controls it. A person may need help returning to Continuum. Website access sends the URL/search query to that website and requires connectivity, although planning runs locally. Physical-camera performance and clinical benefit remain unverified.

**The claim to make:** “We built a working path from a usable selection signal to a reviewed message or explicitly approved task, with recovery when access is interrupted.”

### Start the demonstration with guided setup

Show the black welcome screen and silver speaking orb. Select **Begin setup**, choose an accessible input, and complete camera calibration with a helper if needed. For a short keyboard demonstration, choose **Switch / Space key** and label it as that. Practise **Yes**, then **No**, by waiting for the desired answer to highlight and using the **same selection signal**. This is scanning, not recognition of two different yes/no gestures. Choose personal messages to save, then enter the workspace. The assistant offers large selectable conversational replies and can narrate its own responses; its narration is separate from speaking a message on behalf of the user. If automatic narration is unavailable, use **Repeat spoken instruction**. Do not claim physical-camera calibration unless it actually completes.

### Sixty-second continuation: speech and tool approval

| Time | Action | Say |
|---|---|---|
| 0–10 s | Choose or compose “I would like a little more time.” | “This is the person's message. A suggestion does not speak by itself.” |
| 10–20 s | Open instructions and use **Test input interruption (simulation)**, press Space for recovery, then choose **Resume my message**. | “This interruption is simulated. The draft survives; the first signal only opens recovery.” |
| 20–30 s | **Review & speak → Speak this message**. | “A new explicit choice authorizes the exact words.” |
| 30–43 s | **Save a thought → Propose an action**. | “Now a real local pretrained model proposes a supported tool. It has not executed anything.” |
| 43–53 s | Read the proposed title/content; choose **Confirm this action** only if correct. | “The person approves these exact arguments.” |
| 53–60 s | Show the receipt and prepared file view if time permits. | “The note exists on this computer. We tested the complete loop.” |

Rehearse once before judging. If wording or arguments differ from the request, cancel and explain that review caught a bad proposal. Use the note for this short demo so an external window does not take focus. If inference is slow, narrate the confirmation boundary and continue when the result arrives; do not describe a saved proposal as a live response.

## Slide notes

### Slide 1 — A message should not disappear when access fails

**Problem:** People with severe speech and hand-control limitations may depend on an alternative input to communicate. When that input becomes unreliable, composing and correcting their own message can become difficult.

**Our question:** Can one personally usable signal support communication, correction and recovery without uncertain movements becoming unintended speech?

Show a short scenario: someone composing “I have something to say”; the camera is covered; their draft remains intact. Do not describe a developer as a patient.

### Slide 2 — Who this is for

Target an ability profile: difficulty relying on ordinary speech and hand input, ability to use the offered choices, and one repeatable voluntary signal.

ALS, cerebral palsy and stroke are possible contexts, not automatic eligibility. Dysarthria affects speech movement; aphasia affects language. Mouth/eyebrow access does not cover someone whose only remaining movement is an eye movement, or someone with no usable observable voluntary signal.

Choose **one or two** of these study findings for the slide. Keep the population attached:

- **43%** of **371 people with MND in a Scottish cross-sectional registry study** had recorded speech impairment. Elliott et al., 2020. [Study](https://pubmed.ncbi.nlm.nih.gov/31594398/)
- **11 of 35 (31.4%)** Norwegian preschool children with CP who met that study's AAC-need criteria had communication aids; the overall sample was 95 children. Lillehaug et al., 2023. [Study](https://pubmed.ncbi.nlm.nih.gov/37212772/)
- **42%** had dysarthria in **221 reviewed first-ever acute ischemic-stroke cases** from one Canadian centre, registry years 2003–2008. Flowers et al., 2013. [Study](https://pubmed.ncbi.nlm.nih.gov/23642855/)

These are historical study figures, not global prevalence, permanent disability rates or numbers of suitable Continuum users. Do not add them together.

### Slide 3 — The person controls every message

1. Choose and calibrate a comfortable input: switch or supported camera gesture.
2. Scan phrases or compose text; select, undo and correct.
3. Review the exact message and make a new selection to authorize speech.
4. If input fails, pause and preserve the draft. Resume explicitly through an available usable route.

No signal means no action. It never means yes, no, agreement or consent. If no backup is usable, independent recovery cannot be promised.

### Slide 4 — What we actually built

| Component | Accurate description |
|---|---|
| Access | Switch scanning and camera setup for personal mouth/eyebrow gestures. |
| Perception | Pretrained facial features followed by personal thresholds and temporal gesture validation. |
| Communication | Phrase board, text composition, review, speech authorization and recovery workflow. |
| Local intelligence | A small online statistical phrase ranker and smoothed word-bigram model. Learns from explicitly approved messages when learning is enabled. |
| Generative assistance | Separately pretrained Qwen3 through local llama.cpp; produces wording candidates and one supported tool proposal for explicit review. |
| Tools | New local notes, Calculator/Notepad launch requests, and approved HTTPS destinations; server validates tool arguments and consumes a proposal only after confirmation. |
| Data | Local personal vocabulary and bounded history; inspectable model counts; reset/export/import support. |

**Build status:** production build passed; 85 Vitest tests plus 6 Node automation tests passed in recorded runs. Live browser → model → proposal → confirmation → note receipt → file-content inspection was demonstrated. Camera detector tests use synthetic input sequences. Physical-camera performance and intended-user performance have not been independently verified. These counts are software checks, not patients or clinical accuracy.

The core personal ranker needs no API key, internet or GPU. The separate optional pretrained LLM uses the local GPU in the demonstrated setup. Offline speech depends on an installed working local voice; approved website launches require network access.

### Slide 5 — Existing work, and our contribution

AAC already exists. Intel ACAT has prediction and speech synthesis; Grid supports independent access switching; TD Snap supports multiple access methods; Cboard has web/offline AAC and scanning; Google Gameface supports facial gestures; Apple offers camera and vocal accessibility features.

**Our proposed contribution:** a communication and bounded computer-task workflow that preserves the draft, separates suggestions from speech/action authorization and makes recovery behavior testable under input interruption. This is an integration and evaluation hypothesis, not a claim to have invented AAC or tool-using models.

**Hypothesis, not established superiority:** this workflow can improve completion under controlled failures without increasing unwanted speech or excessive interaction effort. We must compare it with a matched baseline and, later, appropriate existing tools.

[ACAT](https://github.com/intel/acat) · [Grid switching](https://hub.thinksmartbox.com/knowledgebase/how-do-i-change-between-two-access-methods-in-grid-3/) · [TD Snap](https://us.tobiidynavox.com/products/td-snap) · [Cboard](https://www.cboard.io/en/) · [Gameface](https://developers.googleblog.com/project-gameface-launches-on-android/) · [Apple](https://www.apple.com/newsroom/2024/05/apple-announces-new-accessibility-features-including-eye-tracking/)

### Slide 6 — Evidence, next step and societal purpose

Measure correct completed messages, unwanted selections/speech, correction effort, recovery time and help needed. Camera tests must report false selections **and** missed intended gestures. Language latency is not communication speed.

Next: co-design and evaluate with AAC users and access professionals, preserving their existing communication methods. The intended benefit is being able to initiate, disagree, correct, express affection and choose ordinary topics—not only request care.

**Closing line:** “Continuum aims to keep the person in control of the message, including when their input stops working.”

## Ninety-second pitch

“Imagine having something to say, but neither speech nor a touchscreen is a reliable way to say it. Then imagine that your alternative input stops working halfway through your message.

“Continuum is an offline communication prototype built around one personally usable selection signal. A switch or a calibrated camera gesture lets the person choose phrases, compose a thought and correct it. Before anything is spoken, they review the exact words and make a new selection to approve them.

“If the camera loses the signal, the interface pauses and keeps the draft. A person with a usable backup can explicitly resume. Silence is never interpreted as agreement.

“Our personal model learns recurring phrases from approved messages. A separate pretrained language model runs on this laptop and can propose a note, an app launch or an approved website. The user sees the exact proposal and confirms before anything runs. We have demonstrated a real note being created and checked its contents on disk.

“AAC, facial control and AI prediction already exist. Our contribution to evaluate is the recovery and authorization workflow. A model can misunderstand, and opening another app does not mean we can control that app. Physical-camera and intended-user validation remain next steps.

“The goal is simple: support the person's own words, choices and corrections—even when access is interrupted.”

## Demo fallback and judge answers

- **Live camera unverified or unreliable?** Demonstrate the functioning switch path. Label any simulated input interruption clearly; do not pretend a prerecorded or synthetic gesture is live detection.
- **Why AI?** Pretrained perception extracts movement features; the local statistical model adapts recurring suggestions. ML is a tool, not the product's purpose.
- **Did you train the LLM?** No. The personal ranker learns counts locally; Qwen3 is separately pretrained. We engineered its local integration, tool constraints and approval workflow.
- **Can it control the whole computer?** No. The implemented executor creates notes and requests supported app/website launches. External apps may need an assisted return to Continuum.
- **Is every model proposal correct?** No. Incorrect and unsupported proposals have been observed. Structural validation helps constrain execution; explicit review is still necessary and does not guarantee comprehension or detect every semantic mistake.
- **What is novel?** We propose an evaluated workflow improvement; no world-first or product-superiority claim has been established.
- **Does it work for all paralysis?** No. It requires at least one usable signal supported by the implemented input.
- **Is it medically validated?** No. Developer and synthetic tests establish engineering behavior only.
- **Can we quote zero errors?** Only for a completed test with its actual trial count, exposure time and conditions. Do not use an unmeasured percentage.

Detailed evidence and limitations: [master specification](CONTINUUM_MASTER_SPEC.md) and [literature review](CONTINUUM_LITERATURE_REVIEW.md).


