use serde::Serialize;
use std::net::{SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::mpsc;
use std::{sync::Arc, thread, time::Duration};
use tauri::{AppHandle, Emitter};
use tauri::{Manager, State};

use crate::types::FrontendState;

#[derive(Clone, Serialize)]
struct Coordinates {
    x: f32,
    y: f32,
}

#[derive(Clone, Serialize)]
struct MarkerCoordinates {
    x: f32,
    y: f32,
    marker_name: String,
}

#[repr(u8)]
enum UdpMessageType {
    Heartbeat,
    MousePosition,
    MarkerPosition,
}

fn backend_error(tx: &mpsc::Sender<(String, String)>, msg: String) {
    tx.send(("backend-error".to_string(), msg.to_string()))
        .unwrap_or_else(|e| {
            eprintln!("Channel error: {}", e);
        });
}

fn backend_debug(tx: &mpsc::Sender<(String, String)>, msg: String) {
    tx.send(("backend-debug".to_string(), msg.to_string()))
        .unwrap_or_else(|e| {
            eprintln!("Channel error: {}", e);
        });
}

pub fn start_udp(app: AppHandle, socket: Arc<UdpSocket>) {
    let (tx, rx): (
        mpsc::Sender<(String, String)>,
        mpsc::Receiver<(String, String)>,
    ) = mpsc::channel();

    let local_addr = match socket.local_addr() {
        Ok(addr) => addr,
        Err(e) => {
            backend_error(&tx, e.to_string());
            return;
        }
    };

    match local_addr {
        SocketAddr::V4(_) => backend_debug(&tx, "Using IPv4".to_string()),
        SocketAddr::V6(_) => backend_debug(&tx, "Using IPv6".to_string()),
    }

    backend_debug(&tx, format!("UDP socket bound to {}", local_addr));
    println!("UDP socket bound to {}", local_addr);

    // Start Listener-Thread
    {
        let socket = Arc::clone(&socket);
        let app = app.clone();
        let tx = tx.clone();
        thread::spawn(move || {
            backend_debug(&tx, "UDP Listener Thread started".to_string());
            let mut buf = [0; 1024];
            loop {
                match socket.recv_from(&mut buf) {
                    Ok((bytes_received, _src_addr)) => {
                        match &buf[0] {
                            x if *x == UdpMessageType::Heartbeat as u8 && bytes_received == 1 => {
                                println!("Received a heartbeat for some reason???");
                                backend_debug(
                                    &tx,
                                    "Received a heartbeat for some reason???".to_string(),
                                );
                            }
                            x if *x == UdpMessageType::MousePosition as u8
                                && bytes_received == 9 =>
                            {
                                // Bytes 1..9 are x and y
                                let x = f32::from_le_bytes(buf[1..5].try_into().unwrap());
                                let y = f32::from_le_bytes(buf[5..9].try_into().unwrap());
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
                                let marker_name =
                                    String::from_utf8(buf[9..bytes_received].to_vec())
                                        .expect("Couldn't convert marker_name");
                                app.emit(
                                    "marker-position",
                                    MarkerCoordinates { x, y, marker_name },
                                )
                                .unwrap_or_else(|e| {
                                    eprintln!("Emit error: {}", e);
                                });
                            }
                            _ => {
                                let msg =
                                    String::from_utf8_lossy(&buf[..bytes_received]).to_string();
                                backend_debug(
                                    &tx,
                                    format!("Unbekannte Nachricht empfangen: {}", msg),
                                );
                                println!("Unbekannte Nachricht empfangen: {msg}");
                            }
                        }
                    }
                    Err(e) => {
                        backend_error(&tx, format!("Emit error: {}", e));
                        eprintln!("UDP receive error: {}", e);
                    }
                }
            }
        });
    }

    // Start Heartbeat-Thread
    {
        let socket = Arc::clone(&socket);
        let tx = tx.clone();
        let app = app.clone();
        thread::spawn(move || {
            backend_debug(&tx, "UDP Heartbeat Thread started".to_string());
            let mut target = match "wiegraebe.dev:41340".to_socket_addrs() {
                Ok(socket_addr) => socket_addr,
                Err(e) => {
                    app.emit("backend-error", e.to_string())
                        .unwrap_or_else(|e| {
                            eprintln!("Emit error: {}", e);
                        });
                    return;
                }
            };

            backend_debug(&tx, format!("Resolved domain to: {:?}", target).to_string());

            let target = match local_addr {
                SocketAddr::V4(_) => match target.find(|a| a.is_ipv4()) {
                    Some(ipv4_addr) => Some(ipv4_addr),
                    None => {
                        println!("No Ipv4 Address available");
                        backend_error(&tx, "No IPv4 Address available".to_string());
                        None
                    }
                },
                SocketAddr::V6(_) => match target.find(|a| a.is_ipv6()) {
                    Some(ipv6_addr) => Some(ipv6_addr),
                    None => {
                        println!("No Ipv6 Address available");
                        backend_error(&tx, "No IPv6 Address available".to_string());
                        None
                    }
                },
            };

            if target.is_none() {
                return;
            };
            let target = target.unwrap();

            loop {
                if let Err(e) = socket.send_to(&[0x00u8], target) {
                    backend_error(&tx, format!("Emit Error: {:?}", e).to_string());
                    eprintln!("Heartbeat send error: {}", e);
                } else {
                    // backend_debug(&tx, format!("Sent heartbeat to {target:?}").to_string());
                    // println!("Heartbeat sent from {}", socket.local_addr().unwrap());
                }
                thread::sleep(Duration::from_secs(5));
            }
        });
    }

    {
        let app = app.clone();
        thread::spawn(move || {
            let state: State<FrontendState> = app.state();
            let mut app_ready = false;

            while let Ok((event_name, data)) = rx.recv() {
                while !app_ready && !*state.ready.lock().unwrap() {
                    thread::sleep(Duration::from_secs(1));
                }
                app_ready = true;

                let _ = app.emit(event_name.as_str(), data);
            }
        });
    }
}
