pub mod engine;
mod generator;
mod lfo;
mod model;

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
            generate_seed
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
