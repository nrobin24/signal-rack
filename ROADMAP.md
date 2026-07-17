# Signal Rack Development Roadmap

Status: active. The Generator Lab foundation and the current rack-performance tools are implemented; controlled generator repair and later roadmap phases remain planned unless noted otherwise.

## Roadmap

1. Focused generator repair.
2. Behringer Pro-1 and RD-6 instrument support.
3. A/B arrangement model.
4. Derive B from A.
5. Generated drum parameter gestures.
6. Follow-up instruments: RD-9, TD-3, Machinedrum MKII non-UW, and Monomachine.

The central product rule across every phase is:

> Signal Rack exposes musical intentions; the generator owns the tedious sequencing details.

Signal Rack should not become a desktop recreation of an Elektron sequencer or a small DAW. Low-level note placement, probability, microtiming, articulation, and parameter movement should primarily be generated from a compact set of musical choices. Manual step editing remains an escape hatch rather than the main workflow.

## Current product baseline

The rack currently includes:

- A Phrase Generator for coordinated ten-lane, four-bar material.
- Eight clocked modulation sources, including drawn curves and 64/128-bar periods.
- Twelve Euclidean presets plus custom hit, length, and rotation controls for one lane at a time.
- A Digitone-only arpeggiator seeded from the generated phrase.
- One global eight-state Scene Generator controlling coordinated Digitone and Digitakt density profiles.
- Per-lane cutoff and delay modulation, plus Digitone octave modulation.
- Collapsible per-instrument MIDI output and channel setup.
- A Generator Lab scorecard, native Save As export, and warnings for unexported sessions.

The current Scene Generator is a performance layer over one four-bar phrase. The A/B part scenes described in Phase 3 are a separate future system tied to saved arrangement parts.

## 1. Focused generator repair

The first phase improves the existing generator and establishes a fast human/AI collaboration loop for musical evaluation.

The goal is not merely to create better presets. The goal is to make it possible for an agent to form specific hypotheses, generate controlled candidates, receive structured human feedback from listening on the actual hardware, correlate that feedback with the generated sequence data, and iterate quickly without losing good results.

### 1.1 Generator Lab

Implementation status: the initial lab workflow is available from the app header. It supports focused experiment briefs, frozen 6-12 candidate batches, neutral candidate labels, one-cycle/two-cycle/loop auditioning through the normal MIDI engine, Keep/Maybe/Reject verdicts, a role-by-dimension scorecard with progressive detail, listening notes, post-verdict detail reveal, and native JSON session export. Candidate A/B comparison and time-specific playback annotations remain follow-up work in Phase 1.2.

Generator Lab should be a dedicated development mode inside Signal Rack. It should use the normal MIDI engine and hardware routing, but replace the normal Seed interface with a listening and evaluation workflow.

It is not intended to become a general-purpose sequence editor.

#### Session workflow

1. The agent defines a focused experiment and states its hypothesis.
2. The agent generates a batch of approximately 6-12 candidates.
3. Signal Rack freezes the batch so its contents cannot silently change during evaluation.
4. The human listens to each candidate for one or two complete four-bar cycles on the actual hardware.
5. The human labels the candidate and optionally annotates a specific problem or positive quality.
6. The agent reads the complete evaluation session.
7. The agent correlates the feedback with note positions, timing offsets, chord choices, bar-level transformations, and instrument interactions.
8. The agent makes one narrow generator change.
9. The agent produces a new batch containing a previous baseline, new experimental candidates, and known-good regression candidates.
10. The loop repeats until the musical behavior is stable.

A typical session should take approximately 15-25 minutes. Candidate batches should stay small enough that attention and judgment do not deteriorate.

### 1.2 Candidate interface

The interface should be optimized for listening rather than editing.

Primary controls:

- Play candidate.
- Stop.
- Replay.
- Previous and next candidate.
- Play one cycle, two cycles, or loop continuously.
- Compare candidate A against candidate B.
- Keep, Maybe, or Reject.
- Add quick scorecard ratings.
- Add a freeform note.
- Reveal candidate details after labeling.

Candidates should initially appear under neutral labels such as `CANDIDATE 04`. The interface should not reveal whether a candidate is the old generator, a new experiment, or a known-good reference until after the human has evaluated it. This reduces expectation bias.

After evaluation, the interface may reveal:

- Rhythm style.
- Root and chord vocabulary.
- Phrase shape.
- Phrase leader.
- Energy.
- Seed and variation ID.
- Whether the candidate was a baseline, regression fixture, or experiment.
- A concise description of what changed.

