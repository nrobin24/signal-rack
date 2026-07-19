use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU32, Ordering},
};

use cpal::{
    FromSample, Sample, SampleFormat, SampleRate, SizedSample, Stream, StreamConfig,
    SupportedStreamConfig, SupportedStreamConfigRange,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::Serialize;

const PREFERRED_SAMPLE_RATES: [u32; 5] = [48_000, 44_100, 96_000, 88_200, 32_000];
const DEFAULT_MONITOR_LEVEL: f32 = 1.5;
const MAX_MONITOR_LEVEL: f32 = 4.0;

#[derive(Clone, Default)]
pub struct AudioState(pub Arc<Mutex<AudioEngine>>);

#[derive(Default)]
pub struct AudioEngine {
    monitor: Option<AudioMonitor>,
}

struct AudioMonitor {
    _input_stream: Stream,
    _output_stream: Stream,
    input_name: String,
    output_name: String,
    sample_rate: u32,
    level: Arc<AtomicU32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevices {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    pub default_input: Option<String>,
    pub default_output: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMonitorStatus {
    pub active: bool,
    pub input_name: Option<String>,
    pub output_name: Option<String>,
    pub sample_rate: Option<u32>,
    pub level: f32,
}

pub fn devices() -> Result<AudioDevices, String> {
    let host = cpal::default_host();
    let default_input = host.default_input_device().map(|device| device.to_string());
    let default_output = host
        .default_output_device()
        .map(|device| device.to_string());
    Ok(AudioDevices {
        inputs: host
            .input_devices()
            .map_err(|error| format!("could not scan audio inputs: {error}"))?
            .map(|device| device.to_string())
            .collect(),
        outputs: host
            .output_devices()
            .map_err(|error| format!("could not scan audio outputs: {error}"))?
            .map(|device| device.to_string())
            .collect(),
        default_input,
        default_output,
    })
}

pub fn status(state: &AudioState) -> Result<AudioMonitorStatus, String> {
    let engine = state
        .0
        .lock()
        .map_err(|_| "audio monitor state lock poisoned".to_string())?;
    let monitor = engine.monitor.as_ref();
    Ok(AudioMonitorStatus {
        active: monitor.is_some(),
        input_name: monitor.map(|monitor| monitor.input_name.clone()),
        output_name: monitor.map(|monitor| monitor.output_name.clone()),
        sample_rate: monitor.map(|monitor| monitor.sample_rate),
        level: monitor
            .map(|monitor| f32::from_bits(monitor.level.load(Ordering::Relaxed)))
            .unwrap_or(DEFAULT_MONITOR_LEVEL),
    })
}

pub fn start(
    state: &AudioState,
    input_index: usize,
    output_index: usize,
    level: f32,
) -> Result<(), String> {
    let host = cpal::default_host();
    let input = host
        .input_devices()
        .map_err(|error| format!("could not scan audio inputs: {error}"))?
        .nth(input_index)
        .ok_or_else(|| "the selected audio input is no longer available".to_string())?;
    let output = host
        .output_devices()
        .map_err(|error| format!("could not scan audio outputs: {error}"))?
        .nth(output_index)
        .ok_or_else(|| "the selected audio output is no longer available".to_string())?;
    let input_name = input.to_string();
    let output_name = output.to_string();
    let (input_config, output_config) = compatible_configs(&input, &output)?;
    let sample_rate = input_config.sample_rate();
    let input_channels = input_config.channels() as usize;
    let output_channels = output_config.channels() as usize;
    let capacity = (sample_rate as usize / 2 * input_channels).max(4_096);
    let (mut producer, consumer) = RingBuffer::<f32>::new(capacity);

    // A short head start prevents the output callback from racing the input callback at launch.
    let prefill_samples = (sample_rate as usize / 100 * input_channels).min(capacity / 4);
    for _ in 0..prefill_samples {
        let _ = producer.push(0.0);
    }

    let level = Arc::new(AtomicU32::new(safe_level(level).to_bits()));
    let input_stream = build_input(&input, &input_config, producer)?;
    let output_stream = build_output(
        &output,
        &output_config,
        input_channels,
        output_channels,
        consumer,
        Arc::clone(&level),
    )?;

    input_stream
        .play()
        .map_err(|error| format!("could not start audio input: {error}"))?;
    output_stream
        .play()
        .map_err(|error| format!("could not start audio output: {error}"))?;

    let mut engine = state
        .0
        .lock()
        .map_err(|_| "audio monitor state lock poisoned".to_string())?;
    engine.monitor = Some(AudioMonitor {
        _input_stream: input_stream,
        _output_stream: output_stream,
        input_name,
        output_name,
        sample_rate,
        level,
    });
    Ok(())
}

pub fn set_level(state: &AudioState, level: f32) -> Result<(), String> {
    let engine = state
        .0
        .lock()
        .map_err(|_| "audio monitor state lock poisoned".to_string())?;
    let monitor = engine
        .monitor
        .as_ref()
        .ok_or_else(|| "audio monitoring is not active".to_string())?;
    monitor
        .level
        .store(safe_level(level).to_bits(), Ordering::Relaxed);
    Ok(())
}

pub fn stop(state: &AudioState) -> Result<(), String> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| "audio monitor state lock poisoned".to_string())?;
    engine.monitor = None;
    Ok(())
}

fn safe_level(level: f32) -> f32 {
    if level.is_finite() {
        level.clamp(0.0, MAX_MONITOR_LEVEL)
    } else {
        DEFAULT_MONITOR_LEVEL
    }
}

fn compatible_configs(
    input: &cpal::Device,
    output: &cpal::Device,
) -> Result<(SupportedStreamConfig, SupportedStreamConfig), String> {
    let inputs: Vec<_> = input
        .supported_input_configs()
        .map_err(|error| format!("could not read input formats: {error}"))?
        .filter(supported_sample_format)
        .collect();
    let outputs: Vec<_> = output
        .supported_output_configs()
        .map_err(|error| format!("could not read output formats: {error}"))?
        .filter(supported_sample_format)
        .collect();

    for rate in PREFERRED_SAMPLE_RATES {
        if let Some(pair) = config_pair_at_rate(&inputs, &outputs, rate) {
            return Ok(pair);
        }
    }

    for input_range in &inputs {
        for output_range in &outputs {
            let minimum = input_range
                .min_sample_rate()
                .max(output_range.min_sample_rate());
            let maximum = input_range
                .max_sample_rate()
                .min(output_range.max_sample_rate());
            if minimum <= maximum {
                return Ok((
                    input_range.with_sample_rate(maximum),
                    output_range.with_sample_rate(maximum),
                ));
            }
        }
    }
    Err("the selected input and output do not share a supported sample rate".into())
}

fn config_pair_at_rate(
    inputs: &[SupportedStreamConfigRange],
    outputs: &[SupportedStreamConfigRange],
    rate: u32,
) -> Option<(SupportedStreamConfig, SupportedStreamConfig)> {
    let sample_rate = rate;
    let input = preferred_range(inputs, sample_rate)?;
    let output = preferred_range(outputs, sample_rate)?;
    Some((
        input.clone().with_sample_rate(sample_rate),
        output.clone().with_sample_rate(sample_rate),
    ))
}

fn preferred_range(
    ranges: &[SupportedStreamConfigRange],
    rate: SampleRate,
) -> Option<&SupportedStreamConfigRange> {
    ranges
        .iter()
        .filter(|range| range.min_sample_rate() <= rate && rate <= range.max_sample_rate())
        .max_by_key(|range| {
            let format_score = match range.sample_format() {
                SampleFormat::F32 => 3,
                SampleFormat::I16 => 2,
                SampleFormat::U16 => 1,
                _ => 0,
            };
            let channel_score = if range.channels() == 2 {
                3
            } else if range.channels() == 1 {
                2
            } else {
                1
            };
            (format_score, channel_score)
        })
}

fn supported_sample_format(range: &SupportedStreamConfigRange) -> bool {
    matches!(
        range.sample_format(),
        SampleFormat::F32 | SampleFormat::I16 | SampleFormat::U16
    )
}

fn build_input(
    device: &cpal::Device,
    config: &SupportedStreamConfig,
    producer: Producer<f32>,
) -> Result<Stream, String> {
    let stream_config: StreamConfig = config.clone().into();
    match config.sample_format() {
        SampleFormat::F32 => build_input_typed::<f32>(device, &stream_config, producer),
        SampleFormat::I16 => build_input_typed::<i16>(device, &stream_config, producer),
        SampleFormat::U16 => build_input_typed::<u16>(device, &stream_config, producer),
        format => Err(format!("unsupported input sample format: {format}")),
    }
}

fn build_input_typed<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    mut producer: Producer<f32>,
) -> Result<Stream, String>
where
    T: SizedSample + Copy,
    f32: FromSample<T>,
{
    device
        .build_input_stream(
            *config,
            move |data: &[T], _| {
                for sample in data {
                    if producer.push(f32::from_sample(*sample)).is_err() {
                        break;
                    }
                }
            },
            |error| eprintln!("Signal Rack audio input error: {error}"),
            None,
        )
        .map_err(|error| format!("could not open audio input: {error}"))
}

