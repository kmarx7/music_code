# PRD.md — Music Score Platform MVP v2.0

**Document:** Product Requirements Document  
**Scope status:** **MVP feature set confirmed**  
**Version:** 2.0  
**Date:** 2026-11-07  
**Implementation rules:** [AGENTS.md](../AGENTS.md)  
**Structure:** [ARCHITECTURE.md](ARCHITECTURE.md)  
**Decisions:** [DECISIONS.md](DECISIONS.md)

## 1. Product statement

A browser-based tool that lets a user **hum or play a melody, convert it to editable notation, refine and transpose the score, practice it at different speeds and loops, and export it to standard formats**. The MVP is local-first and does not require an account.

**Product vision:** Accessible music capture, notation, practice and learning. Future traditional-music/gayageum support is an expansion, **not an MVP deliverable**.

## 2. Target users and primary jobs

| User | Need | Priority |
|---|---|---|
| Beginner / hobbyist | Turn a hummed idea into a readable score | P0 |
| Music student | Learn notes, slow down, repeat difficult bars | P0 |
| Teacher | Create and print short exercises | P0 |
| Instrumentalist / songwriter | Transpose, edit and export melodies | P0 |
| Traditional musician | Notate nonghyeon/jangdan/jeongganbo | Later |

### Primary user journey

1. Open site and choose **Hum** or **Piano**.
2. Set title, meter and tempo (or accept defaults).
3. Record a **short monophonic** melody, or enter notes via the on-screen piano.
4. Review automatically derived notes in an editable score.
5. Correct notes/rests, transpose, label pitches, assess range, and reuse phrases.
6. Play back at a preferred speed and rehearse an A–B selection.
7. Save locally and export as PDF, MIDI or MusicXML.

## 3. Functional requirements — fixed MVP scope

The following **14 feature groups** are all MVP requirements. Phase 0–6 only defines implementation order, not optionality.

| ID | Feature group | P | Required outcome |
|---|---|---|---|
| MVP-001 | Virtual piano input | P0 | Enter sounding notes in the shared Score |
| MVP-002 | Humming recording | P0 | Record microphone and show input/permission status |
| MVP-003 | Monophonic automatic transcription | P0 | Estimate pitches, note boundaries and quantized rhythm |
| MVP-004 | Notation rendering | P0 | Editable stave with meter, key, notes/rests and bars |
| MVP-005 | Basic score editing | P0 | Add, modify, delete notes/rests; undo/redo |
| MVP-006 | Selection and clipboard | P0 | Select and copy/cut/paste monophonic note phrases |
| MVP-007 | Transposition | P0 | Whole-score semitone/target-key transpose with proper notation |
| MVP-008 | Practice speed | P0 | Adjustable playback speed without changing musical score |
| MVP-009 | A–B loop | P0 | Repeat a selected valid playback range |
| MVP-010 | Note names and solfege | P0 | Off / letter / fixed-Do Korean names |
| MVP-011 | Range analysis and transpose suggestions | P0 | Min/max pitch; feasible shifts to user-supplied range |
| MVP-012 | Score playback | P0 | Start/pause/stop, highlighting, metronome, loop/rate integration |
| MVP-013 | Local score library | P0 | Create, autosave, reopen, delete, backup/restore |
| MVP-014 | Exports | P0 | PDF, MIDI, MusicXML consistent with current Score |

### MVP-001 — Virtual piano

- 88-note visual keyboard with desktop pointer/touch interaction; reasonable mobile scrolling/zoom.
- Add note at editing cursor with configured duration; preview audible pitch.
- Basic computer-keyboard shortcuts; document keyboard mapping and accessibility fallback.
- Display or warn if note exceeds playable/supported range.
- **Acceptance:** Enter C4–D4–E4–G4; score, playback and saved file reflect all four in order.

### MVP-002 — Microphone capture

