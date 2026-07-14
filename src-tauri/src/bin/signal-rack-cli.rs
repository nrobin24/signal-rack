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
        _ => {
            eprintln!("Usage: signal-rack-cli ports");
            std::process::exit(2);
        }
    }
}
