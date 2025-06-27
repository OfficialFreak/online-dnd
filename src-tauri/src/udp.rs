use serde::Serialize;
use std::net::UdpSocket;
use std::{sync::Arc, thread, time::Duration};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct Coordinates {
    x: f32,
    y: f32,
}

#[derive(Clone, Serialize)]
struct MarkerCoordinates {
    x: f32,
    y: f32,
    marker_name: String
}

#[repr(u8)]
enum UdpMessageType {
    Heartbeat,
    MousePosition,
    MarkerPosition,
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
                    Ok((bytes_received, _src_addr)) => {
                        match &buf[0] {
                            x if *x == UdpMessageType::Heartbeat as u8 && bytes_received == 1 => {
                                println!("Received a heartbeat for some reason???");
                            }
                            x if *x == UdpMessageType::MousePosition as u8 && bytes_received == 9 => {
                                // Bytes 1..9 are x and y
                                let x = f32::from_le_bytes(
                                    buf[1..5].try_into().unwrap(),
                                );
                                let y = f32::from_le_bytes(
                                    buf[5..9].try_into().unwrap(),
                                );
                                app.emit("mouse-position", Coordinates { x, y })
                                    .unwrap_or_else(|e| {
                                        eprintln!("Emit error: {}", e);
                                    });
                            }
                            x if *x == UdpMessageType::MarkerPosition as u8 => {
                                // Bytes 1..9 are x and y, bytes 10..bytes_received are the marker name
                                let x = f32::from_le_bytes(
                                    buf[1..5].try_into().expect("Couldn't convert x coordinate"),
                                );
                                let y = f32::from_le_bytes(
                                    buf[5..9].try_into().expect("Couldn't convert y coordinate"),
                                );
                                let marker_name = String::from_utf8(buf[9..bytes_received].to_vec()).expect("Couldn't convert marker_name");
                                app.emit("marker-position", MarkerCoordinates { x, y, marker_name })
                                    .unwrap_or_else(|e| {
                                        eprintln!("Emit error: {}", e);
                                    });
                            }
                            _ => {
                                let msg = String::from_utf8_lossy(&buf[..bytes_received]).to_string();
                                println!("Unbekannte Nachricht empfangen: {msg}");
                            }
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
                if let Err(e) = socket.send_to(&[0x00u8], target) {
                    eprintln!("Heartbeat send error: {}", e);
                } else {
                    // println!("Heartbeat sent from {}", socket.local_addr().unwrap());
                }
                thread::sleep(Duration::from_secs(5));
            }
        });
    }
}