#### Fast evaluation scorecard

The first-pass evaluation should be psychologically cheap and structurally consistent. A compact matrix uses Full Rack, Drums, Bass, Harmony, and Puncture as rows, with Pitch, Groove, Step Placement, and Development as columns. Each applicable cell is Good, Bad, or left blank when the listener has no strong judgment. Development means whether the role evolves appropriately across four bars without losing its identity.

Selecting Bad progressively reveals one optional standardized cause for that dimension:

- Pitch: Outside key; Chord clash; Register.
- Groove: Too stiff; Lurches; Wrong feel.
- Placement: Too busy; Too empty; Wrong moment.
- Development: Too static; Too random; Bad turn.

This keeps the default interaction fast while preserving actionable, role-scoped signal when a problem is obvious. Hardware patch, tuning, and monitoring problems belong in the session setup or freeform note rather than the generator evaluation.

#### Time-specific annotations

When the human adds a note while playback is running, the harness should automatically record:

- Current bar.
- Current global step.
- Current per-lane positions.
- Candidate ID.
- Playback cycle number.

This lets the agent connect comments such as "the fill lurches here" to the exact kick, snare, hat, bass, harmony, and timing events around the annotated moment.

### 1.3 Experiment data

Evaluation data should be plain, structured, replayable, and easy for an agent to search and diff.

| Record | Contents |
| --- | --- |
| Session | Goal, hypothesis, target style, hardware setup, BPM, generator version, and candidate IDs |
| Candidate | Input settings, seed, full generated arrangement, timing data, implementation label, and hardware state |
| Evaluation | Verdict, scorecard ratings, optional causes, freeform note, annotated bar/step, and listening duration |
| Comparison | Candidate pair, preference, and strength of preference |
| Summary | Agent-generated findings, next hypothesis, unresolved questions, and promoted fixtures |

Every candidate must store its complete generated arrangement, not merely its seed. An old seed may produce different material after the generator changes; storing the rendered result keeps old candidates replayable.

Candidate metadata should include:

- Git commit or generator build ID.
- Generator schema version.
- Complete generator settings.
- Complete rendered lane data.
- Output routing.
- BPM.
- Instrument mute state.
- Macro state.
- Digitone/Digitakt project or patch names when relevant.

Raw experiment sessions can use append-only JSONL. A smaller curated fixture set should hold the most useful reference-good and reference-bad candidates.

Suggested eventual layout:

```text
research/generator-lab/
  sessions/
  summaries/
  fixtures/
```

The exact path can change during implementation, but the files should remain directly readable by both humans and agents.

### 1.4 Agent experiment protocol

The agent should follow a consistent protocol for every repair iteration:

1. Read the latest human evaluations.
2. Identify one dominant failure or uncertainty.
3. State a concrete musical and technical hypothesis.
4. Change only the subsystem needed to test that hypothesis.
5. Generate a controlled candidate batch.
6. Include at least one unchanged baseline.
7. Include known-good styles when regression risk exists.
8. Wait for human evaluation rather than drawing conclusions from structural tests alone.
9. Compare feedback with the complete candidate data.
10. Keep, revert, or revise the change based on the evidence.

Example:

> Observation: Electro candidates are repeatedly tagged "groove lurches," especially around closed hats. Hypothesis: the shared Broken timing profile is displacing hats that should remain machine-tight. Experiment: preserve every note position and compare the old profile, a straight profile, and two mild lane-specific timing recipes.

This protocol should prevent broad, difficult-to-interpret changes such as "make Electro better."

The agent should not change the generator while the human is in the middle of a frozen evaluation session.

### 1.5 Evaluation stages

#### Stage A: calibration

Begin with a small batch that reproduces the current judgments:

- House: good.
- Dub: good.
- Jungle: good.
- UK Bass: good.
- Broken Pocket: bad.
- Footwork: bad.
- Electro: bad.
- Brazilian: bad or undefined.

This verifies that the harness captures the human's listening judgments accurately and establishes a shared vocabulary for later annotations.

#### Stage B: rhythm repair

Hold harmony constant and reduce pitched distraction so rhythm judgments are attributable.

Work in this order:

1. Electro.
2. Footwork.
3. Regression pass on House, Dub, Jungle, and UK Bass.
4. Decide whether Broken Pocket has a distinct and worthwhile identity.

