# ARCHITECTURE.md — Music Score Platform

**Version:** 2.0  
**Status:** Approved architecture baseline for MVP implementation  
**Baseline date:** 2026-11-07  
**Related documents:** [PRD](PRD.md) · [Decisions](DECISIONS.md) · [Root instructions](../AGENTS.md)

## 1. Architecture goal

Deliver a **local-first, browser-centered modular monolith** that turns monophonic humming or piano input into editable sheet music with consistent playback, transposition, practice tools and PDF/MIDI/MusicXML outputs. The domain model must permit future gayageum/traditional-music plugins without putting those features in the current MVP.

### Non-negotiable invariants

1. Exactly one canonical persistent **Score** model.
2. All edits flow through a validated edit-command/application boundary.
3. Domain logic remains independent from React and integration libraries.
4. Playback, rendering, range analysis, labels, storage and export operate on the same Score (or immutable projections).
5. Practice settings never destructively modify score tempo/pitches.
6. Any architectural change follows the ADR approval protocol.

## 2. Technology and runtime boundaries

| Concern | Baseline choice | Notes |
|---|---|---|
| Web application | Next.js App Router, React, TypeScript strict | The deployed app can be served via Vercel |
| Styling | Tailwind CSS | Accessible and responsive |
| Score rendering | VexFlow adapter | Renderer is not a data store |
| Scheduled playback | Tone.js adapter | Audio is activated on user gesture |
| Capture / audio analysis | Web Audio API; AudioWorklet when appropriate | Browser permission; prefer local processing |
| Pitch estimation | Tested monophonic DSP library or isolated implementation | Choose implementation during Phase 0/4, not baked into domain |
| Persistence | IndexedDB through repository port | No account required for MVP |
| Schema validation | Zod or equivalent | Validation at persistence/import boundaries |
| Testing | Vitest + Playwright | Unit, integration, real-browser E2E |
| Delivery | Git + Vercel | Deployment after quality gate |

**Phase 0 must validate package/library compatibility.** Introducing or replacing a core production dependency follows `AGENTS.md` approval rules. Python/FastAPI, Supabase, commercial recording separation and AI-agents are not part of the MVP architecture.

## 3. High-level flow

```text
[Next.js pages / React UI]
          |
          v
[Application use cases and feature public APIs]
          |
          v
[Canonical Domain: Score + music time + commands + theory]
     ^       ^          ^            ^
     |       |          |            |
[Recording] [Notation] [Playback] [Persistence / Exports]
 Web Audio   VexFlow    Tone.js      IndexedDB / file adapters
     |
[Pitch detection -> segmentation -> quantization]
     |
[Candidate note events -> reviewed edit commands -> Domain]
```

The diagram describes data flow, **not permission for Domain to import adapters**. Outer layers call Domain; adapters implement ports defined by inner layers.

## 4. Layer boundaries

### `src/domain/`
Pure music concepts: `Score`, `Part`, `Measure`, `NoteEvent`, `RestEvent`, `Pitch`, tuning/notation fields, fixed musical-time ticks, key signatures, intervals, validation, pure transpose/range calculations and edit-command reducers.

- **Allowed:** TypeScript, pure approved utilities.
- **Forbidden imports:** React, Next.js, browser globals/Web Audio, VexFlow, Tone.js, IndexedDB, Supabase, feature UI.
- **Owns:** musical correctness, versioned schema and invariants; it does **not** save to disk or draw staves.

### `src/application/`
Use cases and ports such as `ScoreRepository`, `AudioTranscriptionPort`, `PlaybackPort` (where beneficial), `ExportPort`; orchestrates domain operations, save/load and analysis review.

- Depends on Domain, not concrete adapters.
- Should not contain React components or raw `indexedDB` calls.

### `src/features/`
User-facing vertical capabilities: piano input, audio recording, transcription, score editor, transposition, practice, labels, range analysis, selection, score library and export.

- May compose Application/Domain via stable public APIs.
- A feature may not import another feature's private implementation file.
- Avoid separate writable copies of the Score state.

### `src/adapters/`
Concrete VexFlow, Tone.js, Web Audio, IndexedDB, MIDI, MusicXML and PDF implementations.