fn build_output(
    device: &cpal::Device,
    config: &SupportedStreamConfig,
    input_channels: usize,
    output_channels: usize,
    consumer: Consumer<f32>,
    level: Arc<AtomicU32>,
) -> Result<Stream, String> {
    let stream_config: StreamConfig = config.clone().into();
    match config.sample_format() {
        SampleFormat::F32 => build_output_typed::<f32>(
            device,
            &stream_config,
            input_channels,
            output_channels,
            consumer,
            level,
        ),
        SampleFormat::I16 => build_output_typed::<i16>(
            device,
            &stream_config,
            input_channels,
            output_channels,
            consumer,
            level,
        ),
        SampleFormat::U16 => build_output_typed::<u16>(
            device,
            &stream_config,
            input_channels,
            output_channels,
            consumer,
            level,
        ),
        format => Err(format!("unsupported output sample format: {format}")),
    }
}

fn build_output_typed<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    input_channels: usize,
    output_channels: usize,
    mut consumer: Consumer<f32>,
    level: Arc<AtomicU32>,
) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    device
        .build_output_stream(
            *config,
            move |data: &mut [T], _| {
                let gain = f32::from_bits(level.load(Ordering::Relaxed));
                let mut frame = [0.0_f32; 64];
                let stored_channels = input_channels.min(frame.len());
                for output_frame in data.chunks_mut(output_channels) {
                    let mut complete = true;
                    for channel in 0..input_channels {
                        match consumer.pop() {
                            Ok(sample) if channel < stored_channels => frame[channel] = sample,
                            Ok(_) => {}
                            Err(_) => complete = false,
                        }
                    }
                    for (channel, sample) in output_frame.iter_mut().enumerate() {
                        let source = if complete && stored_channels > 0 {
                            frame[if stored_channels == 1 {
                                0
                            } else {
                                channel % stored_channels
                            }]
                        } else {
                            0.0
                        };
                        *sample = T::from_sample((source * gain).clamp(-1.0, 1.0));
                    }
                }
            },
            |error| eprintln!("Signal Rack audio output error: {error}"),
            None,
        )
        .map_err(|error| format!("could not open audio output: {error}"))
}

#[cfg(test)]
mod tests {
    use super::safe_level;

    #[test]
    fn monitor_level_is_bounded_and_finite() {
        assert_eq!(safe_level(-1.0), 0.0);
        assert_eq!(safe_level(0.75), 0.75);
        assert_eq!(safe_level(2.0), 2.0);
        assert_eq!(safe_level(8.0), 4.0);
        assert_eq!(safe_level(f32::NAN), 1.5);
    }
}
