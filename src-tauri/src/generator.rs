use crate::model::{
    BassRole, Energy, GeneratedSeed, GeneratedTrack, Groove, HarmonyColor, RhythmConcept,
    SeedSettings, Step, TrackId,
};

struct RhythmTemplate {
    kick: &'static [usize],
    snare: &'static [usize],
    closed_hat: &'static [usize],
    open_hat: &'static [usize],
    rim: &'static [usize],
    clap: &'static [usize],
    texture: &'static [usize],
    bass: &'static [usize],
    vamp: &'static [usize],
    puncture: &'static [usize],
    bass_length: usize,
    bass_groove: Groove,
    vamp_groove: Groove,
    puncture_groove: Groove,
}

pub fn generate_seed(settings: &SeedSettings, variation: u32) -> GeneratedSeed {
    let mut random = SeededRandom::new(&format!(
        "{}-{:?}-{:?}-{:?}-{:?}-{variation}",
        settings.root, settings.harmony, settings.bass_role, settings.rhythm, settings.energy
    ));
    let rhythm = rhythm_template(settings.rhythm);
    let probability = match settings.energy {
        Energy::Low => 78,
        Energy::Medium => 92,
        Energy::High => 100,
    };
    let root_bass = 36 + settings.root;
    let root_chord = 48 + settings.root;
    let chords: Vec<Vec<u8>> = chord_shapes(settings.harmony)
        .into_iter()
        .map(|shape| {
            shape
                .into_iter()
                .map(|offset| root_chord + offset)
                .collect()
        })
        .collect();
    let bass_pitches: Vec<u8> = bass_motif(settings.bass_role)
        .into_iter()
        .map(|offset| root_bass + offset)
        .collect();

    let bass_source: Vec<usize> = rhythm
        .bass
        .iter()
        .copied()
        .enumerate()
        .filter(|(index, _)| settings.bass_role != BassRole::Holes || index % 2 == 0)
        .map(|(_, position)| position)
        .collect();
    let bass_positions = vary(&bass_source, settings.energy, &mut random, false);
    let vamp_positions = vary(rhythm.vamp, settings.energy, &mut random, false);
    let puncture_positions = vary(rhythm.puncture, settings.energy, &mut random, false);
    let puncture_pitches: Vec<u8> = chords
        .iter()
        .flat_map(|chord| chord[chord.len().saturating_sub(2)..].iter().copied())
        .map(|note| note + 12)
        .collect();

    let tracks = vec![
        GeneratedTrack {
            id: TrackId::DnBass,
            length: rhythm.bass_length,
            groove: rhythm.bass_groove,
            tone: Some(if settings.harmony == HarmonyColor::Open {
                52
            } else {
                64
            }),
            space: Some(if settings.rhythm == RhythmConcept::Dub {
                38
            } else {
                18
            }),
            steps: pitched_steps(&bass_positions, &bass_pitches, 108, 58, probability),
        },
        GeneratedTrack {
            id: TrackId::DnVamp,
            length: 16,
            groove: rhythm.vamp_groove,
            tone: Some(if settings.harmony == HarmonyColor::JazzFunk {
                82
            } else {
                72
            }),
            space: Some(if settings.rhythm == RhythmConcept::Dub {
                86
            } else {
                62
            }),
            steps: chord_steps(
                &vamp_positions,
                &chords,
                84,
                if settings.rhythm == RhythmConcept::House {
                    42
                } else {
                    72
                },
                probability,
            ),
        },
        GeneratedTrack {
            id: TrackId::DnPuncture,
            length: if settings.rhythm == RhythmConcept::Footwork {
                12
            } else {
                16
            },
            groove: rhythm.puncture_groove,
            tone: Some(96),
            space: Some(if settings.rhythm == RhythmConcept::Dub {
                92
            } else {
                48
            }),
            steps: pitched_steps(
                &puncture_positions,
                &puncture_pitches,
                76,
                24,
                if settings.energy == Energy::High {
                    82
                } else {
                    66
                },
            ),
        },
        drum_track(
            TrackId::DkKick,
            vary(rhythm.kick, settings.energy, &mut random, true),
            116,
            34,
            probability,
            rhythm.bass_groove,
        ),
        drum_track(
            TrackId::DkSnare,
            vary(rhythm.snare, settings.energy, &mut random, true),
            104,
            28,
            probability,
            rhythm.vamp_groove,
        ),
        drum_track(
            TrackId::DkClosedHat,
            vary(rhythm.closed_hat, settings.energy, &mut random, false),
            84,
            18,
            if settings.energy == Energy::Low {
                72
            } else {
                92
            },
            rhythm.puncture_groove,
        ),
        drum_track(
            TrackId::DkOpenHat,
            vary(rhythm.open_hat, settings.energy, &mut random, false),
            90,
            68,
            if settings.energy == Energy::Low {
                58
            } else {
                88
            },
            Groove::Late,
        ),
        drum_track(
            TrackId::DkRim,
            vary(rhythm.rim, settings.energy, &mut random, false),
            92,
            22,
            if settings.energy == Energy::Low {
                66
            } else {
                90
            },
            rhythm.bass_groove,
        ),
        drum_track(
            TrackId::DkClap,
            vary(rhythm.clap, settings.energy, &mut random, true),
            102,
            36,
            if settings.energy == Energy::Low {
                82
            } else {
                100
            },
            rhythm.vamp_groove,
        ),
        drum_track(
            TrackId::DkTexture,
            vary(rhythm.texture, settings.energy, &mut random, false),
            76,
            46,
            if settings.energy == Energy::High {
                88
            } else {
                68
            },
            Groove::Broken,
        ),
    ];

    GeneratedSeed {
        tracks,
        summary: format!(
            "{} · {} · {} · {} bass · {} energy",
            root_label(settings.root),
            harmony_label(settings.harmony),
            rhythm_label(settings.rhythm),
            bass_role_label(settings.bass_role),
            energy_label(settings.energy)
        ),
    }
}

