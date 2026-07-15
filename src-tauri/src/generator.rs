use crate::model::{
    BassRole, CycleMode, Energy, GeneratedSeed, GeneratedTrack, Groove, HarmonyColor, PhraseLeader,
    PhraseShape, RhythmConcept, SeedSettings, Step, TrackId,
};

const PHRASE_STEPS: usize = 64;
const BAR_STEPS: usize = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Role {
    Kick,
    Snare,
    ClosedHat,
    OpenHat,
    Rim,
    Clap,
    Texture,
    Bass,
    Vamp,
    Puncture,
}

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
    bass_groove: Groove,
    vamp_groove: Groove,
    puncture_groove: Groove,
}

#[derive(Clone, Copy)]
struct DigitoneLengths {
    bass: usize,
    vamp: usize,
    puncture: usize,
}

impl DigitoneLengths {
    fn for_role(self, role: Role) -> usize {
        match role {
            Role::Bass => self.bass,
            Role::Vamp => self.vamp,
            Role::Puncture => self.puncture,
            _ => PHRASE_STEPS,
        }
    }

    fn drifter_count(self) -> usize {
        [self.bass, self.vamp, self.puncture]
            .into_iter()
            .filter(|length| *length < PHRASE_STEPS)
            .count()
    }
}

impl RhythmTemplate {
    fn positions(&self, role: Role) -> &'static [usize] {
        match role {
            Role::Kick => self.kick,
            Role::Snare => self.snare,
            Role::ClosedHat => self.closed_hat,
            Role::OpenHat => self.open_hat,
            Role::Rim => self.rim,
            Role::Clap => self.clap,
            Role::Texture => self.texture,
            Role::Bass => self.bass,
            Role::Vamp => self.vamp,
            Role::Puncture => self.puncture,
        }
    }
}

