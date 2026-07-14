# Signal Rack

An Electron MIDI sequencer built around device-specific rack units.

The first rack unit is a three-voice Digitone instrument built for a stable pulse with disrupted surface: an independent-length bass phrase, a modal-vamp lane, and sparse FM punctures. Each of its 16 cells is editable for notes, velocity, gate, and chance. It also provides selectable MIDI output/channels, BPM, MIDI clock/transport, per-lane octave transpose, groove feel, and performance mute, four subtractive arrangement scenes, and two live sound macros per lane.

## Run it

```bash
npm install
npm run dev
```

Select the Digitone's MIDI output in the upper-right control, choose the T1/T2/T3 channels, then press Play. Configure the Digitone's synth-track MIDI channels to match. The defaults are channels 1, 2, and 3.

For the live `TONE` and `SPACE` controls, set `MIDI CONFIG > PORT CONFIG > RECEIVE CC/NRPN` to enabled on the Digitone. `TONE` moves filter frequency and FM feedback; `SPACE` moves delay and reverb sends. The controller uses documented Digitone NRPN messages so those macros are track-specific.

Each cell accepts notes as MIDI numbers (`38 41 45`) or scientific note names (`D2 F2 A2`); leave its note field blank or use **MAKE REST** for silence. Phrase lengths apply from the start of each 16-cell row, so unused cells remain available if you later extend a lane.

## Current state

Signal Rack is now a playable three-track performance sequencer rather than a fixed-pattern demo. The default patch is intentionally sparse: a 14-step bass phrase, 16-step chord/vamp phrase, and 12-step puncture phrase create movement before probability or groove offsets are added. `FULL`, `BASS`, `SPACE`, and `DROP` provide quick subtractive arrangement states; each lane's `MUTE` button is an independent live override and sends an immediate all-notes-off message for that lane.

`TONE` is a focused timbre macro (filter frequency plus FM feedback), and `SPACE` is a send macro (delay plus reverb). They are intentionally not a full Digitone editor: make or choose the core Sounds on the Digitone, then use Signal Rack to sequence and perform them.

## Deliberately not included yet

- Pattern saving, recall, or MIDI-file export.
- MIDI input recording or control of Digitone pattern/Sound selection.
- A complete Digitone parameter editor or a general-purpose drum sequencer.

Those are worthwhile only if they preserve the controller's main job: quickly making bass-led, modal, rhythmically unsettled sketches that can be performed through subtraction.
