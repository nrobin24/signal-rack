use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc, Mutex,
        mpsc::{self, Sender, TryRecvError},
    },
    thread,
    time::{Duration, Instant},
};

use midir::{MidiOutput, MidiOutputConnection};
use serde::Serialize;
use spin_sleep::{SpinSleeper, SpinStrategy};
use tauri::{AppHandle, Emitter};

use crate::{
    lfo::{lfo_value, modulated_value},
    model::{Groove, LfoId, RackTarget, SceneId, SequencerConfig, TrackConfig, TrackId},
};

#[derive(Clone)]
pub struct EngineState(pub Arc<Mutex<Engine>>);

impl Default for EngineState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(Engine::default())))
    }
}

struct PortConnection {
    connection: MidiOutputConnection,
    name: String,
    targets: HashSet<RackTarget>,
}

enum ScheduledEventKind {
    PlayStep {
        track_id: TrackId,
        step_index: usize,
    },
    NoteOff {
        target: RackTarget,
        channel: u8,
        notes: Vec<u8>,
    },
}

struct ScheduledEvent {
    due: Instant,
    kind: ScheduledEventKind,
}

pub struct Engine {
    config: SequencerConfig,
    connections: HashMap<usize, PortConnection>,
    target_ports: HashMap<RackTarget, usize>,
    playing: bool,
    pulse: u64,
    random_state: u64,
    scheduled: Vec<ScheduledEvent>,
    stop_sender: Option<Sender<()>>,
    run_id: u64,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            config: SequencerConfig::default(),
            connections: HashMap::new(),
            target_ports: HashMap::new(),
            playing: false,
            pulse: 0,
            random_state: 0x5eed_fade_cafe_babe,
            scheduled: Vec::new(),
            stop_sender: None,
            run_id: 0,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub playing: bool,
    pub output_names: OutputNames,
}

#[derive(Serialize)]
pub struct OutputNames {
    pub digitone: Option<String>,
    pub digitakt: Option<String>,
}

pub fn midi_port_names() -> Result<Vec<String>, String> {
    let output = MidiOutput::new("Signal Rack port scan").map_err(|error| error.to_string())?;
    output
        .ports()
        .iter()
        .map(|port| output.port_name(port).map_err(|error| error.to_string()))
        .collect()
}

pub struct ClockProbe {
    pub pulses: usize,
    pub requested_bpm: f64,
    pub measured_bpm: f64,
    pub mean_lateness_micros: f64,
    pub max_lateness_micros: u128,
}

/// Measures the same absolute-deadline precision sleeper used by the transport without opening a
/// MIDI port. This is intentionally opt-in through the CLI so normal unit tests are deterministic.
pub fn probe_clock(bpm: f64, seconds: f64) -> ClockProbe {
    let bpm = bpm.clamp(30.0, 300.0);
    let interval = clock_interval(bpm);
    let pulses = ((seconds.clamp(0.5, 30.0) / interval.as_secs_f64()).round() as usize).max(2);
    let start = Instant::now() + Duration::from_millis(10);
    let sleeper = precision_sleeper();
    let mut first = None;
    let mut last = None;
    let mut total_lateness = 0_u128;
    let mut max_lateness = 0_u128;

    for pulse in 0..pulses {
        let deadline = start + interval.saturating_mul(pulse as u32);
        sleeper.sleep_until(deadline);
        let actual = Instant::now();
        let lateness = actual.saturating_duration_since(deadline).as_micros();
        total_lateness += lateness;
        max_lateness = max_lateness.max(lateness);
        first.get_or_insert(actual);
        last = Some(actual);
    }

    let elapsed = last
        .expect("clock probe records a final pulse")
        .duration_since(first.expect("clock probe records a first pulse"));
    let measured_bpm = 60.0 * (pulses - 1) as f64 / elapsed.as_secs_f64() / 24.0;
    ClockProbe {
        pulses,
        requested_bpm: bpm,
        measured_bpm,
        mean_lateness_micros: total_lateness as f64 / pulses as f64,
        max_lateness_micros: max_lateness,
    }
}

