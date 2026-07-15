fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("ports") => match signal_rack_lib::engine::midi_port_names() {
            Ok(ports) if ports.is_empty() => println!("No MIDI output ports found."),
            Ok(ports) => {
                for (index, name) in ports.iter().enumerate() {
                    println!("{index}: {name}");
                }
            }
            Err(error) => {
                eprintln!("Could not scan MIDI outputs: {error}");
                std::process::exit(1);
            }
        },
        Some("clock-bench") => {
            let bpm = std::env::args()
                .nth(2)
                .and_then(|value| value.parse().ok())
                .unwrap_or(132.0);
            let seconds = std::env::args()
                .nth(3)
                .and_then(|value| value.parse().ok())
                .unwrap_or(4.0);
            let result = signal_rack_lib::engine::probe_clock(bpm, seconds);
            println!("Clock probe: {} pulses", result.pulses);
            println!("Requested: {:.3} BPM", result.requested_bpm);
            println!("Measured:  {:.3} BPM", result.measured_bpm);
            println!(
                "Wake lateness: mean {:.1} µs, max {} µs",
                result.mean_lateness_micros, result.max_lateness_micros
            );
        }
        _ => {
            eprintln!("Usage: signal-rack-cli ports | clock-bench [bpm] [seconds]");
            std::process::exit(2);
        }
    }
}