Electro's target is Detroit/Miami machine funk centered around Drexciya and DJ Stingray. It should favor deliberate machine-tight timing, recognizable backbeat relationships, syncopated kick movement, fast hats, and carefully placed tom/cowbell/percussion events. It should not receive a generic Broken timing treatment merely to make it sound unusual.

Footwork's target is DJ Rashad. The first experiment should determine whether improved onset placement and lane-specific timing are sufficient. If not, the generator may need hidden substeps or retrigs for rapid snare and percussion gestures. These remain generated behaviors and do not become a per-step editing interface.

Broken Pocket should be removed from the public selection unless a clear identity is found that House, UK Bass, Footwork, and Electro do not already cover.

Brazilian should temporarily leave the public generator. A future listening exercise should choose a specific rhythmic family rather than attempting to represent "Brazilian" music as a single style.

#### Stage C: harmony vocabulary repair

Use one known-good rhythm bed, probably House, to isolate harmony.

Visible harmony controls remain:

- Root.
- Chord Vocabulary.

A chord vocabulary internally controls:

- Allowed pitch material.
- Chord qualities.
- Voicing shapes.
- Voice count.
- Register.
- Maximum spread.
- Dissonance tolerance.
- Neighboring chords.
- Voice-leading rules.
- Responses to energy and four-bar phrase shape.

Initial vocabulary candidates:

- Warm House: preserve and refine.
- Soulful Minor or Minor Modal: replace Dorian Smoke.
- Restrained Jazz-Funk: smaller shells and stricter voice leading.
- Suspended Dub or Airy 6/9: replace Open Fourths.

There should be no visible Mode, Voicing, Dissonance, or Harmonic Motion controls. Root establishes the tonal center; Chord Vocabulary establishes the harmonic world; Energy and Four-Bar Shape influence how that world develops.

If the result later proves too restrictive, the first additional control considered should be a simple `STABLE / MOVING` choice. It should not be added until listening demonstrates a real need.

#### Stage D: four-bar behavior

Once the vocabulary sounds good, compare candidates where only Phrase Shape changes.

Evaluation questions:

- Does bar 2 feel like confirmation rather than mechanical repetition?
- Does bar 3 introduce audible development?
- Does bar 4 turn back, pivot, or create anticipation?
- Are note choices changing meaningfully, not only trigger density?
- Does the selected phrase leader actually lead the phrase?
- Are multiple roles competing to create the bar-4 turn?

The harness should support separate judgments for timing shape, pitch/harmonic shape, and the overall phrase.

#### Stage E: full-rack integration

Reintroduce bass, harmony, puncture, and all drum roles.

This catches interaction failures that isolated testing cannot expose:

- Bass and chord roots colliding.
- Puncture notes duplicating or fighting chord tops.
- Multiple bar-4 fills competing.
- Drum microtiming fighting the bass groove.
- Harmony that works alone but crowds the complete rack.
- Probability reducing an important structural event too often.

### 1.6 Generated microtiming

Microtiming remains generated and hidden.

The user selects a rhythm style. Internally:

- Each style has a small set of curated timing recipes.
- Each musical role has its own timing behavior.
- The generator chooses from approved variants.
- Seed variation may make small bounded changes.
- The rendered arrangement stores the resulting offsets.
- The engine schedules those offsets.

There is no per-step microtiming grid.

If Footwork testing demonstrates a need for substeps or retrigs, those are also generated. They do not become a desktop copy of Elektron retrig programming.

### 1.7 Definition of done

A repaired style or vocabulary graduates when:

- It survives several unseen seeds rather than only one hand-picked example.
- It has no recurring catastrophic rejection reason.
- Its identity remains recognizable across variations.
- Variations are meaningfully different without losing the identity.
- Four-bar shape affects musical development.
- Known-good styles have not regressed.
- Several complete candidates are promoted as replayable golden fixtures.

Evaluation statistics such as rejection rate and common scorecard ratings are useful signals, not claims of objective musical quality.

## 2. Behringer Pro-1 and RD-6 instruments

These two relatively simple instruments establish a reusable instrument model before the A/B feature depends on it.

### 2.1 Static device profiles

The current fixed Digitone/Digitakt target and track model should become a small static profile system. This is not a public plugin framework.

A device profile describes:

- Device type.
- Stable instrument ID.
- Lane topology.
- MIDI output and channel behavior.
- Melodic-channel or drum-note addressing.
- Clock and Start/Stop behavior.
- Supported musical roles.
- Parameter capabilities.
- Safe note range.
- Monophonic or polyphonic behavior.
- Default UI module.

An instrument instance stores:

- Profile ID.
- User-visible name.
- MIDI output.
- Channel configuration.
- Musical role.
- Mute state.
- Later, A/B assignment.

The engine should address arbitrary instrument IDs instead of assuming only Digitone and Digitakt.

Profiles also decide whether Signal Rack sends clock, Start/Stop, notes, and parameter messages. This avoids accidentally starting a hardware sequencer while Signal Rack is also sending direct notes.

### 2.2 Pro-1

The Pro-1 begins as a focused monophonic module.

#### Initial capabilities

- Select MIDI output.
- Select MIDI channel.
- Choose octave/register.
- Mute.
- One generated melodic lane.
- Safe monophonic note lifecycle.
- Role selection: Bass, Lead, or Reply/Counterline.
- Note, gate, and velocity generation.
- No software synth-parameter editor.

The Pro-1's physical panel remains the sound-design interface.

#### Legato and glide

Reliable note-on/off behavior comes first.

A small later submilestone can add generated articulation:

- Detached: release before the next note.
- Legato: overlap notes when the hardware setup uses Auto glide.
- Stop, regenerate, mute, and channel changes always release the active note.

This establishes reusable monophonic articulation behavior for the TD-3 without prematurely implementing acid-specific slide logic.

#### Generator behavior

Before A/B exists, the Pro-1 should not blindly duplicate Digitone bass.

- Bass replaces or complements the existing bass role.
- Lead gets sparse phrase-leading material.
- Reply gets puncture or call-and-response material.
- A density budget prevents every pitched instrument from playing continuously.

#### Acceptance criteria

- No stuck notes during Stop, regeneration, mute, channel change, or output change.
- Generated material respects the selected role and monophony.
- Existing instruments continue to work.
- Hardware sound design remains independent of Signal Rack.

### 2.3 RD-6

The RD-6 becomes a compact drum profile using one receive channel and multiple note-triggered voices.

#### Hardware preflight

Before encoding the profile:

- Confirm the installed firmware.
- Confirm the receive channel.
- Record the note number for every voice.
- Confirm velocity response.
- Confirm whether MIDI Start begins the internal sequencer.
- Decide whether Signal Rack sends clock and transport in direct-note mode.

The profile should reflect the actual unit rather than an assumed General MIDI map.

#### Initial capabilities

- Select MIDI output.
- Select receive channel.
- Eight voice lanes.
- Instrument mute.
- Direct note sequencing.
- Role mapping for kick, snare, closed hat, open hat, clap/cymbal, low tom, high tom, and percussion.
- Main Drums or Support Drums role.
- No parameter control.

#### Generator behavior

Before A/B exists:

- Main Drums may carry the primary groove.
- Support Drums should not double every Digitakt hit.
- Support mode emphasizes toms, hats, cymbal/clap punctuation, sparse kick reinforcement, and bar-4 responses.

Main/Support is a high-level musical choice rather than a per-lane routing matrix.

#### Acceptance criteria

- Every verified voice triggers correctly.
- Direct sequencing cannot accidentally double the RD-6 internal sequencer.
- Main and Support generation sound meaningfully different.
- Muting or regenerating the RD-6 does not affect other devices.
- Output and channel settings persist.

## 3. A/B arrangement model

The A/B feature builds on generic instrument instances introduced for the Pro-1 and RD-6.

### 3.1 Part model

Each part owns:

- Root.
- Chord vocabulary.
- Rhythm style.
- Energy.
- Four-bar shape.
- Phrase leader.
- Assigned instruments.
- Instrument roles.
- Active arrangement.
- Draft arrangement.
- Part scene.

Instrument assignment defaults to entire hardware instruments because those correspond to hardware mixer channels.

### 3.2 Role-aware generation

The generator inspects the instruments assigned to the selected part.

Examples:

- RD-6 + Pro-1: drums plus bass, lead, or reply; no invented harmony device.
- Digitakt + Digitone: full current role coverage.
- RD-6 alone: drum-focused arrangement.
- Pro-1 alone: sparse monophonic phrase rather than missing-track errors.

A small coverage display may show Pulse, Bass, Harmony, Reply, and Texture. This is informational rather than a detailed routing matrix.

### 3.3 Performance UI

The performance view uses two clear columns:

- Part A.
- Part B.

Each part contains:

- Musical brief controls.
- Assigned instrument cards.
- Generate Draft.
- Active/draft status.
- Commit.
- Part scene.
- Mute status.

Instrument cards can move between A and B through a simple assignment control. Moving an active instrument is blocked or quantized during playback to prevent stuck notes and routing ambiguity.