pub fn generate_seed(settings: &SeedSettings, variation: u32) -> GeneratedSeed {
    let mut random = SeededRandom::new(&format!(
        "{}-{:?}-{:?}-{:?}-{:?}-{:?}-{:?}-{:?}-{variation}",
        settings.root,
        settings.harmony,
        settings.bass_role,
        settings.rhythm,
        settings.energy,
        settings.shape,
        settings.leader,
        settings.cycle_mode,
    ));
    let rhythm = rhythm_template(settings.rhythm);
    let digitone_lengths = digitone_lengths(settings);
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
    let probability = match settings.energy {
        Energy::Low => 82,
        Energy::Medium => 94,
        Energy::High => 100,
    };

    let positions = |role, random: &mut SeededRandom| {
        let length = digitone_lengths.for_role(role);
        if length < PHRASE_STEPS {
            cycle_positions(rhythm.positions(role), role, length, settings, random)
        } else {
            four_bar_positions(rhythm.positions(role), role, settings, random)
        }
    };
    let bass_positions = positions(Role::Bass, &mut random);
    let vamp_positions = positions(Role::Vamp, &mut random);
    let puncture_positions = positions(Role::Puncture, &mut random);
    let puncture_pitches: Vec<u8> = chords
        .iter()
        .flat_map(|chord| chord[chord.len().saturating_sub(2)..].iter().copied())
        .map(|note| note.saturating_add(12))
        .collect();

    let tracks = vec![
        GeneratedTrack {
            id: TrackId::DnBass,
            length: digitone_lengths.bass,
            groove: rhythm.bass_groove,
            tone: Some(if settings.harmony == HarmonyColor::Open {
                52
            } else {
                64
            }),
            space: Some(match settings.rhythm {
                RhythmConcept::Dub => 42,
                RhythmConcept::UkBass => 28,
                _ => 18,
            }),
            steps: bass_steps(
                &bass_positions,
                &bass_pitches,
                settings,
                108,
                58,
                probability,
            ),
        },
        GeneratedTrack {
            id: TrackId::DnVamp,
            length: digitone_lengths.vamp,
            groove: rhythm.vamp_groove,
            tone: Some(if settings.harmony == HarmonyColor::JazzFunk {
                82
            } else {
                72
            }),
            space: Some(match settings.rhythm {
                RhythmConcept::Dub => 88,
                RhythmConcept::UkBass => 76,
                _ => 62,
            }),
            steps: chord_steps(
                &vamp_positions,
                &chords,
                settings,
                digitone_lengths.vamp,
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
            length: digitone_lengths.puncture,
            groove: rhythm.puncture_groove,
            tone: Some(96),
            space: Some(if settings.rhythm == RhythmConcept::Dub {
                94
            } else {
                48
            }),
            steps: melodic_steps(
                &puncture_positions,
                &puncture_pitches,
                76,
                24,
                if settings.energy == Energy::High {
                    84
                } else {
                    68
                },
            ),
        },
        drum_track(
            TrackId::DkKick,
            positions(Role::Kick, &mut random),
            116,
            34,
            probability,
            rhythm.bass_groove,
        ),
        drum_track(
            TrackId::DkSnare,
            positions(Role::Snare, &mut random),
            104,
            28,
            probability,
            rhythm.vamp_groove,
        ),
        drum_track(
            TrackId::DkClosedHat,
            positions(Role::ClosedHat, &mut random),
            84,
            18,
            if settings.energy == Energy::Low {
                74
            } else {
                94
            },
            rhythm.puncture_groove,
        ),
        drum_track(
            TrackId::DkOpenHat,
            positions(Role::OpenHat, &mut random),
            90,
            68,
            if settings.energy == Energy::Low {
                62
            } else {
                90
            },
            Groove::Late,
        ),
        drum_track(
            TrackId::DkRim,
            positions(Role::Rim, &mut random),
            92,
            22,
            if settings.energy == Energy::Low {
                68
            } else {
                92
            },
            rhythm.bass_groove,
        ),
        drum_track(
            TrackId::DkClap,
            positions(Role::Clap, &mut random),
            102,
            36,
            if settings.energy == Energy::Low {
                84
            } else {
                100
            },
            rhythm.vamp_groove,
        ),
        drum_track(
            TrackId::DkTexture,
            positions(Role::Texture, &mut random),
            76,
            46,
            if settings.energy == Energy::High {
                90
            } else {
                70
            },
            Groove::Broken,
        ),
    ];

    GeneratedSeed {
        tracks,
        summary: format!(
            "{} · {} · {} · {} · {} · {} · {}",
            root_label(settings.root),
            rhythm_label(settings.rhythm),
            phrase_shape_label(settings.shape),
            leader_label(settings.leader),
            cycle_label(digitone_lengths.drifter_count()),
            bass_role_label(settings.bass_role),
            energy_label(settings.energy),
        ),
    }
}

fn digitone_lengths(settings: &SeedSettings) -> DigitoneLengths {
    let preferred = match settings.rhythm {
        RhythmConcept::Broken => DigitoneLengths {
            bass: 14,
            vamp: 12,
            puncture: 12,
        },
        RhythmConcept::House => DigitoneLengths {
            bass: 12,
            vamp: 12,
            puncture: 14,
        },
        RhythmConcept::Footwork => DigitoneLengths {
            bass: 12,
            vamp: 10,
            puncture: 10,
        },
        RhythmConcept::Dub => DigitoneLengths {
            bass: 10,
            vamp: 14,
            puncture: 12,
        },
        RhythmConcept::Jungle => DigitoneLengths {
            bass: 14,
            vamp: 12,
            puncture: 14,
        },
        RhythmConcept::UkBass => DigitoneLengths {
            bass: 14,
            vamp: 14,
            puncture: 10,
        },
        RhythmConcept::Brazilian => DigitoneLengths {
            bass: 14,
            vamp: 12,
            puncture: 12,
        },
        RhythmConcept::Electro => DigitoneLengths {
            bass: 14,
            vamp: 12,
            puncture: 14,
        },
    };
    let mut lengths = DigitoneLengths {
        bass: PHRASE_STEPS,
        vamp: PHRASE_STEPS,
        puncture: PHRASE_STEPS,
    };

    match settings.cycle_mode {
        CycleMode::Locked => {}
        CycleMode::Auto => match settings.leader {
            PhraseLeader::Harmony => lengths.bass = preferred.bass,
            _ => lengths.puncture = preferred.puncture,
        },
        CycleMode::Poly => match settings.leader {
            PhraseLeader::Bass => {
                lengths.vamp = preferred.vamp;
                lengths.puncture = preferred.puncture;
            }
            PhraseLeader::Harmony => {
                lengths.bass = preferred.bass;
                lengths.puncture = preferred.puncture;
            }
            PhraseLeader::Pulse | PhraseLeader::Texture => {
                lengths.bass = preferred.bass;
                lengths.puncture = preferred.puncture;
            }
        },
    }
    lengths
}

fn cycle_positions(
    source: &[usize],
    role: Role,
    length: usize,
    settings: &SeedSettings,
    random: &mut SeededRandom,
) -> Vec<usize> {
    let identity = energy_pattern(source, settings.energy, role, settings.leader, random);
    let mut result: Vec<usize> = identity
        .into_iter()
        .map(|position| position % length)
        .collect();
    if result.len() > 2 && random.next() > 0.45 {
        let movable = 1 + (random.next() * (result.len() - 1) as f64).floor() as usize;
        result[movable] = if random.next() > 0.5 {
            (result[movable] + 1) % length
        } else {
            (result[movable] + length - 1) % length
        };
    }
    if settings.energy == Energy::High {
        result.push(length - 1);
    }
    result.retain(|position| *position < length);
    result.sort_unstable();
    result.dedup();
    if role == Role::Vamp {
        let target_events = (harmonic_motion(settings) + 1).min(4);
        let stride = (length / target_events).max(1);
        let mut candidate = 1;
        while result.len() < target_events && candidate < length {
            if !result.contains(&candidate) {
                result.push(candidate);
            }
            candidate += stride;
        }
    }
    result.sort_unstable();
    result.dedup();
    if result.is_empty() {
        result.push(0);
    }
    result
}

fn four_bar_positions(
    source: &[usize],
    role: Role,
    settings: &SeedSettings,
    random: &mut SeededRandom,
) -> Vec<usize> {
    let identity = energy_pattern(source, settings.energy, role, settings.leader, random);
    let mut bars = [
        identity.clone(),
        identity.clone(),
        identity.clone(),
        identity.clone(),
    ];
    let leads = is_leader(role, settings.leader);
    let turns = role == turn_role(settings.leader);

    match settings.shape {
        PhraseShape::AaTurn => {
            if leads {
                bars[1] = answer_pattern(&identity, random, false);
                bars[2] = develop_pattern(&identity, random, settings.energy == Energy::High);
                bars[3] = return_pattern(&identity);
            }
            if turns {
                add_turn(&mut bars[3], random, settings.energy);
            }
        }
        PhraseShape::QuestionAnswer => {
            if leads {
                bars[1] = answer_pattern(&identity, random, true);
                bars[2] = develop_pattern(&identity, random, false);
                bars[3] = answer_pattern(&identity, random, false);
            }
            if turns {
                add_turn(&mut bars[3], random, settings.energy);
            }
        }
        PhraseShape::EventSpace => {
            if leads {
                bars[1] = consequence_pattern(&identity, random);
                bars[2] = thin_pattern(&identity, 1);
                bars[3] = return_pattern(&identity);
            } else if matches!(role, Role::Texture | Role::Vamp | Role::Puncture) {
                bars[2] = thin_pattern(&identity, 1);
            }
            if turns {
                add_turn(&mut bars[3], random, settings.energy);
            }
        }
        PhraseShape::CallChallenge => {
            if leads {
                bars[1] = pressure_pattern(&identity, random);
                bars[2] = thin_pattern(&identity, 1);
                bars[3] = return_pattern(&identity);
                if bars[3].len() > 1 {
                    bars[3].pop();
                }
            }
            if turns {
                bars[2] = thin_pattern(&identity, 1);
                add_turn(&mut bars[3], random, settings.energy);
            }
        }
    }

    bars.into_iter()
        .enumerate()
        .flat_map(|(bar, pattern)| {
            pattern
                .into_iter()
                .map(move |position| bar * BAR_STEPS + position)
        })
        .filter(|position| *position < PHRASE_STEPS)
        .collect()
}

fn energy_pattern(
    source: &[usize],
    energy: Energy,
    role: Role,
    leader: PhraseLeader,
    random: &mut SeededRandom,
) -> Vec<usize> {
    let mut result = source.to_vec();
    if energy == Energy::Low && result.len() > 2 {
        result = result
            .into_iter()
            .enumerate()
            .filter_map(|(index, value)| (index % 3 != 2).then_some(value))
            .collect();
    }
    if energy == Energy::High && (is_leader(role, leader) || result.len() <= 4) {
        let candidate = ((random.next() * BAR_STEPS as f64).floor() as usize).min(15);
        result.push(candidate);
    }
    normalize(result, source.first().copied())
}

fn answer_pattern(identity: &[usize], random: &mut SeededRandom, stronger: bool) -> Vec<usize> {
    let mut result = identity.to_vec();
    let source = identity.last().copied().unwrap_or(0);
    let offset = if random.next() > 0.5 { 2 } else { 1 };
    result.push((source + offset).min(15));
    if stronger && identity.len() > 2 {
        let index = 1 + ((random.next() * (identity.len() - 1) as f64) as usize);
        result[index] = (result[index] + 1).min(15);
    }
    normalize(result, identity.first().copied())
}

fn develop_pattern(identity: &[usize], random: &mut SeededRandom, pressure: bool) -> Vec<usize> {
    let mut result = identity.to_vec();
    if result.len() > 2 {
        let movable = 1 + ((random.next() * (result.len() - 1) as f64) as usize);
        result[movable] = if random.next() > 0.5 {
            (result[movable] + 1).min(15)
        } else {
            result[movable].saturating_sub(1)
        };
    }
    if pressure {
        result.push(14 + (random.next() > 0.5) as usize);
    } else if result.len() > 3 {
        result.remove(result.len() - 2);
    }
    normalize(result, identity.first().copied())
}

fn consequence_pattern(identity: &[usize], random: &mut SeededRandom) -> Vec<usize> {
    let mut result = thin_pattern(identity, (identity.len() + 1) / 2);
    let last = identity.last().copied().unwrap_or(0);
    result.push((last + if random.next() > 0.5 { 1 } else { 2 }).min(15));
    normalize(result, identity.first().copied())
}

fn pressure_pattern(identity: &[usize], random: &mut SeededRandom) -> Vec<usize> {
    let mut result = identity.to_vec();
    let pivot = identity.get(identity.len() / 2).copied().unwrap_or(8);
    result.push((pivot + 1 + (random.next() > 0.5) as usize).min(15));
    result.push(15);
    normalize(result, identity.first().copied())
}

fn return_pattern(identity: &[usize]) -> Vec<usize> {
    let mut result = identity.to_vec();
    if result.len() > 3 {
        result.remove(result.len() - 1);
    }
    normalize(result, identity.first().copied())
}

fn thin_pattern(identity: &[usize], keep: usize) -> Vec<usize> {
    identity.iter().copied().take(keep.max(1)).collect()
}

fn add_turn(pattern: &mut Vec<usize>, random: &mut SeededRandom, energy: Energy) {
    let pickup = match energy {
        Energy::Low => 15,
        Energy::Medium => 14 + (random.next() > 0.5) as usize,
        Energy::High => 13 + (random.next() * 3.0).floor() as usize,
    };
    pattern.push(pickup.min(15));
    if energy == Energy::High {
        pattern.push(15);
    }
    *pattern = normalize(std::mem::take(pattern), pattern.first().copied());
}

fn normalize(mut positions: Vec<usize>, anchor: Option<usize>) -> Vec<usize> {
    positions.retain(|position| *position < BAR_STEPS);
    if positions.is_empty() {
        positions.push(anchor.unwrap_or(0).min(15));
    }
    positions.sort_unstable();
    positions.dedup();
    positions
}

fn is_leader(role: Role, leader: PhraseLeader) -> bool {
    match leader {
        PhraseLeader::Pulse => matches!(
            role,
            Role::Kick | Role::Snare | Role::ClosedHat | Role::OpenHat
        ),
        PhraseLeader::Bass => role == Role::Bass,
        PhraseLeader::Harmony => matches!(role, Role::Vamp | Role::Puncture),
        PhraseLeader::Texture => matches!(role, Role::Texture | Role::Rim | Role::Clap),
    }
}

fn turn_role(leader: PhraseLeader) -> Role {
    match leader {
        PhraseLeader::Pulse => Role::Puncture,
        PhraseLeader::Bass => Role::ClosedHat,
        PhraseLeader::Harmony => Role::Kick,
        PhraseLeader::Texture => Role::Bass,
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
            bass_groove: Groove::Late,
            vamp_groove: Groove::Late,
            puncture_groove: Groove::Broken,
        },
        RhythmConcept::Jungle => RhythmTemplate {
            kick: &[0, 3, 7, 10, 14],
            snare: &[4, 12],
            closed_hat: &[1, 2, 5, 6, 9, 10, 13, 14, 15],
            open_hat: &[7, 15],
            rim: &[3, 11, 14],
            clap: &[4, 12],
            texture: &[2, 6, 10, 14],
            bass: &[0, 7, 13],
            vamp: &[0, 11],
            puncture: &[7, 15],
            bass_groove: Groove::Broken,
            vamp_groove: Groove::Broken,
            puncture_groove: Groove::Push,
        },
        RhythmConcept::UkBass => RhythmTemplate {
            kick: &[0, 6, 10],
            snare: &[4, 12],
            closed_hat: &[2, 5, 9, 14],
            open_hat: &[6, 14],
            rim: &[3, 11],
            clap: &[12],
            texture: &[7, 15],
            bass: &[0, 7, 10],
            vamp: &[2, 11],
            puncture: &[6, 15],
            bass_groove: Groove::Late,
            vamp_groove: Groove::Broken,
            puncture_groove: Groove::Late,
        },
        RhythmConcept::Brazilian => RhythmTemplate {
            kick: &[0, 7, 10, 15],
            snare: &[4, 12],
            closed_hat: &[0, 3, 6, 8, 11, 14],
            open_hat: &[6, 14],
            rim: &[2, 5, 9, 13],
            clap: &[4, 12],
            texture: &[3, 10, 15],
            bass: &[0, 6, 11, 15],
            vamp: &[2, 7, 10, 14],
            puncture: &[5, 13],
            bass_groove: Groove::Push,
            vamp_groove: Groove::Straight,
            puncture_groove: Groove::Late,
        },
        RhythmConcept::Electro => RhythmTemplate {
            kick: &[0, 6, 8, 11],
            snare: &[4, 12],
            closed_hat: &[2, 6, 10, 14],
            open_hat: &[7, 15],
            rim: &[3, 11, 15],
            clap: &[4, 12],
            texture: &[1, 9, 13],
            bass: &[0, 3, 8, 11, 14],
            vamp: &[2, 10],
            puncture: &[6, 14],
            bass_groove: Groove::Straight,
            vamp_groove: Groove::Broken,
            puncture_groove: Groove::Push,
        },
    }
}