- Convert Domain models into library-specific objects and back.
- Must not introduce a second canonical mutable model.
- External APIs are wrapped for testing/replacement.

### `src/app/` and `src/components/`
Next.js routes and visual components, selection states, toolbars and interaction flows. UI requests application commands rather than mutating domain objects directly.

## 5. Directory baseline

```text
music-score-platform/
├── AGENTS.md
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── DATA_MODEL.md          # created in Phase 0
│   ├── MODULE_CONTRACTS.md    # created in Phase 0
│   ├── TASKS.md               # created in Phase 0
│   └── TEST_PLAN.md           # created in Phase 0
├── src/
│   ├── app/
│   ├── components/
│   ├── domain/
│   │   ├── score/
│   │   ├── music-theory/
│   │   └── commands/
│   ├── application/
│   ├── features/
│   │   ├── piano-input/
│   │   ├── audio-recording/
│   │   ├── transcription/
│   │   ├── score-editor/
│   │   ├── transposition/
│   │   ├── playback/
│   │   ├── practice/
│   │   ├── note-labels/
│   │   ├── range-analysis/
│   │   ├── selection/
│   │   ├── score-library/
│   │   └── export/
│   ├── adapters/
│   │   ├── vexflow/
│   │   ├── tone/
│   │   ├── web-audio/
│   │   ├── indexeddb/
│   │   └── file-export/
│   ├── store/
│   └── shared/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
└── package.json
```

This is a **target layout**, not a demand to create empty directories. Add module-specific folders only when a real feature needs them. Public modules expose a documented `index.ts` or equivalent public entrypoint.

## 6. Canonical music data model

- `Score`: ID, schema version, title, global tempo, parts, measures, score metadata.
- `Part` / `Voice`: support one active monophonic voice in the MVP while leaving room for more.
- `Measure`: time signature, key signature, ordered note/rest events and positions.
- `NoteEvent`: stable ID, pitch information, onset/start tick, duration ticks, velocity, notation-specific spelling and provenance.
- `RestEvent`: onset, duration, stable ID.
- `Pitch`: sounding MIDI pitch plus diatonic step/alter/octave for correct notation spelling, optional cents/pitch contour metadata for future work.
- **Musical time:** 960 PPQ (ticks per quarter note) for MVP. Preserve original recording time (seconds/sample positions) separately from quantized ticks.

**Invariants:** unique IDs; positive durations; valid MIDI range; non-negative positions; no unintended overlapping notes in a monophonic voice; measure boundary rules; canonical serialization with schema version; stable restore/migration path.

Detailed types, validation and example JSON belong in `docs/DATA_MODEL.md` (Phase 0). Changes to public types require impact review.

## 7. Command model and state ownership

```text
User intent -> Application use case -> Validated EditCommand
            -> Pure domain transformation -> New Score
            -> UI update + undo history + scheduled persistence
```

Examples: `AddNote`, `UpdateNote`, `DeleteNote`, `InsertRest`, `TransposeScore`, `PasteSelection`. Prefer immutable updates or an equivalent documented transaction mechanism. Undo/Redo must be tested across editing and transposition.

Three state partitions:

1. **Persistent music state:** authoritative `Score` in one store.
2. **UI state:** selection, panel visibility, transpose previews, label mode, chosen editing tool.
3. **Runtime state:** mic input, pitch observations, audio scheduling cursor, transport status and practice loop/rate.

Do not persist raw `MediaStream`, audio nodes, timers or library renderer objects in Score.

## 8. Feature contracts and interactions