- Request browser microphone permission on explicit user action, with clear consent wording.
- Start/stop recording; configure initial tempo and meter; enable optional metronome.
- Show permission state, elapsed time, input level and live estimated pitch where supported.
- Recover gracefully from denied permission, missing/disconnected microphone, silence and recording errors.
- Keep raw audio in-memory by default; do not upload it.
- **Acceptance:** Start/stop a short recording, show appropriate states, and deliver analyzable audio frames or actionable error.

### MVP-003 — Monophonic transcription

- Controlled scope: short single melody voice/humming with preselected tempo, not full-song or polyphonic transcription.
- Stages: preprocessing, voiced/silence discrimination, pitch confidence, smoothing, onset/offset boundaries, repeated-note split, quantization, conversion to candidate note/rest events.
- Show low-confidence regions for user correction; commit accepted results through normal edit commands.
- Test against synthetic tones and representative consented recordings; track pitch accuracy, onset accuracy, note-level precision/recall/F1, octave errors and manual correction burden.
- **Initial quality gate proposal:** note-level F1 >= 0.90 in a controlled benchmark; this is a **target, not verified performance**. Gate and dataset finalized before public beta.
- **Acceptance:** An 4–8 bar controlled melody produces editable, saveable notes; analysis errors never silently destroy an existing score.

### MVP-004 — Notation renderer

- Show staff, clef, key, meter, bars, notes/rests, tempo and current selected/playing note.
- Basic treble clef required; bass clef included within declared basic editing scope.
- Correctly display note spelling/accidentals after transposition and avoid rendering objects as authoritative data.
- Adapt layout for mobile without hiding core functionality.
- **Acceptance:** Domain data survives redraw and displays correct pitch/duration/key for the supported basic monophonic notation.

### MVP-005 — Basic editing

- Add/change/delete pitched note and rest; pitch and duration editing; add bar; edit title, meter, key and tempo within supported constraints.
- Undo/redo all persistent edits, including transposition and clipboard pastes.
- Enforce valid beat locations, non-overlap and bar/tie rules; explicitly reject or guide unsupported cases.
- **Acceptance:** Change a note, undo, redo, reload saved score, and obtain the expected note sequence.

### MVP-006 — Selection/copy/paste

- Select contiguous notes and/or bars in one monophonic voice; copy, cut, paste and delete selection.
- Preserve relative start and durations; regenerate note IDs on paste; define replace/insert behavior clearly in UI.
- Validate measure-boundary overlap, event collisions and undo/redo.
- **Acceptance:** Copy bars 1–2 to bars 3–4 without ID collisions or timing corruption.

### MVP-007 — Transposition (confirmed addition)

- Semitone offset in both directions and target major/minor key selection.
- Whole-score transformation with key signature and written accidental/enharmonic spelling consistent with the target key.
- Preview, confirm/cancel, undo and range warning.
- Playback, range, labels and exports must match the committed result.
- **Acceptance:** C major C4–D4–E4–G4 -> D major D4–E4–F#4–A4; preview cancel preserves source, confirm + undo restores source.

### MVP-008 — Practice speed (confirmed addition)

- 25%–150%, 5% increments; preset buttons for common rates.
- Apply to synthesized score playback while preserving pitch, and keep distinct from original score tempo.
- Explicitly do not promise pitch-preserving time stretch for recorded audio in MVP.
- **Acceptance:** 120 BPM score at 50% plays at effective 60 BPM; stored tempo remains 120 BPM and default MIDI export unchanged.

### MVP-009 — A–B loop (confirmed addition)

- Select first and last bar or explicit valid tick interval; enable/disable loop.
- Respect speed changes and handle end-boundary note-off/re-scheduling correctly.
- Keep loop settings in practice runtime state.
- **Acceptance:** Repeatedly play measures 3–4 without audible stuck notes, while Score remains unmodified.

### MVP-010 — Note names and solfege (confirmed addition)