fn rhythm_template(concept: RhythmConcept) -> RhythmTemplate {
    match concept {
        RhythmConcept::Broken => RhythmTemplate {
            kick: &[0, 3, 7, 10],
            snare: &[4, 11],
            closed_hat: &[2, 5, 6, 9, 13, 15],
            open_hat: &[6, 14],
            rim: &[3, 10, 14],
            clap: &[4, 12],
            texture: &[7, 14],
            bass: &[0, 3, 6, 10, 13],
            vamp: &[2, 7, 10, 14],
            puncture: &[3, 8, 11, 15],
            bass_length: 14,
            bass_groove: Groove::Push,
            vamp_groove: Groove::Late,
            puncture_groove: Groove::Broken,
        },
        RhythmConcept::House => RhythmTemplate {
            kick: &[0, 4, 8, 12],
            snare: &[4, 12],
            closed_hat: &[0, 2, 4, 6, 8, 10, 12, 14],
            open_hat: &[2, 6, 10, 14],
            rim: &[3, 11],
            clap: &[4, 12],
            texture: &[7, 15],
            bass: &[0, 3, 6, 8, 11, 14],
            vamp: &[2, 6, 10, 14],
            puncture: &[7, 15],
            bass_length: 16,
            bass_groove: Groove::Straight,
            vamp_groove: Groove::Late,
            puncture_groove: Groove::Late,
        },
        RhythmConcept::Footwork => RhythmTemplate {
            kick: &[0, 3, 7, 10, 14],
            snare: &[4, 12],
            closed_hat: &[2, 3, 6, 7, 10, 11, 14, 15],
            open_hat: &[7, 15],
            rim: &[5, 9, 13],
            clap: &[4, 12, 15],
            texture: &[5, 13, 15],
            bass: &[0, 5, 7, 10],
            vamp: &[0, 5, 11, 14],
            puncture: &[3, 6, 9, 13, 15],
            bass_length: 12,
            bass_groove: Groove::Broken,
            vamp_groove: Groove::Straight,
            puncture_groove: Groove::Push,
        },
        RhythmConcept::Dub => RhythmTemplate {
            kick: &[0, 7, 10],
            snare: &[4, 12],
            closed_hat: &[2, 6, 10, 14],
            open_hat: &[6, 14],
            rim: &[3, 11],
            clap: &[12],
            texture: &[11],
            bass: &[0, 6, 9],
            vamp: &[0, 6, 12],
            puncture: &[5, 11, 15],
            bass_length: 10,
            bass_groove: Groove::Late,
            vamp_groove: Groove::Late,
            puncture_groove: Groove::Broken,
        },
    }
}

