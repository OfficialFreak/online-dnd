use std::net::UdpSocket;
use std::{sync::Arc, sync::Mutex};
#[cfg(not(debug_assertions))]
use tauri::Emitter;
use tauri::{Manager, State, Window};
#[cfg(not(debug_assertions))]
use tauri_plugin_updater::UpdaterExt;

mod udp;
use udp::*;

// UDP Socket State
struct UdpState {
    socket: Mutex<Arc<UdpSocket>>,
}

// Create the command:
// This command must be async so that it doesn't run on the main thread.
#[tauri::command]
async fn close_splashscreen(window: Window) {
    // Close splashscreen
    match window.get_webview_window("splashscreen") {
        Some(splashscreen) => {
            splashscreen.close().unwrap();
            // Show main window
            window
                .get_webview_window("main")
                .expect("no window labeled 'main' found")
                .show()
                .unwrap();
        }
        None => (),
    };
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
            Ok(_) => {},
            Err(e) => eprintln!("Failed to send UDP packet: {}", e),
        }
    }
}

#[cfg(not(debug_assertions))]
async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        app.emit("update-started", None::<bool>).unwrap();
        let mut downloaded = 0;

        update
            .download_and_install(
                |chunk_length, content_length| {
                    downloaded += chunk_length;
                    println!("downloaded {downloaded} from {content_length:?}");
                },
                || {
                    println!("download finished");
                },
            )
            .await?;

        println!("update installed");
        app.restart();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    update(handle).await.unwrap();
                });
            }

            #[cfg(debug_assertions)]
            let _ = app;
            let app_handle = app.handle().clone();

            let socket = UdpSocket::bind("[::]:0").expect("Could not bind to random UDP port");
            let socket = Arc::new(socket);

            app.manage(UdpState {
                socket: Mutex::new(Arc::clone(&socket)),
            });

            start_udp(app_handle, Arc::clone(&socket));

            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            send_mouse_position,
            send_marker_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
