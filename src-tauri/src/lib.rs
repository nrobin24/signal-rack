pub mod engine;
mod generator;
mod lfo;
mod model;

use std::fs;
use tauri::{AppHandle, Manager, State, WindowEvent};

use engine::{EngineState, EngineStatus};
use model::{GeneratedSeed, RackTarget, SeedSettings, SequencerConfig, TrackId};

#[tauri::command]
fn list_outputs() -> Result<Vec<String>, String> {
    engine::midi_port_names()
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
fn save_lab_session(
    app: AppHandle,
    session_id: String,
    contents: String,
) -> Result<String, String> {
    let safe_id = sanitize_session_id(&session_id)?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not locate app data directory: {error}"))?
        .join("generator-lab")
        .join("sessions");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create Generator Lab session directory: {error}"))?;
    let path = directory.join(format!("{safe_id}.json"));
    fs::write(&path, contents)
        .map_err(|error| format!("could not save Generator Lab session: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn sanitize_session_id(session_id: &str) -> Result<String, String> {
    if session_id.is_empty()
        || !session_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(
            "session ID may contain only letters, numbers, hyphens, and underscores".into(),
        );
    }
    Ok(session_id.to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![
            list_outputs,
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
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Signal Rack");
}

#[cfg(test)]
mod tests {
    use super::sanitize_session_id;

    #[test]
    fn lab_session_ids_cannot_escape_the_session_directory() {
        assert_eq!(
            sanitize_session_id("generator-lab-2026-07-16").unwrap(),
            "generator-lab-2026-07-16"
        );
        assert!(sanitize_session_id("../outside").is_err());
        assert!(sanitize_session_id("").is_err());
    }
}
