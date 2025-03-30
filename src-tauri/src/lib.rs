use tauri::{Manager, Window};
// Create the command:
// This command must be async so that it doesn't run on the main thread.
#[tauri::command]
async fn close_splashscreen(window: Window) {
    // Close splashscreen
    match window.get_webview_window("splashscreen") {
        Some(splashscreen) => {
            splashscreen.close().unwrap();
            // Show main window
            window.get_webview_window("main").expect("no window labeled 'main' found").show().unwrap();
        },
        None => ()
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![close_splashscreen])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