fn chord_shapes(harmony: HarmonyColor) -> Vec<Vec<u8>> {
    match harmony {
        HarmonyColor::Dorian => vec![vec![0, 3, 7, 10], vec![5, 9, 12, 16], vec![10, 14, 17, 21]],
        HarmonyColor::House => vec![vec![0, 3, 7, 10], vec![10, 14, 17, 21], vec![5, 8, 12, 15]],
        HarmonyColor::JazzFunk => vec![vec![0, 3, 7, 10], vec![2, 5, 9, 12], vec![5, 9, 12, 15]],
        HarmonyColor::Open => vec![vec![0, 5, 10, 15], vec![2, 7, 12, 17], vec![5, 10, 15, 19]],
    }
}

fn bass_motif(role: BassRole) -> Vec<u8> {
    match role {
        BassRole::Anchor => vec![0, 0, 7, 0, 10, 0],
        BassRole::Answer => vec![0, 7, 10, 5, 3, 7],
        BassRole::Roam => vec![0, 3, 5, 9, 10, 7],
        BassRole::Holes => vec![0, 10, 0, 7],
    }
}

fn empty_steps() -> Vec<Step> {
    (0..16)
        .map(|_| Step {
            notes: Vec::new(),
            velocity: 100,
            gate: 50,
            probability: 100,
        })
        .collect()
}

fn pitched_steps(
    positions: &[usize],
    pitches: &[u8],
    velocity: u8,
    gate: u8,
    probability: u8,
) -> Vec<Step> {
    let mut steps = empty_steps();
    for (index, position) in positions.iter().copied().enumerate() {
        steps[position] = Step {
            notes: vec![pitches[index % pitches.len()]],
            velocity: if index == 0 {
                velocity.saturating_add(8).min(127)
            } else {
                velocity
            },
            gate,
            probability,
        };
    }
    steps
}

fn chord_steps(
    positions: &[usize],
    chords: &[Vec<u8>],
    velocity: u8,
    gate: u8,
    probability: u8,
) -> Vec<Step> {
    let mut steps = empty_steps();
    for (index, position) in positions.iter().copied().enumerate() {
        steps[position] = Step {
            notes: chords[index % chords.len()].clone(),
            velocity,
            gate,
            probability,
        };
    }
    steps
}

fn drum_track(
    id: TrackId,
    positions: Vec<usize>,
    velocity: u8,
    gate: u8,
    probability: u8,
    groove: Groove,
) -> GeneratedTrack {
    let mut steps = empty_steps();
    for (index, position) in positions.into_iter().enumerate() {
        steps[position] = Step {
            notes: vec![60],
            velocity: if index == 0 {
                velocity.saturating_add(7).min(127)
            } else {
                velocity
            },
            gate,
            probability,
        };
    }
    GeneratedTrack {
        id,
        length: 16,
        groove,
        steps,
        tone: None,
        space: None,
    }
}

fn vary(
    source: &[usize],
    energy: Energy,
    random: &mut SeededRandom,
    preserve_first: bool,
) -> Vec<usize> {
    let mut result: Vec<usize> = if energy == Energy::Low && source.len() > 2 {
        source
            .iter()
            .copied()
            .enumerate()
            .filter(|(index, _)| index % 3 != 2)
            .map(|(_, value)| value)
            .collect()
    } else {
        source.to_vec()
    };
    if energy == Energy::High {
        let additions = if source.len() > 5 { 2 } else { 1 };
        for _ in 0..additions {
            result.push((random.next() * 16.0).floor() as usize);
        }
    }
    if result.len() > 2 && random.next() > 0.45 {
        let movable = if preserve_first {
            1 + (random.next() * (result.len() - 1) as f64).floor() as usize
        } else {
            (random.next() * result.len() as f64).floor() as usize
        };
        result[movable] = (result[movable] + if random.next() > 0.5 { 1 } else { 15 }) % 16;
    }
    result.sort_unstable();
    result.dedup();
    result
}

