use serde::Serialize;
use std::net::UdpSocket;
use std::{sync::Arc, thread, time::Duration};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy, Serialize)]
struct Coordinates {
    x: f32,
    y: f32,
}

pub fn start_udp(app: AppHandle, socket: Arc<UdpSocket>) {
    let local_addr = socket.local_addr().expect("Failed to get local address");
    println!("UDP socket bound to {}", local_addr);

    // Start Listener-Thread
    {
        let socket = Arc::clone(&socket);
        let app = app.clone();
        thread::spawn(move || {
            let mut buf = [0; 1024];
            loop {
                match socket.recv_from(&mut buf) {
                    Ok((number_of_bytes, _src_addr)) => {
                        if number_of_bytes != 8 {
                            let msg = String::from_utf8_lossy(&buf[..number_of_bytes]).to_string();
                            println!("Unbekannte Nachricht empfangen: {msg}");
                        } else {
                            let x = f32::from_le_bytes(
                                buf[0..4].try_into().expect("Couldn't convert x coordinate"),
                            );
                            let y = f32::from_le_bytes(
                                buf[4..8].try_into().expect("Couldn't convert y coordinate"),
                            );
                            app.emit("mouse-position", Coordinates { x, y })
                                .unwrap_or_else(|e| {
                                    eprintln!("Emit error: {}", e);
                                });
                        }
                    }
                    Err(e) => {
                        eprintln!("UDP receive error: {}", e);
                    }
                }
            }
        });
    }

    // Start Heartbeat-Thread
    {
        let socket = Arc::clone(&socket);
        thread::spawn(move || {
            let target = "wiegraebe.dev:41340";
            loop {
                let heartbeat_msg = b"heartbeat";
                if let Err(e) = socket.send_to(heartbeat_msg, target) {
                    eprintln!("Heartbeat send error: {}", e);
                } else {
                    println!("Heartbeat sent from {}", socket.local_addr().unwrap());
                }
                thread::sleep(Duration::from_secs(5));
            }
        });
    }
}