pub fn status(state: &EngineState) -> Result<EngineStatus, String> {
    let engine = state
        .0
        .lock()
        .map_err(|_| "sequencer state lock poisoned".to_string())?;
    Ok(EngineStatus {
        playing: engine.playing,
        output_names: OutputNames {
            digitone: engine.output_name(RackTarget::Digitone),
            digitakt: engine.output_name(RackTarget::Digitakt),
        },
    })
}

pub fn select_output(
    state: &EngineState,
    target: RackTarget,
    port: Option<usize>,
) -> Result<(), String> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| "sequencer state lock poisoned".to_string())?;
    engine.select_output(target, port)
}

pub fn configure(state: &EngineState, next: SequencerConfig) -> Result<(), String> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| "sequencer state lock poisoned".to_string())?;
    let newly_muted: Vec<TrackConfig> = next
        .tracks
        .iter()
        .filter(|track| {
            track.muted
                && !engine
                    .config
                    .tracks
                    .iter()
                    .any(|previous| previous.id == track.id && previous.muted)
        })
        .cloned()
        .collect();
    engine.config = next;
    for track in newly_muted {
        let _ = engine.send_message(
            track.target,
            &[0xb0 + track.channel.saturating_sub(1), 123, 0],
        );
    }
    Ok(())
}

pub fn set_macros(
    state: &EngineState,
    track_id: TrackId,
    tone: f64,
    space: f64,
) -> Result<(), String> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| "sequencer state lock poisoned".to_string())?;
    let Some(index) = engine
        .config
        .tracks
        .iter()
        .position(|track| track.id == track_id)
    else {
        return Ok(());
    };
    engine.config.tracks[index].tone = Some(tone);
    engine.config.tracks[index].space = Some(space);
    let track = engine.config.tracks[index].clone();
    engine.send_track_macros(&track);
    Ok(())
}