### 3.4 Draft and commit

Generation should not destructively replace a live arrangement.

1. Generate A Draft.
2. Continue hearing A Active.
3. Inspect the draft summary.
4. Commit immediately while stopped or queue the commit for the next four-bar boundary.
5. At commit, release obsolete notes, apply every changed lane atomically, reset relevant parameter state, and start the new phrase from bar 1.

Part B operates independently.

### 3.5 Part scenes

Scenes become musical-role filters:

- Full.
- Drums.
- Bass.
- Space.
- Drop.

They apply across all instruments assigned to the part. For example, `PART A - DRUMS` suppresses Part A's bass, harmony, and reply roles regardless of which devices provide them.

Scenes should use deterministic mute and density rules rather than unpredictable random suppression during a transition.

### 3.6 Persistence

A/B state should survive an application restart:

- Instrument assignments.
- Active arrangements.
- Draft arrangements.
- Brief settings.
- MIDI routing.
- Part scenes.
- Generator/schema versions.

Local save and restore are sufficient. A cloud library is out of scope.

### 3.7 Acceptance criteria

- Generating A never changes B.
- Generating B never changes A.
- Both parts play from one synchronized transport.
- Draft commits happen at the intended boundary.
- No stuck notes occur during commit.
- Devices move safely between parts while stopped.
- Parts with incomplete role coverage still generate coherent material.
- Audio mixing remains entirely external.

## 4. Derive B from A

This is a focused assistant inside the A/B workflow rather than a large theory system.

### 4.1 User flow

1. Part A has an active arrangement.
2. Select `DERIVE B FROM A`.
3. Signal Rack presents three suggestions: Smooth, Color Shift, and Contrast.
4. Each suggestion shows a proposed B root, proposed B chord vocabulary, a short explanation, and a recommended overlap strategy.
5. Selecting a suggestion fills B's brief.
6. Generate B Draft through the normal generator.
7. Audition and commit B normally.

The helper never commits automatically.

### 4.2 Suggestion algorithm

The helper enumerates plausible root/vocabulary combinations and scores them using:

- Shared pitch classes.
- Voice-leading distance between A's ending harmony and B's opening harmony.
- Bass-root interval during overlap.
- Semitone and tritone collision risk.
- Shared or compatible chord shapes.
- Vocabulary-specific compatibility rules.

Categories:

- Smooth: high common-tone count and low overlap conflict.
- Color Shift: related material with audible contrast.
- Contrast: intentionally distant but musically explainable.

### 4.3 Transition advice

The helper recommends one of a small set of practical mixer strategies:

- Harmony can overlap.
- Fade A bass before introducing B bass.
- Introduce B drums first.
- Use A's Space scene before the blend.
- Use a hard cut or bar-4 handoff.

This is guidance for hardware mixing, not automated mixer control.

### 4.4 Scope exclusions

The first version does not include:

- Automatic crossfades.
- Mixer control.
- Continuous key detection.
- Chord-by-chord morphing.
- A general mood engine.
- Additional permanent theory parameters.
- A large editable circle of fifths.

A circular visualization may come later if it materially improves the presentation of the three suggestions.

### 4.5 Acceptance criteria

- Suggestions are deterministic and replayable.
- The three categories are meaningfully different.
- Smooth suggestions tolerate harmonic overlap.
- Contrast suggestions recommend an appropriate non-harmonic bridge.
- Selecting a suggestion only updates B's brief.
- The normal generator remains responsible for the arrangement.

## 5. Generated drum parameter gestures

Parameter gestures come after device profiles and A/B because parameter support belongs to device capabilities and gestures should target part/instrument roles.

### 5.1 Data model

Each step may contain sparse locks:

- Semantic parameter ID.
- Value.
- On-trigger behavior.

Each device profile maps semantic parameters to:

- MIDI CC or NRPN encoding.
- Supported value range.
- Safe musical range.
- Applicable roles.
- MIDI message cost.

Each track also retains a base value. Stop, arrangement switch, or lock removal restores the base state.

### 5.2 User controls

The interface remains high-level.

Target choices:

- Hats.
- Kick.
- Snare/clap.
- Percussion.
- Texture.
- Selected lanes.

Gesture choices:

- Phrase contour.
- Alternate.
- Rise and reset.
- Call and reply.
- Accent-following.
- Bounded drift.

Amount choices:

- Subtle.
- Medium.
- Wild.

Parameter color:

- Auto by default.
- Optional Tone, Space, Pitch, or Texture family.

