# Continuum

**Your ability becomes your interface.**

Continuum is an app that helps people who cannot speak to talk with others. This kind of tool is called AAC (Augmentative and Alternative Communication).

Most AAC tools expect you to fit the tool. Continuum does the opposite. It learns which small movements are easy for you, such as a blink, raising your eyebrows, a cheek puff, or moving your eyes. Then it builds the controls around the movement that works best for you.

It runs on a normal laptop or phone. You do not need special hardware, and you do not need the internet.

Built for the IEEE Breakthrough hackathon.

## What it can do

- **Learns your movements.** A short setup watches a few movements and picks the one it can see most clearly.
- **Works with many inputs.** You can use face movements, eye tracking, or a simple switch or key.
- **Phrase boards and spelling.** Pick ready phrases or spell your own words.
- **You stay in control.** Nothing is spoken until you check the message and say yes.
- **Recovers from problems.** If your input stops working in the middle of a message, you can get back in and your message is still there.
- **Learns your words.** It learns from messages you approve and suggests them later. You can turn this off or clear it.
- **Optional local AI helper.** A small AI model on your own computer can suggest wording. It never speaks by itself.
- **Private.** Camera video stays on your device and is never saved.

## How to run it

You need **Node.js 22 or newer**.

```bash
npm ci
npm run build
node server.mjs
```

Then open **http://127.0.0.1:4180** in your browser.

The slides are at **http://127.0.0.1:4180/pitch.html**.

### On Windows

You can also start everything with one script:

```powershell
./START_CONTINUUM.ps1
```

It installs, builds, starts the server, and opens the app for you.

### For development

```bash
npm run dev
```

Then open **http://127.0.0.1:5173**.

To run the tests:

```bash
npm test
```

## First time setup

When you open the app for the first time, it talks you through setup:

1. Choose how you want to control the app (camera or switch).
2. Show it your comfortable movement a few times.
3. Practice picking **Yes** and **No**.
4. Choose your settings for personal messages.

The same movement picks whatever is highlighted. You do not need one movement for Yes and another for No.

A helper may need to start setup and allow camera access.

## Quick demo

1. Pick a phrase or type a message.
2. Click **Review & speak**, check the words, then click **Speak this message**.
3. Turn on **Demo guide** and click **Simulate interruption**.
4. Press **Space** and pick **Resume my message**. Your message is still there.
5. Fix the message, check it, and speak it.
6. Open **Your progress** to see what the app has learned.

**Keys:** Space starts and selects. Escape pauses.

## Optional local AI

The AI helper uses a small Qwen3 model running on your own computer through llama.cpp. It is not needed for the main app. If the model is missing, everything else still works. No cloud account or API key is needed.

## Built with

React, TypeScript, Vite, MediaPipe (face tracking), WebGazer (eye tracking), and Kokoro (voice).

## More documents

- `PRESENTATION_BRIEF.md`: pitch script and judge questions
- `CONTINUUM_MASTER_SPEC.md`: full design
- `CONTINUUM_LITERATURE_REVIEW.md`: research and related work
- `src/intelligence/MODEL_CARD.md`: how the word learning model works
- `VERIFICATION.md`: what has been tested

## Important note

This is a research prototype. It is not a medical device and it is not an emergency alarm. Do not run it on a public network.
