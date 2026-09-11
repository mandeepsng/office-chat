use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init());

    // Self-update and autostart are desktop-only.
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::MacosLauncher;
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            // Registers OfficeChat to launch at login on Windows (registry),
            // macOS (LaunchAgent), and Linux (XDG autostart .desktop). The
            // `--autostart` flag lets us detect a boot launch and start hidden
            // in the tray instead of popping a window on the user's screen.
            .plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ));
    }

    builder
        .setup(|app| {
            // System tray with a minimal Version / Show / Quit menu.
            // The version row is disabled so it reads as an info label, not a
            // clickable action.
            let version = MenuItem::with_id(
                app,
                "version",
                format!("Version: {}", app.package_info().version),
                false,
                None::<&str>,
            )?;
            let show = MenuItem::with_id(app, "show", "Show OfficeChat", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&version, &show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("OfficeChat")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        // Confirm before actually exiting so an accidental
                        // click doesn't kill the background/notification
                        // process. Uses the async callback form to avoid
                        // blocking the menu-event thread.
                        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
                        let app_handle = app.clone();
                        app.dialog()
                            .message("Are you sure you want to quit OfficeChat?")
                            .title("Quit OfficeChat")
                            .kind(MessageDialogKind::Warning)
                            .buttons(MessageDialogButtons::OkCancelCustom(
                                "Quit".into(),
                                "Cancel".into(),
                            ))
                            .show(move |confirmed| {
                                if confirmed {
                                    app_handle.exit(0);
                                }
                            });
                    }
                    _ => {}
                })
                .build(app)?;

            // When launched at system startup (via the autostart flag), stay
            // in the tray so the app boots quietly in the background and keeps
            // receiving notifications without stealing focus.
            if std::env::args().any(|arg| arg == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window minimizes to tray instead of exiting, so
            // notifications keep working in the background.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OfficeChat");
}
