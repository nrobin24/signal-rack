use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RackTarget {
    Digitone,
    Digitakt,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub enum TrackId {
    #[serde(rename = "dn-bass")]
    DnBass,
    #[serde(rename = "dn-vamp")]
    DnVamp,
    #[serde(rename = "dn-puncture")]
    DnPuncture,
    #[serde(rename = "dk-kick")]
    DkKick,
    #[serde(rename = "dk-snare")]
    DkSnare,
    #[serde(rename = "dk-closed-hat")]
    DkClosedHat,
    #[serde(rename = "dk-open-hat")]
    DkOpenHat,
    #[serde(rename = "dk-rim")]
    DkRim,
    #[serde(rename = "dk-clap")]
    DkClap,
    #[serde(rename = "dk-texture")]
    DkTexture,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Groove {
    Straight,
    Push,
    Late,
    Broken,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SceneId {
    Full,
    Bass,
    Space,
    Drop,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum LfoId {
    #[serde(rename = "lfo-1")]
    Lfo1,
    #[serde(rename = "lfo-2")]
    Lfo2,
    #[serde(rename = "lfo-3")]
    Lfo3,
    #[serde(rename = "lfo-4")]
    Lfo4,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum LfoShape {
    #[serde(rename = "sine")]
    Sine,
    #[serde(rename = "triangle")]
    Triangle,
    #[serde(rename = "square")]
    Square,
    #[serde(rename = "ramp-up")]
    RampUp,
    #[serde(rename = "ramp-down")]
    RampDown,
    #[serde(rename = "random")]
    Random,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum LfoPeriod {
    #[serde(rename = "quarter")]
    Quarter,
    #[serde(rename = "half")]
    Half,
    #[serde(rename = "bar-1")]
    Bar1,
    #[serde(rename = "bars-2")]
    Bars2,
    #[serde(rename = "bars-4")]
    Bars4,
    #[serde(rename = "bars-8")]
    Bars8,
    #[serde(rename = "bars-16")]
    Bars16,
    #[serde(rename = "bars-32")]
    Bars32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LfoConfig {
    pub id: LfoId,
    pub shape: LfoShape,
    pub period: LfoPeriod,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub notes: Vec<u8>,
    pub velocity: u8,
    pub gate: u8,
    pub probability: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackConfig {
    pub id: TrackId,
    pub target: RackTarget,
    pub channel: u8,
    pub length: usize,
    pub groove: Groove,
    pub muted: bool,
    pub tone: Option<f64>,
    pub space: Option<f64>,
    pub tone_lfo: Option<LfoId>,
    pub space_lfo: Option<LfoId>,
    #[serde(default)]
    pub tone_lfo_depth: f64,
    #[serde(default)]
    pub space_lfo_depth: f64,
    pub steps: Vec<Step>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SequencerConfig {
    pub bpm: f64,
    pub scene: SceneId,
    pub lfos: Vec<LfoConfig>,
    pub tracks: Vec<TrackConfig>,
}

impl Default for SequencerConfig {
    fn default() -> Self {
        Self {
            bpm: 132.0,
            scene: SceneId::Full,
            lfos: Vec::new(),
            tracks: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HarmonyColor {
    Dorian,
    House,
    JazzFunk,
    Open,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BassRole {
    Anchor,
    Answer,
    Roam,
    Holes,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RhythmConcept {
    Broken,
    House,
    Footwork,
    Dub,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Energy {
    Low,
    Medium,
    High,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedSettings {
    pub root: u8,
    pub harmony: HarmonyColor,
    pub bass_role: BassRole,
    pub rhythm: RhythmConcept,
    pub energy: Energy,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedTrack {
    pub id: TrackId,
    pub length: usize,
    pub groove: Groove,
    pub steps: Vec<Step>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space: Option<u8>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSeed {
    pub tracks: Vec<GeneratedTrack>,
    pub summary: String,
}
