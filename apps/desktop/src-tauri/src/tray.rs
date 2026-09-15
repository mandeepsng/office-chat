//! Taskbar / tray awareness: unread badge and attention flashing.
//!
//! The frontend counts unread messages and pushes the total here; we mirror it
//! onto the OS so the user notices activity without the window open.

use tauri::{AppHandle, Manager, Runtime, UserAttentionType};

/// Id assigned to the system tray so commands can look it up to update its tooltip.
pub const TRAY_ID: &str = "main-tray";

/// Update the unread indicator across the tray tooltip and the OS taskbar.
///
/// - Tray tooltip always reflects the count (all platforms).
/// - **Windows:** a red overlay dot on the taskbar icon (a numbered overlay is
///   a future enhancement; the badge-count API is unsupported on Windows).
/// - **macOS / Linux:** the native dock / taskbar badge count.
#[tauri::command]
pub fn set_unread<R: Runtime>(app: AppHandle<R>, count: u32) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tooltip = if count == 0 {
            "OfficeChat".to_string()
        } else {
            format!("OfficeChat — {count} unread")
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }

    if let Some(window) = app.get_webview_window("main") {
        #[cfg(windows)]
        {
            let _ = window.set_overlay_icon(if count == 0 {
                None
            } else {
                Some(unread_overlay())
            });
        }
        #[cfg(not(windows))]
        {
            let _ = window.set_badge_count(if count == 0 { None } else { Some(count as i64) });
        }
    }
}

/// Flash the taskbar button / bounce the dock to draw attention to a message
/// that arrived while the window was not focused. The OS clears it on focus.
#[tauri::command]
pub fn flash_window<R: Runtime>(app: AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    }
}

/// A 32×32 red dot used as the Windows taskbar overlay to signal unread messages.
#[cfg(windows)]
fn unread_overlay() -> tauri::image::Image<'static> {
    const SIZE: u32 = 32;
    let radius = SIZE as f32 / 2.0;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 + 0.5 - radius;
            let dy = y as f32 + 0.5 - radius;
            let dist = (dx * dx + dy * dy).sqrt();
            // Soft 1px edge so the dot isn't harshly aliased.
            let alpha = ((radius - dist).clamp(0.0, 1.0) * 255.0) as u8;
            if alpha > 0 {
                let i = ((y * SIZE + x) * 4) as usize;
                rgba[i] = 0xE5; // R
                rgba[i + 1] = 0x3E; // G
                rgba[i + 2] = 0x3E; // B
                rgba[i + 3] = alpha; // A
            }
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}