- Toggle display: **Off**, letter names (C–B), and Korean fixed-Do solfege (도–시).
- Initial system uses fixed-Do, **not movable-Do**. Display chromatic alterations correctly and adapt to transposed notation.
- Labels are UI projections, not persisted note content.
- **Acceptance:** C4/D4/E4/G4 show correct letters/solfege; toggle off hides only labels; transpose recomputes labels.

### MVP-011 — Range analysis and transpose suggestion (confirmed addition)

- Compute lowest note, highest note and semitone span in a Score.
- Accept user-specified comfortable minimum and maximum; calculate whole-score semitone shifts keeping every note inside the supplied range.
- Rank valid candidates by smallest absolute shift; preview through transpose module.
- Do not claim to medically or vocally diagnose the user's actual capability.
- **Acceptance:** Show correct min/max; present only mathematically feasible shifts; when none exists, explain why.

### MVP-012 — Playback

- Start, pause, stop, play from cursor, optional metronome, highlight current note.
- Use original score timing/pitches through a scheduling abstraction and connect practice speed and loop settings.
- Release sounding notes on stop; report blocked browser audio initialization when needed.
- **Acceptance:** Notes sound in scored sequence with correct relative durations; pause/resume and A–B loop behave predictably.

### MVP-013 — Local-first scores

- Save locally using IndexedDB, with autosave feedback and manual save.
- List, reopen, rename, and delete scores; safe handling of schema version and import errors.
- User-controlled backup/export and recovery/import. Warn about browser-storage deletion.
- **Acceptance:** Save, reload browser, reopen same notes/title, export backup and restore an equivalent score.

### MVP-014 — Export

- Print-ready PDF with readable title, clef, measures, time/key and current notes.
- MIDI preserving sounding pitches, event timing and tempo.
- MusicXML preserving supported written music structure, including key/meter and note spelling where feasible.
- User names file; unsupported notation is signaled rather than silently corrupted.
- **Acceptance:** All three files download and can be reopened/inspected by compatible tools; their notes/timing match canonical Score in supported cases.

## 4. Usability and page requirements

