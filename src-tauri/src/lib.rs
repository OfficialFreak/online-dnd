use std::net::UdpSocket;
use std::{sync::Arc, sync::Mutex};
use tauri::{Manager, State};

mod udp;
use udp::*;

mod types;
use types::FrontendState;

// UDP Socket State
struct UdpState {
    socket: Mutex<Arc<UdpSocket>>,
}

// Create the command:
// This command must be async so that it doesn't run on the main thread.
#[tauri::command]
async fn close_splashscreen() {
    // Do nothing as splashscreen doesn't exist on mobile
}

#[tauri::command]
fn send_mouse_position(x: f32, y: f32, udp_state: State<UdpState>) {
    // UDP Sending Logic
    let mut data = Vec::with_capacity(9);
    data.extend_from_slice(&[0x01u8]);
    data.extend_from_slice(&x.to_le_bytes());
    data.extend_from_slice(&y.to_le_bytes());

    // Send via UDP
    if let Ok(socket) = udp_state.socket.lock() {
        match socket.send_to(&data, "wiegraebe.dev:41340") {
            Ok(_) => {}
            Err(e) => eprintln!("Failed to send UDP packet: {}", e),
        }
    }
}

#[tauri::command]
fn send_marker_position(x: f32, y: f32, marker_name: String, udp_state: State<UdpState>) {
    // UDP Sending Logic
    let mut data = Vec::with_capacity(9);
    data.extend_from_slice(&[0x02u8]);
    data.extend_from_slice(&x.to_le_bytes());
    data.extend_from_slice(&y.to_le_bytes());
    data.extend_from_slice(&marker_name.as_bytes());

    // Send via UDP
    if let Ok(socket) = udp_state.socket.lock() {
        match socket.send_to(&data, "wiegraebe.dev:41340") {
            Ok(_) => {}
            Err(e) => eprintln!("Failed to send UDP packet: {}", e),
        }
    }
}

#[tauri::command]
fn frontend_ready(state: State<FrontendState>) {
    *state.ready.lock().unwrap() = true;
}

#[tauri::command]
fn is_dev() -> bool {
    #[cfg(debug_assertions)]
    return true;
    #[cfg(not(debug_assertions))]
    return false;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = app;
            let app_handle = app.handle().clone();

            let socket = {
                let mut tmp_socket =
                    UdpSocket::bind("[::]:0").expect("Could not bind to random UDP port (IPv6)");
                if !tmp_socket.send_to(b"\x00", "[ff02::1]:12345").is_ok() {
                    println!("IPv6 failed, falling back to IPv4 socket");
                    tmp_socket = UdpSocket::bind("0.0.0.0:0")
                        .expect("Could not bind to random UDP port (IPv4)")
                }
                tmp_socket
            };

            let socket = Arc::new(socket);

            app.manage(UdpState {
                socket: Mutex::new(Arc::clone(&socket)),
            });

            app.manage(FrontendState {
                ready: Mutex::new(false),
            });

            start_udp(app_handle, Arc::clone(&socket));

            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            send_mouse_position,
            send_marker_position,
            frontend_ready,
            is_dev
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
