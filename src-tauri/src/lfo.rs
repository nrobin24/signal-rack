use crate::model::{LfoConfig, LfoId, LfoPeriod, LfoShape};

fn period_pulses(period: LfoPeriod) -> u64 {
    match period {
        LfoPeriod::Quarter => 24,
        LfoPeriod::Half => 48,
        LfoPeriod::Bar1 => 96,
        LfoPeriod::Bars2 => 192,
        LfoPeriod::Bars4 => 384,
        LfoPeriod::Bars8 => 768,
        LfoPeriod::Bars16 => 1536,
        LfoPeriod::Bars32 => 3072,
        LfoPeriod::Bars64 => 6144,
        LfoPeriod::Bars128 => 12288,
    }
}

pub fn lfo_value(lfo: &LfoConfig, pulse: u64) -> f64 {
    let pulses = period_pulses(lfo.period);
    let phase = (pulse % pulses) as f64 / pulses as f64;
    match lfo.shape {
        LfoShape::Sine => (phase * std::f64::consts::TAU).sin(),
        LfoShape::Triangle => 1.0 - 4.0 * (phase - 0.5).abs(),
        LfoShape::Square => {
            if phase < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
        LfoShape::RampUp => phase * 2.0 - 1.0,
        LfoShape::RampDown => 1.0 - phase * 2.0,
        LfoShape::Random => random_cycle_value(lfo.id, pulse / pulses),
        LfoShape::Drawn => drawn_value(&lfo.points, phase),
    }
}

fn drawn_value(points: &[crate::model::LfoPoint], phase: f64) -> f64 {
    let Some(first) = points.first() else {
        return 0.0;
    };
    if phase <= first.x {
        return first.y.clamp(-1.0, 1.0);
    }

    let mut previous = first;
    for point in &points[1..] {
        if phase <= point.x {
            let width = point.x - previous.x;
            if width <= f64::EPSILON {
                return point.y.clamp(-1.0, 1.0);
            }
            let amount = (phase - previous.x) / width;
            return (previous.y + (point.y - previous.y) * amount).clamp(-1.0, 1.0);
        }
        previous = point;
    }
    previous.y.clamp(-1.0, 1.0)
}

pub fn modulated_value(base: f64, lfo: Option<&LfoConfig>, depth: f64, pulse: u64) -> f64 {
    let modulation = lfo.map_or(0.0, |source| lfo_value(source, pulse) * depth);
    (base + modulation).clamp(0.0, 127.0)
}

fn random_cycle_value(id: LfoId, cycle: u64) -> f64 {
    let id = match id {
        LfoId::Lfo1 => "lfo-1",
        LfoId::Lfo2 => "lfo-2",
        LfoId::Lfo3 => "lfo-3",
        LfoId::Lfo4 => "lfo-4",
        LfoId::Lfo5 => "lfo-5",
        LfoId::Lfo6 => "lfo-6",
        LfoId::Lfo7 => "lfo-7",
        LfoId::Lfo8 => "lfo-8",
    };
    let mut value = 2_166_136_261_u32;
    for byte in format!("{id}-{cycle}").bytes() {
        value = (value ^ u32::from(byte)).wrapping_mul(16_777_619);
    }
    value = value.wrapping_add(0x6d2b79f5);
    value = (value ^ (value >> 15)).wrapping_mul(value | 1);
    value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
    f64::from(value ^ (value >> 14)) / 2_147_483_648.0 - 1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine() -> LfoConfig {
        LfoConfig {
            id: LfoId::Lfo1,
            shape: LfoShape::Sine,
            period: LfoPeriod::Quarter,
            points: Vec::new(),
        }
    }

    #[test]
    fn follows_clock_divisions_and_restarts() {
        let lfo = sine();
        assert!(lfo_value(&lfo, 0).abs() < 1e-9);
        assert!((lfo_value(&lfo, 6) - 1.0).abs() < 1e-9);
        assert!(lfo_value(&lfo, 12).abs() < 1e-9);
        assert!((lfo_value(&lfo, 18) + 1.0).abs() < 1e-9);
        assert!(lfo_value(&lfo, 24).abs() < 1e-9);
    }

    #[test]
    fn supports_slow_64_and_128_bar_cycles() {
        let mut lfo = sine();
        lfo.period = LfoPeriod::Bars64;
        assert!((lfo_value(&lfo, 1536) - 1.0).abs() < 1e-9);
        assert!(lfo_value(&lfo, 6144).abs() < 1e-9);

        lfo.period = LfoPeriod::Bars128;
        assert!((lfo_value(&lfo, 3072) - 1.0).abs() < 1e-9);
        assert!(lfo_value(&lfo, 12288).abs() < 1e-9);
    }

    #[test]
    fn random_holds_for_a_complete_period() {
        let lfo = LfoConfig {
            id: LfoId::Lfo4,
            shape: LfoShape::Random,
            period: LfoPeriod::Bar1,
            points: Vec::new(),
        };
        assert_eq!(lfo_value(&lfo, 0), lfo_value(&lfo, 95));
        assert_ne!(lfo_value(&lfo, 95), lfo_value(&lfo, 96));
    }

    #[test]
    fn depth_is_bipolar_and_clamped_to_midi_range() {
        let lfo = LfoConfig {
            shape: LfoShape::Square,
            ..sine()
        };
        assert_eq!(modulated_value(64.0, Some(&lfo), 40.0, 0), 104.0);
        assert_eq!(modulated_value(110.0, Some(&lfo), 40.0, 0), 127.0);
        assert_eq!(modulated_value(10.0, Some(&lfo), 40.0, 12), 0.0);
        assert_eq!(modulated_value(73.0, None, 40.0, 0), 73.0);
    }

    #[test]
    fn drawn_shape_interpolates_between_points_and_restarts() {
        let lfo = LfoConfig {
            id: LfoId::Lfo1,
            shape: LfoShape::Drawn,
            period: LfoPeriod::Quarter,
            points: vec![
                crate::model::LfoPoint { x: 0.0, y: -1.0 },
                crate::model::LfoPoint { x: 0.5, y: 1.0 },
                crate::model::LfoPoint { x: 1.0, y: -1.0 },
            ],
        };
        assert_eq!(lfo_value(&lfo, 0), -1.0);
        assert_eq!(lfo_value(&lfo, 6), 0.0);
        assert_eq!(lfo_value(&lfo, 12), 1.0);
        assert_eq!(lfo_value(&lfo, 18), 0.0);
        assert_eq!(lfo_value(&lfo, 24), -1.0);
    }
}