pub fn start(state: &EngineState, app: AppHandle) -> Result<(), String> {
    stop_inner(state, &app, false)?;
    let (sender, receiver) = mpsc::channel();
    let run_id = {
        let mut engine = state
            .0
            .lock()
            .map_err(|_| "sequencer state lock poisoned".to_string())?;
        engine.pulse = 0;
        engine.playing = true;
        engine.run_id = engine.run_id.wrapping_add(1);
        engine.stop_sender = Some(sender);
        engine.send_all_macros();
        engine.broadcast(&[0xfa]);
        engine.run_id
    };

    let shared = state.0.clone();
    thread::Builder::new()
        .name("signal-rack-clock".into())
        .spawn(move || {
            let mut next_clock = Instant::now();
            let sleeper = precision_sleeper();
            loop {
                let now = Instant::now();
                let (playing, next_event) = {
                    let Ok(mut engine) = shared.lock() else {
                        break;
                    };
                    if !engine.playing || engine.run_id != run_id {
                        break;
                    }
                    let interval = clock_interval(engine.config.bpm);
                    if now >= next_clock {
                        // Keep the deadline anchored to the musical timeline. Resetting it from
                        // `now` accumulates every scheduler wake-up delay and makes the clock slow.
                        // A very large stall is resynchronized instead of sending a burst of old
                        // clock pulses into the hardware.
                        if now.saturating_duration_since(next_clock) > interval.saturating_mul(4) {
                            next_clock = now;
                        }
                        engine.tick(&app, next_clock);
                        next_clock += interval;
                    }
                    // MIDI clock always gets first priority when clock and note events coincide.
                    engine.process_due(Instant::now());
                    (engine.playing, engine.next_due())
                };
                if !playing {
                    break;
                }
                let wake = next_event.map_or(next_clock, |event| event.min(next_clock));
                match receiver.try_recv() {
                    Ok(()) | Err(TryRecvError::Disconnected) => break,
                    Err(TryRecvError::Empty) => sleeper.sleep_until(wake),
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn clock_interval(bpm: f64) -> Duration {
    Duration::from_secs_f64(60.0 / bpm.clamp(30.0, 300.0) / 24.0)
}

fn precision_sleeper() -> SpinSleeper {
    SpinSleeper::new(5_000_000).with_spin_strategy(SpinStrategy::SpinLoopHint)
}

pub fn stop(state: &EngineState, app: &AppHandle) -> Result<(), String> {
    stop_inner(state, app, true)
}

fn stop_inner(state: &EngineState, app: &AppHandle, emit: bool) -> Result<(), String> {
    let was_playing = {
        let mut engine = state
            .0
            .lock()
            .map_err(|_| "sequencer state lock poisoned".to_string())?;
        if let Some(sender) = engine.stop_sender.take() {
            let _ = sender.send(());
        }
        let was_playing = engine.playing;
        engine.run_id = engine.run_id.wrapping_add(1);
        if was_playing {
            engine.broadcast(&[0xfc]);
        }
        engine.playing = false;
        engine.all_notes_off();
        engine.scheduled.clear();
        was_playing
    };
    if emit && was_playing {
        let _ = app.emit("sequencer-stopped", ());
    }
    Ok(())
}

impl Engine {
    fn output_name(&self, target: RackTarget) -> Option<String> {
        self.target_ports
            .get(&target)
            .and_then(|port| self.connections.get(port))
            .map(|connection| connection.name.clone())
    }

    fn select_output(&mut self, target: RackTarget, port: Option<usize>) -> Result<(), String> {
        if self.playing {
            let _ = self.send_message(target, &[0xfc]);
            let tracks: Vec<_> = self
                .config
                .tracks
                .iter()
                .filter(|track| track.target == target)
                .cloned()
                .collect();
            for track in tracks {
                let _ =
                    self.send_message(target, &[0xb0 + track.channel.saturating_sub(1), 123, 0]);
            }
        }
        self.detach_target(target);
        let Some(port_index) = port else {
            return Ok(());
        };

        if let Some(connection) = self.connections.get_mut(&port_index) {
            connection.targets.insert(target);
            self.target_ports.insert(target, port_index);
            if self.playing {
                let _ = connection.connection.send(&[0xfa]);
            }
            return Ok(());
        }

        let output = MidiOutput::new("Signal Rack").map_err(|error| error.to_string())?;
        let ports = output.ports();
        let selected = ports
            .get(port_index)
            .ok_or_else(|| format!("MIDI output {port_index} is no longer available"))?;
        let name = output
            .port_name(selected)
            .map_err(|error| error.to_string())?;
        let mut connection = output
            .connect(selected, "Signal Rack output")
            .map_err(|error| error.to_string())?;
        if self.playing {
            let _ = connection.send(&[0xfa]);
        }
        self.connections.insert(
            port_index,
            PortConnection {
                connection,
                name,
                targets: HashSet::from([target]),
            },
        );
        self.target_ports.insert(target, port_index);
        Ok(())
    }

    fn detach_target(&mut self, target: RackTarget) {
        let Some(port) = self.target_ports.remove(&target) else {
            return;
        };
        let remove = self.connections.get_mut(&port).is_some_and(|connection| {
            connection.targets.remove(&target);
            connection.targets.is_empty()
        });
        if remove {
            self.connections.remove(&port);
        }
    }

    fn send_message(&mut self, target: RackTarget, message: &[u8]) -> Result<(), String> {
        let Some(port) = self.target_ports.get(&target).copied() else {
            return Ok(());
        };
        let Some(connection) = self.connections.get_mut(&port) else {
            return Ok(());
        };
        connection
            .connection
            .send(message)
            .map_err(|error| error.to_string())
    }

    fn broadcast(&mut self, message: &[u8]) {
        for connection in self.connections.values_mut() {
            let _ = connection.connection.send(message);
        }
    }

    fn all_notes_off(&mut self) {
        let tracks = self.config.tracks.clone();
        for track in tracks {
            let _ = self.send_message(
                track.target,
                &[0xb0 + track.channel.saturating_sub(1), 123, 0],
            );
        }
    }

    fn send_nrpn(&mut self, target: RackTarget, channel: u8, parameter: u8, value: f64) {
        let status = 0xb0 + channel.saturating_sub(1);
        let value = value.round().clamp(0.0, 127.0) as u8;
        for message in [
            [status, 99, 1],
            [status, 98, parameter],
            [status, 6, value],
            [status, 38, 0],
            [status, 101, 127],
            [status, 100, 127],
        ] {
            let _ = self.send_message(target, &message);
        }
    }

    fn send_tone(&mut self, track: &TrackConfig, value: f64) {
        self.send_nrpn(
            RackTarget::Digitone,
            track.channel,
            20,
            20.0 + value * 107.0 / 127.0,
        );
        self.send_nrpn(RackTarget::Digitone, track.channel, 78, value * 0.6);
    }

    fn send_space(&mut self, track: &TrackConfig, value: f64) {
        self.send_nrpn(RackTarget::Digitone, track.channel, 40, value * 0.8);
        self.send_nrpn(RackTarget::Digitone, track.channel, 39, value * 0.95);
    }

    fn macro_value(&self, track: &TrackConfig, macro_name: &str) -> f64 {
        let (base, source, depth) = if macro_name == "tone" {
            (
                track.tone.unwrap_or(64.0),
                track.tone_lfo,
                track.tone_lfo_depth,
            )
        } else {
            (
                track.space.unwrap_or(32.0),
                track.space_lfo,
                track.space_lfo_depth,
            )
        };
        let lfo =
            source.and_then(|id| self.config.lfos.iter().find(|candidate| candidate.id == id));
        modulated_value(base, lfo, depth, if self.playing { self.pulse } else { 0 })
    }

    fn send_track_macros(&mut self, track: &TrackConfig) {
        if track.target != RackTarget::Digitone {
            return;
        }
        self.send_tone(track, self.macro_value(track, "tone"));
        self.send_space(track, self.macro_value(track, "space"));
    }

    fn send_all_macros(&mut self) {
        let tracks = self.config.tracks.clone();
        for track in tracks {
            self.send_track_macros(&track);
        }
    }

    fn send_lfo_macros(&mut self) {
        let tracks: Vec<_> = self
            .config
            .tracks
            .iter()
            .filter(|track| track.target == RackTarget::Digitone)
            .cloned()
            .collect();
        for track in tracks {
            if track.tone_lfo.is_some() {
                self.send_tone(&track, self.macro_value(&track, "tone"));
            }
            if track.space_lfo.is_some() {
                self.send_space(&track, self.macro_value(&track, "space"));
            }
        }
    }

    fn scene_density(&self, track: &TrackConfig) -> f64 {
        if track.target != RackTarget::Digitone {
            return 1.0;
        }
        match (self.config.scene, track.id) {
            (SceneId::Full, _) => 1.0,
            (SceneId::Bass, TrackId::DnBass) => 1.0,
            (SceneId::Bass, TrackId::DnVamp) => 0.0,
            (SceneId::Bass, TrackId::DnPuncture) => 0.25,
            (SceneId::Space, TrackId::DnBass) => 0.55,
            (SceneId::Space, TrackId::DnVamp) => 1.0,
            (SceneId::Space, TrackId::DnPuncture) => 0.4,
            (SceneId::Drop, TrackId::DnPuncture) => 0.2,
            (SceneId::Drop, _) => 0.0,
            _ => 1.0,
        }
    }

    fn random(&mut self) -> f64 {
        self.random_state ^= self.random_state << 13;
        self.random_state ^= self.random_state >> 7;
        self.random_state ^= self.random_state << 17;
        self.random_state as f64 / u64::MAX as f64
    }

    fn step_duration(&self) -> Duration {
        Duration::from_secs_f64(60.0 / self.config.bpm.clamp(30.0, 300.0) / 4.0)
    }

    fn play_track_step(&mut self, track_id: TrackId, step_index: usize, now: Instant) {
        let Some(track) = self
            .config
            .tracks
            .iter()
            .find(|track| track.id == track_id)
            .cloned()
        else {
            return;
        };
        if track.muted || !self.target_ports.contains_key(&track.target) || track.length == 0 {
            return;
        }
        let Some(step) = track.steps.get(step_index % track.length).cloned() else {
            return;
        };
        if step.notes.is_empty()
            || self.random() * 100.0 >= f64::from(step.probability) * self.scene_density(&track)
        {
            return;
        }
        for note in &step.notes {
            let _ = self.send_message(
                track.target,
                &[0x90 + track.channel.saturating_sub(1), *note, step.velocity],
            );
        }
        let release = self
            .step_duration()
            .mul_f64(f64::from(step.gate) / 100.0)
            .max(Duration::from_millis(12));
        self.scheduled.push(ScheduledEvent {
            due: now + release,
            kind: ScheduledEventKind::NoteOff {
                target: track.target,
                channel: track.channel,
                notes: step.notes,
            },
        });
    }

    fn play_step(&mut self, global_step: usize, app: &AppHandle, step_boundary: Instant) {
        let tracks = self.config.tracks.clone();
        let step_duration = self.step_duration();
        let positions: HashMap<&'static str, usize> = tracks
            .iter()
            .filter(|track| track.length > 0)
            .map(|track| (track_id_name(track.id), global_step % track.length))
            .collect();
        let lfo_levels: HashMap<&'static str, f64> = self
            .config
            .lfos
            .iter()
            .map(|lfo| (lfo_id_name(lfo.id), lfo_value(lfo, self.pulse)))
            .collect();

        for track in &tracks {
            if track.length == 0 {
                continue;
            }
            let index = global_step % track.length;
            let offset = groove_offset_micros(track.groove, index, step_duration);
            if global_step == 0 || offset >= 0 {
                if offset == 0 {
                    self.play_track_step(track.id, index, Instant::now());
                } else {
                    self.scheduled.push(ScheduledEvent {
                        due: step_boundary + Duration::from_micros(offset as u64),
                        kind: ScheduledEventKind::PlayStep {
                            track_id: track.id,
                            step_index: index,
                        },
                    });
                }
            }
        }
        for track in tracks {
            if track.length == 0 {
                continue;
            }
            let next_index = (global_step + 1) % track.length;
            let early = groove_offset_micros(track.groove, next_index, step_duration);
            if early < 0 {
                let delay = step_duration.saturating_sub(Duration::from_micros((-early) as u64));
                self.scheduled.push(ScheduledEvent {
                    due: step_boundary + delay,
                    kind: ScheduledEventKind::PlayStep {
                        track_id: track.id,
                        step_index: next_index,
                    },
                });
            }
        }
        // UI telemetry is deliberately last: clock and musical event scheduling have priority.
        let _ = app.emit("sequencer-step", positions);
        let _ = app.emit("lfo-levels", lfo_levels);
    }

    fn tick(&mut self, app: &AppHandle, now: Instant) {
        self.broadcast(&[0xf8]);
        if self.pulse % 6 == 0 {
            self.play_step((self.pulse / 6) as usize, app, now);
            self.send_lfo_macros();
        }
        self.pulse = self.pulse.wrapping_add(1);
    }

    fn process_due(&mut self, now: Instant) {
        let mut future = Vec::new();
        let mut due = Vec::new();
        for event in self.scheduled.drain(..) {
            if event.due <= now {
                due.push(event);
            } else {
                future.push(event);
            }
        }
        self.scheduled = future;
        for event in due {
            match event.kind {
                ScheduledEventKind::PlayStep {
                    track_id,
                    step_index,
                } => self.play_track_step(track_id, step_index, now),
                ScheduledEventKind::NoteOff {
                    target,
                    channel,
                    notes,
                } => {
                    for note in notes {
                        let _ =
                            self.send_message(target, &[0x80 + channel.saturating_sub(1), note, 0]);
                    }
                }
            }
        }
    }

    fn next_due(&self) -> Option<Instant> {
        self.scheduled.iter().map(|event| event.due).min()
    }
}

fn groove_offset_ratio(groove: Groove, step: usize) -> f64 {
    match groove {
        Groove::Straight => 0.0,
        Groove::Push => {
            if step % 4 == 2 {
                -0.18
            } else if step % 2 == 1 {
                -0.08
            } else {
                0.0
            }
        }
        Groove::Late => {
            if step % 4 == 3 {
                0.28
            } else if step % 2 == 1 {
                0.13
            } else {
                0.0
            }
        }
        Groove::Broken => [0.0, 0.25, -0.13, 0.14][step % 4],
    }
}

fn groove_offset_micros(groove: Groove, step: usize, step_duration: Duration) -> i64 {
    (step_duration.as_secs_f64() * groove_offset_ratio(groove, step) * 1_000_000.0).round() as i64
}

fn track_id_name(id: TrackId) -> &'static str {
    match id {
        TrackId::DnBass => "dn-bass",
        TrackId::DnVamp => "dn-vamp",
        TrackId::DnPuncture => "dn-puncture",
        TrackId::DkKick => "dk-kick",
        TrackId::DkSnare => "dk-snare",
        TrackId::DkClosedHat => "dk-closed-hat",
        TrackId::DkOpenHat => "dk-open-hat",
        TrackId::DkRim => "dk-rim",
        TrackId::DkClap => "dk-clap",
        TrackId::DkTexture => "dk-texture",
    }
}

fn lfo_id_name(id: LfoId) -> &'static str {
    match id {
        LfoId::Lfo1 => "lfo-1",
        LfoId::Lfo2 => "lfo-2",
        LfoId::Lfo3 => "lfo-3",
        LfoId::Lfo4 => "lfo-4",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groove_offsets_match_the_132_bpm_contract() {
        let step = Duration::from_secs_f64(60.0 / 132.0 / 4.0);
        let millis = |groove, index| {
            (groove_offset_micros(groove, index, step) as f64 / 1_000.0).round() as i64
        };
        assert_eq!(
            (0..4)
                .map(|index| millis(Groove::Broken, index))
                .collect::<Vec<_>>(),
            vec![0, 28, -15, 16]
        );
        assert_eq!(millis(Groove::Push, 2), -20);
        assert_eq!(millis(Groove::Late, 3), 32);
    }

    #[test]
    fn groove_offsets_scale_with_tempo() {
        let fast = Duration::from_secs_f64(60.0 / 132.0 / 4.0);
        let slow = Duration::from_secs_f64(60.0 / 66.0 / 4.0);
        assert_eq!(
            groove_offset_micros(Groove::Broken, 1, slow),
            groove_offset_micros(Groove::Broken, 1, fast) * 2
        );
        assert_eq!(groove_offset_ratio(Groove::Straight, 7), 0.0);
    }

    #[test]
    fn midi_clock_interval_is_24_ppqn_at_requested_tempo() {
        let interval = clock_interval(132.0);
        let recovered_bpm = 60.0 / interval.as_secs_f64() / 24.0;
        assert!((recovered_bpm - 132.0).abs() < 0.000_001);
        assert_eq!(interval.as_micros(), 18_939);
    }
}