struct SeededRandom {
    value: u32,
}

impl SeededRandom {
    fn new(seed: &str) -> Self {
        let mut value = 2_166_136_261_u32;
        for byte in seed.bytes() {
            value = (value ^ u32::from(byte)).wrapping_mul(16_777_619);
        }
        Self { value }
    }

    fn next(&mut self) -> f64 {
        self.value = self.value.wrapping_add(0x6d2b79f5);
        let mut next = self.value;
        next = (next ^ (next >> 15)).wrapping_mul(next | 1);
        next ^= next.wrapping_add((next ^ (next >> 7)).wrapping_mul(next | 61));
        f64::from(next ^ (next >> 14)) / 4_294_967_296.0
    }
}

fn root_label(root: u8) -> &'static str {
    [
        "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
    ][usize::from(root % 12)]
}
fn harmony_label(value: HarmonyColor) -> &'static str {
    match value {
        HarmonyColor::Dorian => "Dorian smoke",
        HarmonyColor::House => "Warm house",
        HarmonyColor::JazzFunk => "Jazz-funk",
        HarmonyColor::Open => "Open fourths",
    }
}
fn bass_role_label(value: BassRole) -> &'static str {
    match value {
        BassRole::Anchor => "Anchor",
        BassRole::Answer => "Answer",
        BassRole::Roam => "Roam",
        BassRole::Holes => "Leave holes",
    }
}
fn rhythm_label(value: RhythmConcept) -> &'static str {
    match value {
        RhythmConcept::Broken => "Broken pocket",
        RhythmConcept::House => "House interlock",
        RhythmConcept::Footwork => "Footwork skip",
        RhythmConcept::Dub => "Dub negative space",
    }
}
fn energy_label(value: Energy) -> &'static str {
    match value {
        Energy::Low => "low",
        Energy::Medium => "medium",
        Energy::High => "high",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> SeedSettings {
        SeedSettings {
            root: 2,
            harmony: HarmonyColor::Dorian,
            bass_role: BassRole::Anchor,
            rhythm: RhythmConcept::Broken,
            energy: Energy::Medium,
        }
    }

    #[test]
    fn creates_material_for_every_lane() {
        let result = generate_seed(&settings(), 1);
        assert_eq!(result.tracks.len(), 10);
        assert!(result.tracks.iter().all(|track| track.steps.len() == 16));
        assert!(
            result
                .tracks
                .iter()
                .find(|track| track.id == TrackId::DnVamp)
                .unwrap()
                .steps
                .iter()
                .any(|step| step.notes.len() >= 4)
        );
        assert!(
            result
                .tracks
                .iter()
                .filter(|track| matches!(
                    track.id,
                    TrackId::DkKick
                        | TrackId::DkSnare
                        | TrackId::DkClosedHat
                        | TrackId::DkOpenHat
                        | TrackId::DkRim
                        | TrackId::DkClap
                        | TrackId::DkTexture
                ))
                .all(|track| track
                    .steps
                    .iter()
                    .any(|step| step.notes.first() == Some(&60)))
        );
    }

    #[test]
    fn is_repeatable_but_varies_by_generation() {
        assert_eq!(generate_seed(&settings(), 4), generate_seed(&settings(), 4));
        assert_ne!(generate_seed(&settings(), 4), generate_seed(&settings(), 5));
    }

    #[test]
    fn command_payloads_keep_the_frontend_casing_and_track_ids() {
        let decoded: SeedSettings = serde_json::from_value(serde_json::json!({
            "root": 2,
            "harmony": "jazz-funk",
            "bassRole": "holes",
            "rhythm": "footwork",
            "energy": "high"
        }))
        .unwrap();
        assert_eq!(decoded.harmony, HarmonyColor::JazzFunk);
        assert_eq!(decoded.bass_role, BassRole::Holes);

        let encoded = serde_json::to_value(generate_seed(&decoded, 3)).unwrap();
        assert_eq!(encoded["tracks"][0]["id"], "dn-bass");
        assert_eq!(encoded["tracks"][3]["id"], "dk-kick");
        assert!(encoded["tracks"][0].get("tone").is_some());
        assert!(encoded["tracks"][3].get("tone").is_none());
    }
}