`Auto` selects a suitable parameter and safe range from the device profile. The chosen parameter is visible, but the interface does not expose a 64-step automation editor.

Actions:

- Generate Movement.
- Regenerate.
- Clear.
- Copy a gesture between compatible lanes.

### 5.3 Four-bar gesture behavior

- Bar 1 establishes the parameter identity.
- Bar 2 confirms it with one variation.
- Bar 3 develops or widens the range.
- Bar 4 ramps, answers, or resets.

Bounded drift uses deterministic seeded movement and returns toward an anchor. It does not become unrestricted sample-and-hold.

Locks are primarily attached to active hits. The generator avoids dense parameter traffic on rests unless a specific gesture requires anticipation.

### 5.4 Initial device support

Digitakt is the first target because its documented MIDI map exposes useful single-CC parameters such as filter, resonance, overdrive, delay send, reverb send, and pan.

RD-6 remains note/velocity-only unless dependable documentation and hardware testing prove additional controls safe.

Machinedrum becomes the primary second parameter-gesture target in the follow-up phase.

### 5.5 MIDI safety

- MIDI clock has highest priority.
- Parameter locks are sent immediately before their note.
- Prefer single-message CCs for per-hit movement.
- Limit simultaneous locks.
- Avoid dense per-hit NRPN bursts.
- Measure timing under realistic multi-device load.
- Restore base parameter values when switching arrangements.

### 5.6 Acceptance criteria

- Gestures repeat coherently over four bars.
- Movement is audible but not arbitrary.
- Gesture names sound meaningfully different.
- Regeneration creates variation without destroying identity.
- No manual per-step automation is required.
- MIDI clock remains stable.
- Arrangement switching does not leave parameters stranded.

## 6. Follow-up instruments

### 6.1 RD-9

Reuse the RD-6 drum-profile architecture:

- Single-channel drum-note topology.
- Configurable note map.
- Expanded voice set.
- Main and Support drum roles.
- Note sequencing first.
- Only documented parameter control later.

### 6.2 TD-3

Implementation status: the first TD-3 profile is available with one monophonic lane, independent MIDI routing/channel setup, phrase-generated scale motion, accents, adjacent-note slides, and octave changes. Accent is rendered as high note-on velocity and slide as a short legato overlap because the standard TD-3 MIDI chart exposes neither as a dedicated CC.

Reuse the Pro-1 monophonic foundation, then add explicit articulation behavior:

- Accent.
- Slide/legato.
- Note overlap.
- Acid-specific phrase generation.
- Safe interaction with internal sequencer and clock behavior.

Signal Rack should generate acid articulation rather than expose a copied TD-3 step editor.

### 6.3 Machinedrum MKII non-UW

Add:

- Sixteen tracks.
- Base-channel behavior.
- Configurable note map.
- Machine-aware parameter descriptors.
- Multiple output-group metadata if useful for hardware mixing.
- Drum parameter gestures through documented CC mappings.

Sample management remains excluded because this is the non-UW model and Signal Rack is not becoming a librarian.

### 6.4 Monomachine

Add last because it combines several complexities:

- Six pitched tracks.
- Machine-dependent parameter meanings.
- Polyphonic and monophonic roles.
- Bass, harmony, reply, and texture assignments.
- Per-track MIDI and parameter profiles.
- Voice-density management.

It should use the shared chord vocabularies and part-role system rather than receive a separate device-specific generator.

## Cross-cutting engineering rules

- Musical role first, device second.
- High-level intention in; low-level sequencing out.
- Static built-in device profiles are sufficient for this roadmap.
- Do not create a DAW-style piano roll or automation editor.
- Generator outputs remain deterministic and replayable.
- Human evaluations remain tied to exact candidate data.
- Protect existing good styles during unrelated work.
- Verify hardware behavior on the actual units before encoding assumptions.
- Persisted schemas receive explicit versions and migration paths.
- Clock and note safety take priority over UI telemetry and parameter traffic.
- New devices inherit existing musical roles before adding new density.

## Immediate next planning deliverable

Before changing generator behavior, define the Generator Lab implementation specification and the first calibration batch.

The first listening session should:

1. Reproduce the good House, Dub, Jungle, and UK Bass judgments.
2. Reproduce the Broken Pocket, Footwork, and Electro failures.
3. Verify that scorecard ratings, optional causes, and freeform annotations capture the reasons for those judgments.
4. Produce the first reference-good and reference-bad fixtures.
5. Select Electro as the first controlled repair experiment.
