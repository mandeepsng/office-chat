//! Native desktop notifications with click-to-open support.
//!
//! The `tauri-plugin-notification` desktop backend just calls `notify_rust`'s
//! `show()` and drops both the click activation and any `extra` payload, so its
//! JS `onAction` listener never fires off mobile. We therefore send message
//! toasts from here: on Windows via `tauri-winrt-notification`, whose
//! `on_activated` callback lets us re-focus the app and emit the clicked room
//! back to the frontend.

use tauri::{AppHandle, Emitter, Runtime};

/// Emitted to the frontend when the user clicks a message notification. The
/// payload is the room id captured when the toast was shown (may be `None`).
pub const NOTIFICATION_CLICK_EVENT: &str = "notification-click";

/// Show a message notification. On Windows the toast carries a click handler
/// that emits [`NOTIFICATION_CLICK_EVENT`]; other platforms show a best-effort
/// toast without click routing.
#[tauri::command]
pub fn show_notification<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    body: String,
    room_id: Option<String>,
    sound: Option<String>,
) {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Duration, Sound, Toast};

        // Map the user's toast-sound preference; "Silent" (or None) plays nothing.
        let toast_sound = match sound.as_deref() {
            Some("Silent") => None,
            Some("Default") => Some(Sound::Default),
            Some("Mail") => Some(Sound::Mail),
            _ => Some(Sound::IM),
        };

        // In dev the app runs unpackaged, so it has no registered
        // AppUserModelID and Windows silently discards the toast unless we
        // attribute it to PowerShell's well-known AUMID. Installed builds use
        // our own identifier, which the installer registers.
        let app_id = if tauri::is_dev() {
            Toast::POWERSHELL_APP_ID.to_string()
        } else {
            app.config().identifier.clone()
        };

        let handle = app.clone();
        let room = room_id.clone();
        let result = Toast::new(&app_id)
            .title(&title)
            .text1(&body)
            .duration(Duration::Short)
            .sound(toast_sound)
            .on_activated(move |_action| {
                // A plain body click carries no activation argument, so we
                // forward the room captured when the toast was created.
                let _ = handle.emit(NOTIFICATION_CLICK_EVENT, room.clone());
                Ok(())
            })
            .show();

        if let Err(err) = result {
            eprintln!("[notify] failed to show toast: {err}");
        }
    }

    #[cfg(target_os = "linux")]
    {
        use notify_rust::{Notification, Timeout};
        // Linux uses the freedesktop sound theme rather than our Windows enum.
        let _ = &sound;

        let result = Notification::new()
            .summary(&title)
            .body(&body)
            .appname("OfficeChat")
            // Freedesktop IM sound; plays on desktops shipping the sound theme.
            .sound_name("message-new-instant")
            // The default daemon timeout is very short — keep it up longer so it
            // isn't missed and there's time to click it. (GNOME still routes
            // normal notifications to its tray after a few seconds.)
            .timeout(Timeout::Milliseconds(12_000))
            // "default" is the action fired when the notification body is clicked.
            .action("default", "Open")
            .show();

        match result {
            Ok(handle) => {
                let app_handle = app.clone();
                let room = room_id.clone();
                // wait_for_action blocks until the notification is clicked or
                // closed, so run it off-thread and forward clicks to the app.
                std::thread::spawn(move || {
                    handle.wait_for_action(|action| {
                        if action == "default" {
                            let _ = app_handle.emit(NOTIFICATION_CLICK_EVENT, room);
                        }
                    });
                });
            }
            Err(err) => eprintln!("[notify] failed to show notification: {err}"),
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Click-to-open isn't wired on macOS yet; show a plain toast.
        let _ = (&app, &room_id, &sound);
        if let Err(err) = notify_rust::Notification::new()
            .summary(&title)
            .body(&body)
            .show()
        {
            eprintln!("[notify] failed to show notification: {err}");
        }
    }
}
