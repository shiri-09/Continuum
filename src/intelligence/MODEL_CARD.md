# Continuum local personal language model

This module is a count-based personal language model and phrase ranker. It is not a pretrained model, a general-purpose LLM, clinical speech recognition, or an intention detector. It runs in the application's JavaScript runtime without network calls, credentials, GPU, or model downloads.

## What is learned

The application must call `confirmSpoken(exactText, situation)` only after explicit user approval of the message. Merely typing, browsing, receiving a suggestion, or adding a custom phrase does not record a confirmed use. The class has no speech-output function. Suggestions must be selected and pass the same review/confirmation path as other text.

Training updates bounded phrase/context frequency counts and recency. Word prediction builds weighted unigram and bigram counts from the curated seed vocabulary, explicitly saved custom phrases, and confirmed messages. Prediction interpolates add-one-smoothed bigram and unigram distributions. Phrase ranking combines a transparent curated-order prior, context match, logarithmic confirmed-use frequency, contextual frequency, and recency. These are small statistical online models, not learned neural network weights. Scores are rankings, not calibrated confidence estimates.

There are 40 authored starter phrases covering autonomy, conversation, care, social interaction, and personal choices. These examples are not inferred needs or recommendations. A user can add up to 256 custom phrases. Confirmed messages are kept as at most 512 distinct text/context aggregates; the least recently used aggregate is evicted at capacity. Phrase length is limited to 240 characters. The UI should handle a learning-limit error without preventing otherwise approved speech.

Suggestions use only the current typed prefix, explicitly selected situation and local confirmed history. No camera-derived emotion, diagnosis, medical context, or inferred consent enters the model. Unknown prefixes can return no candidates. Word suggestions are English-oriented and normalized to lowercase except at the beginning of a draft. They must be reviewed, particularly names. No claim of multilingual predictive quality is made.

## Integration and privacy

`new PersonalLanguageModel(savedJSON?)`; `suggest({prefix, situation, kind, limit})`; `confirmSpoken(text, situation)`; `addCustomPhrase(text, situation)`; `getCustomPhrases()`; `removeCustomPhrase(id)`; `stats()`; `exportJSON()`; `importJSON(json)`; `resetLearning()`; `reset()`.

The module is in-memory by default. The parent application owns any local persistence and must label it accurately. Exported JSON contains readable personal phrases and confirmed-message aggregates; it is not encrypted. Imports are size-bounded and structurally validated before replacing current state. Imported strings are data; the UI must render them as text, never raw HTML. Removing a custom phrase also removes its corresponding learned aggregates. Reset-learning preserves manually saved phrases; complete reset deletes both. Total historical confirmation count may exceed retained counts after deletion/eviction.

`COMMUNICATION_ROUTINES` supplies three authored sequences of suggestions. These are navigation aids, not macros: they never authorize speaking a sequence automatically. The UI should freeze candidate ordering while a scan cycle is in progress so learning cannot move a target under selection.

## Evaluation and limits

Run `npx vitest run src/intelligence` to run validation and the benchmark. Tests check that only explicit confirmation trains the model, prefix behavior, contextual personalization, next-word prediction, deletion/reset, persistence, and atomic rejection of invalid imports.

The preference replay uses separate later requests for the same synthetic preferences represented by prior confirmations. It establishes that online preference adaptation works; it is not evidence of generalization to unseen messages, measured effort savings, clinical benefit, or performance for intended AAC users. There are no patient samples in this benchmark.

The benchmark reports median, p95 and maximum wall-clock latency over 200 warmed requests with 512 learned phrases. It prints actual measurements at execution time; no fixed benchmark numbers are built into the UI. Results depend on runtime, hardware and concurrent load. Personal-language ranking should be compared with the unadapted ranker and a frequency-only baseline in future intended-user evaluations, measuring selection effort, correction cost and unintended message rates as well as speed.
