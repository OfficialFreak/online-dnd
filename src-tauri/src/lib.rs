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

/// The newer version the updater offers, if any. Looked for again while the app runs, it
/// only looked when it started: an app left open missed the updates of a day.
#[tauri::command]
async fn update_version(app: tauri::AppHandle) -> Option<String> {
    #[cfg(not(debug_assertions))]
    {
        let updater = app.updater().ok()?;
        updater.check().await.ok().flatten().map(|update| update.version)
    }
    #[cfg(debug_assertions)]
    {
        let _ = app;
        None
    }
}

/// Installs the newer version and starts the app anew
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    update(app).await.map_err(|error| error.to_string())?;
    #[cfg(debug_assertions)]
    let _ = app;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The page looks for updates itself and shows them over the map, see
            // updates.svelte.ts. Only if it doesn't come up, the app updates here.
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    for _ in 0..30 {
                        if let Some(state) = handle.try_state::<FrontendState>() {
                            if *state.ready.lock().unwrap() {
                                return;
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                    let _ = tauri::async_runtime::block_on(update(handle));
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
            is_dev,
            update_version,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
