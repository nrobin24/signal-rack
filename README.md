# Signal Rack

Signal Rack is a Tauri desktop MIDI environment built from device-specific instrument modules and a shared musical direction layer. React renders the rack; Rust owns generation, clocking, modulation, scheduling, and CoreMIDI output.

The rack currently contains four top-level modules:

- **Seed Lab** turns a small set of plain-language choices into related material for the whole rack.
- **Global LFOs** provides four transport-synced modulation sources that can be routed into supported parameters.
- **Digitone** provides bass, chord/vamp, and puncture lanes with editable notes, timing, probability, scenes, and sound macros.
- **Digitakt** provides seven rhythm voices—kick, snare, closed hat, open hat, rimshot, clap, and texture—with editable trigs, timing feel, channels, and mutes.

## Run it

```bash
npm install
npm run test:e2e:install
npm run dev
```

The first run compiles the Rust backend and opens the native Tauri window. Signal Rack requires Node.js, the stable Rust toolchain, and the Xcode command-line tools on macOS.

Useful development commands:

```bash
npm run dev          # Vite + native Tauri development window
npm run check        # TypeScript, Rust, and frontend production checks
npm test             # Rust unit tests + browser E2E command-boundary test
npm run test:e2e:install # One-time Chromium install for the E2E suite
npm run midi:ports   # Native CoreMIDI output scan
npm run build        # Production macOS .app bundle
```

The Playwright E2E suite runs the real React interface against a mock of the Tauri command boundary, so it never sends notes to connected hardware. Rust unit tests cover generation, groove timing, LFO waveforms, clock periods, and value clamping. Use `npm run midi:ports` and the native development window for hardware validation; the browser preview alone does not exercise CoreMIDI. Production builds are written to `src-tauri/target/release/bundle/macos/Signal Rack.app`.

The transport and tempo are global. Each instrument module has its own MIDI output selector, so Digitone and Digitakt can be connected directly over separate USB MIDI ports. Either instrument can run by itself.

## Architecture

The frontend sends typed Tauri commands for output discovery and selection, rack configuration, transport, macro changes, and Seed Lab generation. Rust keeps the authoritative sequencer state and emits step/stopped events back to the interface.

The native engine provides:

- A 24-PPQN MIDI clock and synchronized transport messages.
- Per-lane length, groove offsets, probability, velocity, gate scheduling, mutes, and note releases.
- Shared-port or separate-port Digitone/Digitakt routing through CoreMIDI.
- Digitone Tone/Space NRPN macros and clocked Global LFO modulation.
- Deterministic Seed Lab harmony, motif, and rhythm generation for all ten lanes.

The command boundary lives in `src/renderer/src/backend.ts`; Rust modules live in `src-tauri/src`. Electron, its preload bridge, the Node MIDI dependency, and the TypeScript generator/LFO engines are no longer part of the application.

## Seed Lab

Choose a root, vamp color, bass role, rhythm idea, and energy level, then press **SEED RACK**. One related pattern is written directly into all ten lanes:

- Digitone receives bass pitches and phrase length, extended-chord voicings, sparse upper-register punctures, timing feel, chance, and starting `TONE`/`SPACE` values.
- Digitakt receives related kick, snare, closed-hat, open-hat, rimshot, clap, and texture parts derived from the same rhythm concept.

Repeated presses keep the direction but create small deterministic mutations. The planned “grow three sketches, audition, then commit” workflow is intentionally deferred; this first version stays immediate.

## Global LFOs

Each of the four LFOs has a selectable shape, clock-synced time, and bipolar depth. Shapes include sine, triangle, square, rising and falling ramps, and sample-and-hold. Times range from a quarter note through 32 bars and restart with the transport.

Supported instrument parameters have a modulation-source selector beside their manual control. Choose `LFO 1`–`LFO 4`, or `MANUAL` to disconnect modulation. The manual value stays as the center point and the LFO depth determines how far the parameter moves around it, clamped to the MIDI range.

## Digitone setup

Select the Digitone output in its module, then configure synth tracks 1–3 to match the displayed MIDI channels. Defaults are channels 1, 2, and 3.

For `TONE` and `SPACE`, enable `MIDI CONFIG > PORT CONFIG > RECEIVE CC/NRPN`. `TONE` moves filter frequency and FM feedback; `SPACE` moves delay and reverb sends using documented Digitone NRPN messages. Either macro can be routed independently to one of the four Global LFOs.

Each cell accepts MIDI numbers (`38 41 45`) or scientific note names (`D2 F2 A2`). Leave the note field blank or press **MAKE REST** for silence. Phrase lengths apply from the start of each 16-cell row.

Digitone scenes currently control only the three Digitone roles. The Scene Lens shows the exact density applied to Bass, Vamp, and Puncture; per-lane mutes remain independent overrides.

## Digitakt setup

Load appropriate Sounds on Digitakt audio tracks 1–7 in this order: kick, snare, closed hat, open hat, rimshot, clap, and texture. Select the Digitakt output in its module and match those tracks to MIDI channels 1–7, or change the channel selectors in Signal Rack.

Enable `MIDI CONFIG > PORT CONFIG > RECEIVE NOTES`. Signal Rack sends MIDI note 60 to each track channel, which plays the loaded Sound at its base pitch. It sequences the Sounds already loaded on the hardware; it does not transfer samples or replace the Digitakt project.

## Current scope

Signal Rack is now a playable multi-instrument sketch system. The key constraint remains: generate a specific musical proposition quickly, then perform and edit it rather than managing a large theory system.

Not included yet:

- Three-sketch audition and commit flow.
- Pattern saving, recall, or MIDI-file export.
- MIDI input recording or Digitone/Digitakt Sound selection.
- Full hardware parameter editors or sample management.