| Capability | Canonical input | Output / effect | Domain rule |
|---|---|---|---|
| Virtual piano | note/pitch, duration, insertion cursor | edit command | same model as humming |
| Transcription | sampled audio and settings | candidate pitches/notes, then review and commands | recording result is provisional until accepted |
| Score editor | validated command | updated Score | edits pass command pipeline |
| Transposition | Score + semitone shift or target key | preview and accepted Score | sounding pitches and enharmonic spelling are both handled |
| Note labels | Pitch + key + display mode | read-only display labels | fixed-Do initially; do not overwrite note spelling |
| Range analysis | Score + preferred min/max | lowest/highest and valid shift candidates | cannot infer actual singing ability |
| Playback | Score + transport settings | sound + cursor events | use updated Score |
| Practice | loop start/end ticks, rate | playback-only behavior | never rewrite canonical tempo |
| Selection | selected IDs + relative positions | clipboard payload, validated edit command | new pasted IDs; handle collisions |
| Persistence | validated, versioned Score | save/load/list/delete | migrate old versions safely |
| Export | validated Score | PDF/MIDI/MusicXML | output consistent with score; identify unsupported notation |

Module interface definitions and permissible dependencies are finalized in `docs/MODULE_CONTRACTS.md` in Phase 0.

## 9. Audio transcription pipeline

```text
Mic permission / getUserMedia
 -> capture/frames
 -> filter, amplitude and silence detection
 -> monophonic pitch estimate with confidence
 -> pitch smoothing and octave-error mitigation
 -> note onset / offset segmentation (incl. repeated same pitch)
 -> beat-grid quantization against user tempo and meter
 -> candidate NoteEvents + diagnostic confidence
 -> user review in editor -> commit to Score
```

**MVP boundaries:** short, monophonic humming at a specified tempo, offline-after-recording generation (live pitch display optional within MVP). No claim of general polyphonic-song accuracy. Do not persist/upload voice without explicit user action. Benchmark note-level precision/recall/F1 with controlled fixtures.

## 10. Practice, transposition and notation specifics

- **Transpose:** +/- semitones and target key, update pitched events and key/accidental spelling, show preview, warn for out-of-range notes, use history for restoration.
- **Tempo:** original score tempo is separate from `practiceSpeed` (25–150%, 5% steps). Playback speed does not silently change MIDI/PDF export tempo.
- **A–B loop:** define valid loop interval `[startTick, endTick)` with start < end; ensure note-off and scheduling correctness at the boundary.
- **Labels:** Off, letter names, fixed-Do Korean labels; compute at display time and update after transposition.
- **Vocal range:** min/max note and feasible semitone shifts from user-provided target range; no unsupported claims about a person's capabilities.
- **Clipboard:** copy selected monophonic note events relative to origin; new IDs on paste; validate time overlap and measure transitions.

## 11. Local persistence and export

- IndexedDB through a `ScoreRepository` interface; separate autosave, manual export/backup and app state. Warn about browser data deletion.
- No cloud account or server database required in MVP.
- Exporters are independent adapters: PDF for print-ready notation, MIDI for performed pitch/timing, MusicXML for notated score structure.
- Round-trip and compatible external application tests should check rhythm, key, note spelling where supported; document loss for unsupported elements.

## 12. Automated compliance

Set up in **Phase 0**, then use as a merge/release gate:

```bash
npm run typecheck
npm run lint
npm run test
npm run check:architecture
npm run build
```

The architecture script is **not provided by default**; implement a real rule set using ESLint boundaries, dependency-cruiser or an equivalent tool. Verify that intentionally forbidden imports fail the check, then remove the test violation. Require circular dependency checks, no Domain imports from outer layers, no private cross-feature imports, and regression tests for data/command invariants. Add E2E tests for keyboard input, transpose, loop, persistence and exports as those features appear.

## 13. Architecture change process

1. Capture problem and affected contracts.
2. Consider reuse/configuration first; evaluate alternatives.
3. Propose an ADR with risk, migration and test plan.
4. Obtain **explicit user approval** for structural change before editing implementation.
5. Mark ADR `Accepted`; update this architecture and contract docs.
6. Implement and pass compliance tests.

The developer can evolve details within these boundaries without repeated approval. **Do not change the approved MVP scope casually.**

## 14. Evolution path (not in MVP)

Cloud accounts via Supabase adapter; polyphonic audio and multi-part; piano roll; chord recommendation; WAV/MP3 import; external Web MIDI enhancement; ensemble notation; gayageum tuning, ornaments and pitch bends; jangdan and Jeongganbo rendering. Keep these out of the Phase 0–6 scope unless specifically authorized.
