use tauri::{Manager, State, Window};
use tokio::sync::mpsc;

#[cfg(not(debug_assertions))]
use tauri::Emitter;
#[cfg(not(debug_assertions))]
use tauri_plugin_updater::UpdaterExt;

mod quic;
use quic::{start_quic_client, QuicCommand};

mod types;
use types::FrontendState;

struct QuicState {
    tx: mpsc::Sender<QuicCommand>,
}

#[tauri::command]
async fn close_splashscreen(window: Window) {
    if let Some(splashscreen) = window.get_webview_window("splashscreen") {
        splashscreen.close().unwrap();
        window
            .get_webview_window("main")
            .expect("no main window")
            .show()
            .unwrap();
    }
}

#[tauri::command]
fn send_mouse_position(x: f32, y: f32, name: Option<String>, state: State<QuicState>) {
    // try_send is non-blocking.
    if let Err(e) = state.tx.try_send(QuicCommand::SendMousePos {
        x,
        y,
        name: name.unwrap_or_default(),
    }) {
        match e {
            mpsc::error::TrySendError::Full(_) => {
                // Ignore full channel for mouse movement (dropping frames is fine)
                // println!("Dropped mouse packet (channel full)");
            }
            mpsc::error::TrySendError::Closed(_) => {
                eprintln!("CRITICAL: QUIC Channel Closed. Client might have crashed.");
            }
        }
    }
}

#[tauri::command]
fn send_marker_position(x: f32, y: f32, marker_name: String, state: State<QuicState>) {
    // For markers, we prefer blocking send or logging error because this is important data
    if let Err(e) = state.tx.try_send(QuicCommand::SendMarkerPos {
        x,
        y,
        name: marker_name,
    }) {
        eprintln!("Failed to send marker: {:?}", e);
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

#[cfg(not(debug_assertions))]
async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        app.emit("update-started", None::<bool>).unwrap();
        update.download_and_install(|_, _| {}, || {}).await?;
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
                    let _ = update(handle).await;
                });
            }

            let app_handle = app.handle().clone();

            // Increased channel size to 500 to prevent 'Channel Full' on rapid mouse moves
            let (tx, rx) = mpsc::channel(500);

            app.manage(QuicState { tx });
            app.manage(FrontendState {
                ready: std::sync::Mutex::new(false),
            });

            // Resolves the server itself, so the app also starts while offline
            start_quic_client(app_handle, rx, "thiswillgetchangedinthefuture".into());

            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_drpc::init())
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
