# SceneStitch Rebuild PRD

**Date:** February 6, 2026  
**Owner:** cmtemkin  
**Doc Version:** v1

## 1) Summary
Rebuild SceneStitch into a creator‑first, AI‑driven content creation platform for **faceless narration explainers** and **humorous TikTok skits**. The platform should be fast, opinionated, and easy to use, with a **guided scene editor** rather than a full timeline. It must support:
- **Long‑form 16:9** explainer videos
- **Short‑form 9:16** TikTok/shorts
- **Image‑to‑video** generation for both
- **Provider‑agnostic AI** (OpenAI + Nana Banana Pro for image; Sora 2 + Veo 3.1 for image‑to‑video; OpenAI + ElevenLabs for TTS)

The rebuild should reuse the strongest parts of the current app (image gen, audio/TTS, and video assembly) while dramatically redesigning the UI and simplifying the workflow into a single coherent product flow.

---

## 2) Goals
- Create a video from a script in minutes with minimal manual work.
- Support faceless narration with AI voices + image sequences.
- Provide simple, high‑impact short‑form generation (TikTok, Reels, Shorts).
- Make the architecture provider‑agnostic to add/replace models quickly.
- Create a product experience that is clean, modern, and creator‑friendly.

## 3) Non‑Goals (v1)
- Full professional timeline editor.
- Live multi‑user collaboration.
- Marketplace/billing/subscriptions.
- Deep analytics instrumentation.

---

## 4) Target Users
**Primary:** solo creators and creator‑entrepreneurs building explainer videos and short comedic skits.  
**Secondary:** small teams/agency creators who need repeatable content output.

---

## 5) Primary Use Cases
1. **Explainer video**: Script → scenes → images → narration → export (16:9).
2. **TikTok skit**: Short script → hook/beat structure → captions + audio → export (9:16).
3. **Repurpose**: Turn a long explainer into multiple shorts.

---

## 6) Success Metrics
- **TTFVP (Time‑to‑first‑video):** < 5 minutes for a 60–90s script.
- **Completion rate:** > 80% of new users finish at least 1 video in session 1.
- **Repurpose adoption:** > 30% of long‑form projects produce at least 1 short.
- **Repeat usage:** > 25% 7‑day return rate.

---

## 7) Functional Requirements

### 7.1 Script Intake + Scene Planning
- Script input via text or outline.
- Optional AI rewrite for clarity or humor.
- Auto‑scene breakdown with manual edits.
- Per‑scene pacing guidance (too fast/too slow warnings).

### 7.2 Narration & Voices
- TTS generation (per scene or full script).
- Voice selection + speed controls.
- Timestamp alignment for scene pacing.
- Export SRT/VTT for captions.

### 7.3 Image Generation
- Provider‑agnostic image generation (OpenAI + Nana Banana Pro).
- Style presets + custom style prompts.
- Reference image + continuity system.

### 7.4 Image‑to‑Video
- Provider‑agnostic image‑to‑video (Sora 2 + Veo 3.1).
- Per‑scene clip length selection.
- Support long‑form and short‑form formats.

### 7.5 Guided Scene Editor
- Scene list + preview + per‑scene edit panel.
- Edit prompt, caption, narration, pacing, and image/video.
- Regenerate per‑scene without restarting project.

### 7.6 Captions & Emphasis
- Caption templates with emphasis styles.
- Karaoke‑style word highlighting for shorts.
- Auto‑emphasis of humor beats.

### 7.7 Repurpose + Variants
- One‑click “Generate Shorts” from long‑form.
- Auto‑hook writer for first 3–5 seconds.
- A/B variants for hooks and captions.

### 7.8 Persona + Brand Kits
- Persona kits: voice + tone + style rules.
- Brand kits: colors, fonts, logo bug, intro/outro.

### 7.9 Content Calendar + Batch
- Create batches of shorts or explainers.
- Queue and manage render jobs.

### 7.10 Cost Controls
- Cost estimator per project.
- Budget caps and warnings before render.

### 7.11 Export
- MP4 export in 16:9 and 9:16.
- Asset bundle export (images, audio, captions).

---

## 8) Game‑Changing Features (Differentiators)
- **Auto‑Hook Generator:** rewrite opening for retention.
- **Comedy Timing Engine:** pacing + emphasis for punchlines.
- **Shorts Generator:** auto‑extract highlights.
- **Persona Kits:** repeatable voice/style profiles.
- **A/B Exports:** 3–5 variants of hooks/captions.
- **Fast Repurpose:** long → 3 shorts in minutes.

---

## 9) UX / IA

### Core Screens
- **Dashboard**: recent projects + templates
- **New Project Wizard**: format → script → style/provider
- **Scene Editor**: list + preview + controls
- **Render & Export**: progress + output

### Core Flows
- **Long‑form**: Script → Scenes → Images → Narration → Render → Export
- **Short‑form**: Hook/Beats → Images + Captions → Render → Export
- **Repurpose**: Select long‑form → Generate Shorts → Review → Export

---

## 10) Architecture Changes

### Provider‑Agnostic AI Layer
- Define capability interfaces: `image.generate`, `tts.generate`, `video.image_to_video`.
- Provider registry with adapters for:
  - **Images**: OpenAI, Nana Banana Pro
  - **Image‑to‑Video**: Sora 2, Veo 3.1
  - **TTS**: OpenAI, ElevenLabs

### New Data Models
- `assets`: images/audio/video/captions
- `renders`: status, progress, provider info
- `provider_configs`: per‑project provider settings
- `templates`, `persona_kits`, `brand_kits`
- `clips`: short‑form derivatives
- `variants`: A/B variants
- `content_calendar`

### API Changes
- New endpoints: `/api/renders`, `/api/assets`, `/api/providers`, `/api/templates`, `/api/kits`, `/api/clips`.
- Deprecate direct `/api/generate-*` endpoints.

---

## 11) Implementation Plan

### Phase 0 — Stabilize + Extract Core Services
- Extract provider‑agnostic AI layer from `server/services/openai.ts`.
- Replace in‑memory job queue with DB‑backed renders.
- Standardize asset storage + checksums.

### Phase 1 — New UX + Core Pipeline
- Replace UX flows with a single wizard + scene editor.
- Add format toggle (16:9 vs 9:16).
- Render & export panel.

### Phase 2 — Differentiators
- Auto‑hook + comedy timing engine.
- Shorts repurpose pipeline.
- Caption styles + karaoke timing.
- Persona + brand kits.

### Phase 3 — Scale
- Content calendar + batch generation.
- A/B testing variants.
- Cost estimator + budget caps.

---

## 12) Risks & Mitigations
- **Provider instability**: mitigate with provider fallback and retries.
- **Render failures**: DB‑backed job recovery + partial export.
- **Cost blowout**: cost estimator and caps.

---

## 13) Open Questions
- Final decisions on Nana Banana Pro and Veo 3.1 APIs (auth + quotas).
- Default templates for explainer vs TikTok.
- Caption style presets for humor vs educational.

---

## 14) Acceptance Criteria (v1)
- User can generate an explainer (16:9) with narration + images in under 5 minutes.
- User can generate a TikTok (9:16) with auto‑captions + hook.
- Project can be repurposed into at least 3 shorts.
- Providers can be switched per project without rewriting business logic.

---

## 15) Tracking
All tasks are tracked in **GitHub Project #1** under `cmtemkin` with `agent-task` auto‑add workflow. The task source of truth is `.github/project-tasks.json`.