| Page | Essential elements |
|---|---|
| Home `/` | Product intro, new score, Hum / Piano entry, recent score access (P6-02: 3 most recent) |
| Recorder (editor panel) | Mic permission, device states, tempo/meter, level, pitch visualization, recording actions. **2026-11-14 user-approved change (D-04 #2):** implemented as the recording panel inside `/editor/[scoreId]`; Home "Hum" creates a score and opens that panel. No separate `/record` route. |
| Editor `/editor/[scoreId]` | Score/staff, main toolbar, note tool, piano/record panel, playback, transposition, practice controls, file export |
| Library `/library` | Saved scores, rename/open/delete, backup/import |

**Desktop editor layout:** top toolbar, left editing controls, center notation, contextual right properties and optional bottom piano/record/practice panel. **Mobile:** prioritize readable staff and collapse secondary controls into accessible tabs/drawers. Keyboard and screen-reader pathways must not rely exclusively on canvas/pointer gestures.

## 5. Non-functional requirements

- **Correctness:** all modules use canonical Score and pass invariants/command flow.
- **Privacy:** no background audio upload; request microphone on explicit user action; disclose local storage.
- **Reliability:** no silent data loss on errors; autosave feedback and user backup.
- **Performance:** avoid full React re-renders for each audio sample; keep waveform/DSP off the UI hot path when possible.
- **Compatibility:** current desktop Chrome and Safari plus mobile Safari/Chrome for supported APIs; feature-detect and disclose limitations.
- **Security:** no secret keys in client code; validate imports and serialized Score.
- **Accessibility:** keyboard-accessible primary controls, usable labels and status messages.
- **Quality:** strict TypeScript, unit/integration/E2E checks, architecture boundaries and build gate.
- **Compliance:** appropriate privacy/terms pages for public launch; review music/audio rights and dependency licenses.

## 6. Exclusions / deferred scope

**Not in MVP:** Supabase login/cloud sync, real-time collaboration, automatic full-song polyphonic transcription, chord progression recommendation, piano-roll editing, MP3/WAV file import, required Web MIDI hardware input, multi-part accompaniment/separation, Jeongganbo, gayageum technique detection, payment/subscription. Future compatibility may influence domain interfaces but not require implementing these now.

## 7. Delivery phases and gates

| Phase | Outcome | Exit gate |
|---|---|---|
| 0 — Foundation | Documents, Next.js skeleton, Score types, commands, test/architecture gates | Invalid imports detected, types and basic tests pass |
| 1 — Score foundation | Piano, notation, edit, playback, IndexedDB | Enter/modify/play/save/reopen four-note melody |
| 2 — Music education | Transpose, letter/fixed-Do labels, range+shift suggestions | Cross-feature consistency + Undo validated |
| 3 — Practice/clipboard | Playback speed, A–B loop, contiguous copy/cut/paste | Score unchanged by practice; phrase edit undo passes |
| 4 — Humming | Mic, pitch/onsets/quantize, editable provisional score | Controlled transcription benchmark and user correction workflow |
| 5 — Export | PDF, MIDI, MusicXML | Supported round-trip/inspection successful |
| 6 — Beta hardening | Mobile/accessible flows, error/recovery, full regression, public deploy | All 14 groups meet their gates, no critical defects |

**Scheduling:** time estimates are planning assumptions only; feature quality gates govern completion. No phase can be marked complete solely because the UI exists.

## 8. Test matrix

| Test family | Required examples |
|---|---|
| Domain | pitch bounds, 960 PPQ rhythm, measure validity, transposition spelling, non-overlap |
| Editing | command validation, undo/redo, selection ID regeneration, paste collisions |
| Cross-feature | transpose -> display/playback/range/export; labels after transpose |
| Playback | tempo/rate semantics, A–B boundary, no hanging notes |
| Storage | save/load after reload, backup/restore equivalence, corrupt/schema mismatch |
| Audio | silence, noise, repeated notes, unstable pitch, octave jumps, permission rejection |
| Exports | printed PDF layout, MIDI event timing, MusicXML meter/key/spelling compatibility |
| Browser/E2E | full user journey on desktop and supported mobile browsers |
| Architecture | forbidden import detection, circular references, public feature boundaries |

Quality target: measure pitch and note detection with documented dataset/methodology; proposed controlled benchmark note F1 >= 0.90 prior to beta (not a guarantee). All critical user journeys must be manually and automatically verified as practical.

## 9. Success metrics (beta hypotheses, not measured)

- First successful editable score completion rate.
- Time from initial input to exported score.
- Manual corrections per transcribed note and note-level F1.
- Score reopen/backup success and number of data-loss incidents.
- Practice session completion and A–B repeat usage.
- Conversion from first created score to second session.

Instrument only necessary, privacy-respecting signals. Product analytics and pricing decisions are deferred until real usage evidence is available.

## 10. Architecture and change-control agreement

- Product changes: update this PRD with explicit user approval when they affect confirmed scope.
- Structural changes: propose ADR, get user approval, update architecture/contracts and execute tests.
- New code: inspect/reuse existing modules before creating abstractions.
- Engineering checkpoints: `npm run typecheck`, `lint`, `test`, `check:architecture`, `build` after Phase 0 configuration.
- Codex must report actual completed/verified status, never imply that unchecked features work.

## 11. MVP final acceptance scenario

A new user can create a score without logging in, input notes with the piano **or** capture a short hummed melody, edit and transpose it, enable letter/fixed-Do labels, inspect range and suggested shifts, adjust practice speed, loop a bar range, copy/paste a phrase, play it back, save/reopen locally, and export the current version to **PDF, MIDI and MusicXML**. These actions must remain internally consistent, recover gracefully from typical input errors and be usable on the declared supported browsers.
