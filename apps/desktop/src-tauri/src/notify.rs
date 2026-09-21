//! Native desktop notifications with click-to-open support.
//!
//! The `tauri-plugin-notification` desktop backend just calls `notify_rust`'s
//! `show()` and drops both the click activation and any `extra` payload, so its
//! JS `onAction` listener never fires off mobile. We therefore send message
//! toasts from here: on Windows via `tauri-winrt-notification`, whose
//! `on_activated` callback lets us re-focus the app and emit the clicked room
//! back to the frontend.

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Runtime};

/// Emitted to the frontend when the user clicks a message notification. The
/// payload is the room id captured when the toast was shown (may be `None`).
pub const NOTIFICATION_CLICK_EVENT: &str = "notification-click";

/// Absolute path to the app icon, written out once to a temp file.
///
/// Windows toasts (and libnotify on Linux) need a real `file://` path for a
/// notification icon — they can't reference bytes embedded in the binary, and
/// we don't ship an MSIX package (`ms-appx://`) that would let us reference a
/// bundled resource by URI. So the icon is embedded at compile time and
/// dropped into the temp dir the first time a notification is shown.
#[cfg(any(windows, target_os = "linux"))]
fn notification_icon_path() -> Option<&'static PathBuf> {
    static ICON_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
    ICON_PATH
        .get_or_init(|| {
            let bytes = include_bytes!("../icons/128x128.png");
            let path = std::env::temp_dir().join("officechat-notification-icon.png");
            if !path.exists() {
                if let Err(err) = std::fs::write(&path, bytes) {
                    eprintln!("[notify] failed to write notification icon: {err}");
                    return None;
                }
            }
            Some(path)
        })
        .as_ref()
}

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
        use tauri_winrt_notification::{Duration, IconCrop, Sound, Toast};

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
        let mut toast = Toast::new(&app_id)
            .title(&title)
            .text1(&body)
            .duration(Duration::Short)
            .sound(toast_sound);

        // Show the app logo in the toast body — without it Windows renders a
        // bare two-line text toast, which reads as small/generic.
        if let Some(icon_path) = notification_icon_path() {
            toast = toast.icon(icon_path, IconCrop::Circular, "OfficeChat");
        }

        let result = toast
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

        let mut notification = Notification::new();
        notification
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
            .action("default", "Open");
        if let Some(icon_path) = notification_icon_path() {
            notification.icon(&icon_path.to_string_lossy());
        }
        let result = notification.show();

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
