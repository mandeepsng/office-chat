mod notify;
mod tray;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};

/// Toggle the main window: hide it if it's visible and focused, otherwise bring
/// it forward (unminimize + show + focus). Used by the global hotkey.
#[cfg(desktop)]
fn toggle_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Single-instance must be registered before any other plugin so a second
    // launch is intercepted immediately: instead of spawning a duplicate window
    // (and a second WebSocket connection), we surface the existing one.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init());

    // System-wide hotkey (Ctrl+Shift+O, Cmd+Shift+O on macOS) that toggles the
    // window from anywhere. Defined here so both the plugin handler and setup
    // (which registers it) can see it.
    #[cfg(desktop)]
    let toggle_shortcut = {
        use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
        #[cfg(target_os = "macos")]
        let mods = Modifiers::SUPER | Modifiers::SHIFT;
        #[cfg(not(target_os = "macos"))]
        let mods = Modifiers::CONTROL | Modifiers::SHIFT;
        Shortcut::new(Some(mods), Code::KeyO)
    };

    // Self-update, autostart, global shortcut, and window-state are desktop-only.
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::MacosLauncher;
        use tauri_plugin_global_shortcut::ShortcutState;
        use tauri_plugin_window_state::StateFlags;

        let shortcut = toggle_shortcut.clone();
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
            ))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, triggered, event| {
                        if event.state() == ShortcutState::Pressed && triggered == &shortcut {
                            toggle_main_window(app);
                        }
                    })
                    .build(),
            )
            // Persist size/position/maximized/fullscreen, but NOT visibility —
            // otherwise the close-to-tray hide would make the next launch start
            // hidden.
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        StateFlags::SIZE
                            | StateFlags::POSITION
                            | StateFlags::MAXIMIZED
                            | StateFlags::FULLSCREEN,
                    )
                    .build(),
            );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            notify::show_notification,
            tray::set_unread,
            tray::flash_window
        ])
        .setup(move |app| {
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
            let dnd = MenuItem::with_id(
                app,
                "dnd",
                "Toggle Do Not Disturb",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&version, &show, &dnd, &quit])?;

            TrayIconBuilder::with_id(tray::TRAY_ID)
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
                    "dnd" => {
                        // The frontend owns the DND state; just ask it to flip.
                        let _ = app.emit("toggle-dnd", ());
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

            // Activate the global toggle hotkey now that the app is running.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                if let Err(err) = app.global_shortcut().register(toggle_shortcut) {
                    eprintln!("[shortcut] failed to register toggle hotkey: {err}");
                }
            }

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
