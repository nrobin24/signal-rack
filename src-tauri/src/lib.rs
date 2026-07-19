mod audio;
pub mod engine;
mod generator;
mod lfo;
mod model;

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State, WindowEvent};

use engine::{EngineState, EngineStatus};
use model::{GeneratedSeed, RackTarget, SeedSettings, SequencerConfig, TrackId};

#[tauri::command]
fn list_outputs() -> Result<Vec<String>, String> {
    engine::midi_port_names()
}

#[tauri::command]
fn list_audio_devices() -> Result<audio::AudioDevices, String> {
    audio::devices()
}

#[tauri::command]
fn get_audio_monitor_status(
    state: State<'_, audio::AudioState>,
) -> Result<audio::AudioMonitorStatus, String> {
    audio::status(&state)
}

#[tauri::command]
fn start_audio_monitor(
    state: State<'_, audio::AudioState>,
    input_index: usize,
    output_index: usize,
    level: f32,
) -> Result<(), String> {
    audio::start(&state, input_index, output_index, level)
}

#[tauri::command]
fn set_audio_monitor_level(state: State<'_, audio::AudioState>, level: f32) -> Result<(), String> {
    audio::set_level(&state, level)
}

#[tauri::command]
fn stop_audio_monitor(state: State<'_, audio::AudioState>) -> Result<(), String> {
    audio::stop(&state)
}

#[tauri::command]
fn get_status(state: State<'_, EngineState>) -> Result<EngineStatus, String> {
    engine::status(&state)
}

#[tauri::command]
fn select_output(
    state: State<'_, EngineState>,
    target: RackTarget,
    port: Option<usize>,
) -> Result<(), String> {
    engine::select_output(&state, target, port)
}

#[tauri::command]
fn configure(state: State<'_, EngineState>, config: SequencerConfig) -> Result<(), String> {
    engine::configure(&state, config)
}

#[tauri::command]
fn set_macros(
    state: State<'_, EngineState>,
    track_id: TrackId,
    tone: f64,
    space: f64,
) -> Result<(), String> {
    engine::set_macros(&state, track_id, tone, space)
}

#[tauri::command]
fn start_transport(state: State<'_, EngineState>, app: AppHandle) -> Result<(), String> {
    engine::start(&state, app)
}

#[tauri::command]
fn stop_transport(state: State<'_, EngineState>, app: AppHandle) -> Result<(), String> {
    engine::stop(&state, &app)
}

#[tauri::command]
fn generate_seed(settings: SeedSettings, variation: u32) -> GeneratedSeed {
    generator::generate_seed(&settings, variation)
}

#[tauri::command]
fn save_lab_session(path: String, contents: String) -> Result<String, String> {
    let path = normalized_json_path(&path)?;
    fs::write(&path, contents)
        .map_err(|error| format!("could not save Generator Lab session: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn normalized_json_path(path: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(path);
    if path.file_name().is_none() {
        return Err("choose a filename for the Generator Lab session".into());
    }
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        path.set_extension("json");
    }
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(EngineState::default())
        .manage(audio::AudioState::default())
        .invoke_handler(tauri::generate_handler![
            list_outputs,
            list_audio_devices,
            get_audio_monitor_status,
            start_audio_monitor,
            set_audio_monitor_level,
            stop_audio_monitor,
            get_status,
            select_output,
            configure,
            set_macros,
            start_transport,
            stop_transport,
            generate_seed,
            save_lab_session
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let state = window.state::<EngineState>();
                let _ = engine::stop(&state, &window.app_handle());
                let audio_state = window.state::<audio::AudioState>();
                let _ = audio::stop(&audio_state);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Signal Rack");
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::normalized_json_path;

    #[test]
    fn lab_session_exports_always_use_json_files() {
        assert_eq!(
            normalized_json_path("/tmp/generator-lab-2026-07-16").unwrap(),
            PathBuf::from("/tmp/generator-lab-2026-07-16.json")
        );
        assert_eq!(
            normalized_json_path("/tmp/session.JSON").unwrap(),
            PathBuf::from("/tmp/session.JSON")
        );
        assert!(normalized_json_path("").is_err());
    }
}