fn chord_shapes(harmony: HarmonyColor) -> Vec<Vec<u8>> {
    match harmony {
        HarmonyColor::Dorian => vec![
            vec![0, 3, 7, 10],
            vec![5, 9, 12, 16],
            vec![10, 14, 17, 21],
            vec![2, 5, 9, 12],
        ],
        HarmonyColor::House => vec![
            vec![0, 3, 7, 10],
            vec![10, 14, 17, 21],
            vec![5, 8, 12, 15],
            vec![3, 7, 10, 14],
        ],
        HarmonyColor::JazzFunk => vec![
            vec![0, 3, 7, 10, 14],
            vec![2, 5, 9, 12, 17],
            vec![5, 9, 12, 15, 19],
            vec![7, 10, 12, 17, 20],
        ],
        HarmonyColor::Open => vec![
            vec![0, 5, 10, 15],
            vec![2, 7, 12, 17],
            vec![5, 10, 15, 19],
            vec![7, 12, 17, 22],
        ],
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
    (0..PHRASE_STEPS)
        .map(|_| Step {
            notes: Vec::new(),
            velocity: 100,
            gate: 50,
            probability: 100,
        })
        .collect()
}

fn bass_steps(
    positions: &[usize],
    pitches: &[u8],
    settings: &SeedSettings,
    velocity: u8,
    gate: u8,
    probability: u8,
) -> Vec<Step> {
    let mut steps = empty_steps();
    let mut bar_events = [0usize; 4];
    for position in positions.iter().copied() {
        let bar = position / BAR_STEPS;
        let event = bar_events[bar];
        bar_events[bar] += 1;
        let mut pitch = pitches[(event + usize::from(bar >= 2)) % pitches.len()];
        if settings.leader == PhraseLeader::Bass && bar == 2 && event == 0 {
            pitch = pitch.saturating_add(12).min(127);
        }
        if position >= 60 {
            pitch = pitches.get(1).copied().unwrap_or(pitch);
        }
        steps[position] = Step {
            notes: vec![pitch],
            velocity: if position % BAR_STEPS == 0 {
                velocity.saturating_add(8).min(127)
            } else {
                velocity
            },
            gate: if position >= 60 { gate.min(36) } else { gate },
            probability,
        };
    }
    steps
}

fn melodic_steps(
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
            velocity: if position % BAR_STEPS == 0 {
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
    settings: &SeedSettings,
    length: usize,
    velocity: u8,
    gate: u8,
    probability: u8,
) -> Vec<Step> {
    let mut steps = empty_steps();
    let motion = harmonic_motion(settings);
    let bar_plan = harmonic_plan(settings.shape, motion);
    let mut events_per_bar = [0usize; 4];
    for position in positions.iter().copied() {
        events_per_bar[position / BAR_STEPS] += 1;
    }
    let mut bar_event = [0usize; 4];

    for (event_index, position) in positions.iter().copied().enumerate() {
        let bar = position / BAR_STEPS;
        let event_in_bar = bar_event[bar];
        bar_event[bar] += 1;
        let chord_index = if length < PHRASE_STEPS {
            cycle_chord_index(event_index, motion)
        } else {
            let is_late_approach =
                motion >= 3 && event_in_bar + 1 == events_per_bar[bar] && position % BAR_STEPS >= 8;
            if is_late_approach {
                bar_plan[(bar + 1) % 4]
            } else {
                bar_plan[bar]
            }
        };
        let inversion = if motion >= 2 {
            (bar + event_in_bar + chord_index) % 2
        } else {
            0
        };
        steps[position] = Step {
            notes: invert_chord(&chords[chord_index % chords.len()], inversion),
            velocity,
            gate: if position >= 60 { gate.min(34) } else { gate },
            probability,
        };
    }
    steps
}

fn harmonic_motion(settings: &SeedSettings) -> usize {
    let base: usize = match settings.harmony {
        HarmonyColor::Dorian => 1,
        HarmonyColor::House => 2,
        HarmonyColor::JazzFunk => 3,
        HarmonyColor::Open => 2,
    };
    let led = if settings.leader == PhraseLeader::Harmony {
        base + 1
    } else {
        base
    };
    match settings.energy {
        Energy::Low => led.saturating_sub(1),
        Energy::Medium => led.min(3),
        Energy::High => (led + 1).min(3),
    }
}

fn harmonic_plan(shape: PhraseShape, motion: usize) -> [usize; 4] {
    match motion {
        0 => [0, 0, 0, 0],
        1 => match shape {
            PhraseShape::QuestionAnswer => [0, 1, 0, 1],
            PhraseShape::EventSpace => [0, 1, 0, 0],
            _ => [0, 0, 1, 0],
        },
        2 => match shape {
            PhraseShape::AaTurn => [0, 1, 2, 0],
            PhraseShape::QuestionAnswer => [0, 1, 2, 1],
            PhraseShape::EventSpace => [0, 1, 0, 2],
            PhraseShape::CallChallenge => [0, 2, 1, 0],
        },
        _ => match shape {
            PhraseShape::AaTurn => [0, 1, 2, 3],
            PhraseShape::QuestionAnswer => [0, 2, 1, 3],
            PhraseShape::EventSpace => [0, 1, 2, 0],
            PhraseShape::CallChallenge => [0, 2, 1, 3],
        },
    }
}

fn cycle_chord_index(event: usize, motion: usize) -> usize {
    match motion {
        0 => 0,
        1 => [0, 0, 1][event % 3],
        2 => [0, 1, 0, 2][event % 4],
        _ => event % 4,
    }
}

fn invert_chord(chord: &[u8], inversion: usize) -> Vec<u8> {
    let mut notes = chord.to_vec();
    if notes.is_empty() {
        return notes;
    }
    for _ in 0..inversion.min(notes.len() - 1) {
        let note = notes.remove(0).saturating_add(12).min(127);
        notes.push(note);
    }
    notes
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
    for position in positions {
        steps[position] = Step {
            notes: vec![60],
            velocity: if position % BAR_STEPS == 0 {
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
        length: PHRASE_STEPS,
        groove,
        steps,
        tone: None,
        space: None,
    }
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

fn rhythm_label(value: RhythmConcept) -> &'static str {
    match value {
        RhythmConcept::Broken => "Broken pocket",
        RhythmConcept::House => "House interlock",
        RhythmConcept::Footwork => "Footwork pressure",
        RhythmConcept::Dub => "Dub negative space",
        RhythmConcept::Jungle => "Jungle launch",
        RhythmConcept::UkBass => "UK bass asymmetry",
        RhythmConcept::Brazilian => "Brazilian interlock",
        RhythmConcept::Electro => "Electro machine rule",
    }
}

fn bass_role_label(value: BassRole) -> &'static str {
    match value {
        BassRole::Anchor => "Anchor bass",
        BassRole::Answer => "Answer bass",
        BassRole::Roam => "Roaming bass",
        BassRole::Holes => "Bass with holes",
    }
}

fn phrase_shape_label(value: PhraseShape) -> &'static str {
    match value {
        PhraseShape::AaTurn => "A–A′–B–turn",
        PhraseShape::QuestionAnswer => "question / answer",
        PhraseShape::EventSpace => "event / space / return",
        PhraseShape::CallChallenge => "call / break / challenge",
    }
}

fn leader_label(value: PhraseLeader) -> &'static str {
    match value {
        PhraseLeader::Pulse => "drums lead",
        PhraseLeader::Bass => "bass leads",
        PhraseLeader::Harmony => "harmony leads",
        PhraseLeader::Texture => "texture leads",
    }
}

fn cycle_label(drifters: usize) -> &'static str {
    match drifters {
        0 => "bar-locked",
        1 => "1 drifter",
        _ => "polyrhythm",
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
    use std::collections::BTreeSet;

    fn settings() -> SeedSettings {
        SeedSettings {
            root: 2,
            harmony: HarmonyColor::Dorian,
            bass_role: BassRole::Anchor,
            rhythm: RhythmConcept::Broken,
            energy: Energy::Medium,
            shape: PhraseShape::AaTurn,
            leader: PhraseLeader::Bass,
            cycle_mode: CycleMode::Auto,
        }
    }

    fn vamp_harmonies(settings: &SeedSettings) -> BTreeSet<Vec<u8>> {
        let result = generate_seed(settings, 11);
        let vamp = result
            .tracks
            .iter()
            .find(|track| track.id == TrackId::DnVamp)
            .unwrap();
        vamp.steps[..vamp.length]
            .iter()
            .filter(|step| !step.notes.is_empty())
            .map(|step| {
                let mut pitch_classes = step.notes.iter().map(|note| note % 12).collect::<Vec<_>>();
                pitch_classes.sort_unstable();
                pitch_classes.dedup();
                pitch_classes
            })
            .collect()
    }

    #[test]
    fn creates_a_four_bar_frame_with_one_style_aware_drifter() {
        let result = generate_seed(&settings(), 1);
        assert_eq!(result.tracks.len(), 10);
        assert!(result.tracks.iter().all(|track| track.steps.len() == 64));
        assert_eq!(
            result
                .tracks
                .iter()
                .filter(|track| {
                    matches!(
                        track.id,
                        TrackId::DnBass | TrackId::DnVamp | TrackId::DnPuncture
                    ) && track.length < PHRASE_STEPS
                })
                .count(),
            1
        );
        assert!(result.tracks.iter().all(|track| {
            track.steps[..track.length]
                .iter()
                .any(|step| !step.notes.is_empty())
        }));
        assert!(
            result
                .tracks
                .iter()
                .filter(|track| track.length == PHRASE_STEPS)
                .all(|track| {
                    track.steps[..16].iter().any(|step| !step.notes.is_empty())
                        && track.steps[16..32]
                            .iter()
                            .any(|step| !step.notes.is_empty())
                        && track.steps[32..48]
                            .iter()
                            .any(|step| !step.notes.is_empty())
                        && track.steps[48..].iter().any(|step| !step.notes.is_empty())
                })
        );
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
    }

    #[test]
    fn cycle_modes_keep_drums_locked_and_control_digitone_polymeter() {
        for (mode, expected_drifters) in [
            (CycleMode::Locked, 0),
            (CycleMode::Auto, 1),
            (CycleMode::Poly, 2),
        ] {
            let mut input = settings();
            input.cycle_mode = mode;
            let result = generate_seed(&input, 2);
            let digitone_drifters = result
                .tracks
                .iter()
                .filter(|track| {
                    matches!(
                        track.id,
                        TrackId::DnBass | TrackId::DnVamp | TrackId::DnPuncture
                    ) && track.length < PHRASE_STEPS
                })
                .count();
            assert_eq!(digitone_drifters, expected_drifters);
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
                    .all(|track| track.length == PHRASE_STEPS)
            );
        }
    }

    #[test]
    fn poly_mode_keeps_the_phrase_leader_on_the_four_bar_frame() {
        let mut input = settings();
        input.cycle_mode = CycleMode::Poly;
        let bass_led = generate_seed(&input, 3);
        assert_eq!(
            bass_led
                .tracks
                .iter()
                .find(|track| track.id == TrackId::DnBass)
                .unwrap()
                .length,
            PHRASE_STEPS
        );

        input.leader = PhraseLeader::Harmony;
        let harmony_led = generate_seed(&input, 3);
        assert_eq!(
            harmony_led
                .tracks
                .iter()
                .find(|track| track.id == TrackId::DnVamp)
                .unwrap()
                .length,
            PHRASE_STEPS
        );
    }

    #[test]
    fn harmony_and_energy_scale_vamp_motion_from_one_to_four_chords() {
        let mut input = settings();
        input.cycle_mode = CycleMode::Locked;
        input.leader = PhraseLeader::Bass;
        input.harmony = HarmonyColor::Dorian;
        input.energy = Energy::Low;
        assert_eq!(vamp_harmonies(&input).len(), 1);

        input.harmony = HarmonyColor::House;
        input.energy = Energy::Medium;
        assert!(vamp_harmonies(&input).len() >= 3);

        input.harmony = HarmonyColor::JazzFunk;
        assert!(vamp_harmonies(&input).len() >= 4);

        input.harmony = HarmonyColor::Open;
        input.energy = Energy::High;
        assert!(vamp_harmonies(&input).len() >= 4);
    }

    #[test]
    fn short_polyrhythmic_vamps_carry_a_local_chord_cycle() {
        let mut input = settings();
        input.cycle_mode = CycleMode::Poly;
        input.harmony = HarmonyColor::JazzFunk;
        input.energy = Energy::Medium;
        let result = generate_seed(&input, 11);
        let vamp = result
            .tracks
            .iter()
            .find(|track| track.id == TrackId::DnVamp)
            .unwrap();
        assert!(vamp.length < PHRASE_STEPS);
        assert!(vamp_harmonies(&input).len() >= 4);
    }

    #[test]
    fn preserves_house_kick_anchors_across_the_phrase() {
        let mut input = settings();
        input.rhythm = RhythmConcept::House;
        let result = generate_seed(&input, 2);
        let kick = result
            .tracks
            .iter()
            .find(|track| track.id == TrackId::DkKick)
            .unwrap();
        for position in [0, 16, 32, 48] {
            assert!(!kick.steps[position].notes.is_empty());
        }
    }

    #[test]
    fn the_leader_develops_while_an_anchor_stays_recognizable() {
        let result = generate_seed(&settings(), 7);
        let bass = result
            .tracks
            .iter()
            .find(|track| track.id == TrackId::DnBass)
            .unwrap();
        let kick = result
            .tracks
            .iter()
            .find(|track| track.id == TrackId::DkKick)
            .unwrap();
        let active = |steps: &[Step]| {
            steps
                .iter()
                .enumerate()
                .filter_map(|(index, step)| (!step.notes.is_empty()).then_some(index))
                .collect::<Vec<_>>()
        };
        assert_ne!(active(&bass.steps[0..16]), active(&bass.steps[32..48]));
        assert_eq!(active(&kick.steps[0..16]), active(&kick.steps[32..48]));
    }

    #[test]
    fn every_style_shape_leader_and_cycle_mode_stays_valid() {
        let styles = [
            RhythmConcept::Broken,
            RhythmConcept::House,
            RhythmConcept::Footwork,
            RhythmConcept::Dub,
            RhythmConcept::Jungle,
            RhythmConcept::UkBass,
            RhythmConcept::Brazilian,
            RhythmConcept::Electro,
        ];
        let shapes = [
            PhraseShape::AaTurn,
            PhraseShape::QuestionAnswer,
            PhraseShape::EventSpace,
            PhraseShape::CallChallenge,
        ];
        let leaders = [
            PhraseLeader::Pulse,
            PhraseLeader::Bass,
            PhraseLeader::Harmony,
            PhraseLeader::Texture,
        ];
        let cycle_modes = [CycleMode::Auto, CycleMode::Locked, CycleMode::Poly];
        for rhythm in styles {
            for shape in shapes {
                for leader in leaders {
                    for cycle_mode in cycle_modes {
                        let mut input = settings();
                        input.rhythm = rhythm;
                        input.shape = shape;
                        input.leader = leader;
                        input.cycle_mode = cycle_mode;
                        let result = generate_seed(&input, 3);
                        assert!(result.tracks.iter().all(|track| {
                            matches!(track.length, 10 | 12 | 14 | 64)
                                && track.steps.len() == PHRASE_STEPS
                        }));
                        assert!(result.tracks.iter().all(|track| {
                            track.steps[..track.length]
                                .iter()
                                .any(|step| !step.notes.is_empty())
                        }));
                        assert!(
                            result
                                .tracks
                                .iter()
                                .filter(|track| track.length < PHRASE_STEPS)
                                .all(|track| track.steps[track.length..]
                                    .iter()
                                    .all(|step| step.notes.is_empty()))
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn is_repeatable_but_varies_by_generation() {
        assert_eq!(generate_seed(&settings(), 4), generate_seed(&settings(), 4));
        assert_ne!(generate_seed(&settings(), 4), generate_seed(&settings(), 5));
    }

    #[test]
    fn command_payloads_keep_frontend_casing_and_default_new_controls() {
        let decoded: SeedSettings = serde_json::from_value(serde_json::json!({
            "root": 2,
            "harmony": "jazz-funk",
            "bassRole": "holes",
            "rhythm": "uk-bass",
            "energy": "high"
        }))
        .unwrap();
        assert_eq!(decoded.harmony, HarmonyColor::JazzFunk);
        assert_eq!(decoded.bass_role, BassRole::Holes);
        assert_eq!(decoded.rhythm, RhythmConcept::UkBass);
        assert_eq!(decoded.shape, PhraseShape::AaTurn);
        assert_eq!(decoded.leader, PhraseLeader::Bass);
        assert_eq!(decoded.cycle_mode, CycleMode::Auto);

        let legacy: RhythmConcept = serde_json::from_str("\"ukbass\"").unwrap();
        assert_eq!(legacy, RhythmConcept::UkBass);
        assert_eq!(serde_json::to_value(legacy).unwrap(), "uk-bass");

        let encoded = serde_json::to_value(generate_seed(&decoded, 3)).unwrap();
        assert_eq!(encoded["tracks"][0]["id"], "dn-bass");
        assert_eq!(encoded["tracks"][0]["length"], 64);
        assert_eq!(encoded["tracks"][3]["id"], "dk-kick");
        assert!(encoded["tracks"][0].get("tone").is_some());
        assert!(encoded["tracks"][3].get("tone").is_none());
    }
}
