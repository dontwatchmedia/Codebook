//! Native, selectable-text PDF export through an isolated WebView2 print view.
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Manager, WebviewWindow};

const MAX_HTML_BYTES: usize = 128 * 1024 * 1024;
static NEXT_JOB: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct PdfState {
    queue: tauri::async_runtime::Mutex<()>,
    source: Mutex<Option<(String, String, Vec<u8>)>>,
}

pub fn install(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.manage(PdfState::default()).register_uri_scheme_protocol(
        "codebook-print",
        |context, request| {
            let state = context.app_handle().state::<PdfState>();
            let source = state.source.lock().ok();
            let html = source.as_ref().and_then(|source| source.as_ref())
                .filter(|(label, path, _)| context.webview_label() == label && request.uri().path() == path)
                .map(|(_, _, html)| html.clone());
            tauri::http::Response::builder()
                .status(if html.is_some() { 200 } else { 404 })
                .header("Content-Type", "text/html; charset=utf-8")
                .header("Cache-Control", "no-store")
                // Manuscript HTML cannot execute scripts, navigate frames, load
                // local files, or invoke app commands from this print view.
                .header("Content-Security-Policy", "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'")
                .body(html.unwrap_or_default())
                .expect("static PDF protocol response is valid")
        },
    )
}

fn paper_dimensions(paper_size: &str, margin_inches: f64) -> Result<(f64, f64), String> {
    if !margin_inches.is_finite() || !(0.0..=1.5).contains(&margin_inches) {
        return Err("PDF margins must be between 0 and 1.5 inches.".into());
    }
    match paper_size {
        "letter" => Ok((8.5, 11.0)),
        "a4" => Ok((210.0 / 25.4, 297.0 / 25.4)),
        _ => Err("Choose Letter or A4 paper for the PDF.".into()),
    }
}

struct PrintJobCleanup {
    app: tauri::AppHandle,
    label: String,
}
impl Drop for PrintJobCleanup {
    fn drop(&mut self) {
        if let Some(window) = self.app.get_webview_window(&self.label) {
            let _ = window.destroy();
        }
        if let Ok(mut source) = self.app.state::<PdfState>().source.lock() {
            *source = None;
        }
    }
}

#[tauri::command]
pub async fn generate_native_pdf(
    window: WebviewWindow,
    html: String,
    paper_size: String,
    margin_inches: f64,
) -> Result<tauri::ipc::Response, String> {
    if window.label() != "main" {
        return Err("PDF export is only available from the main editor.".into());
    }
    let (width, height) = paper_dimensions(&paper_size, margin_inches)?;
    if html.trim().is_empty() || html.len() > MAX_HTML_BYTES {
        return Err("The PDF source is empty or exceeds the 128 MB export limit.".into());
    }
    #[cfg(windows)]
    {
        let app = window.app_handle().clone();
        let state = app.state::<PdfState>();
        let _queue = state.queue.lock().await;
        let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
        let pdf_path = temporary.path().join("manuscript.pdf");
        let id = NEXT_JOB.fetch_add(1, Ordering::Relaxed);
        let label = format!("codebook-pdf-{id}");
        let path = format!("/print-{id}.html");
        *state.source.lock().map_err(|error| error.to_string())? =
            Some((label.clone(), path.clone(), html.into_bytes()));
        let _cleanup = PrintJobCleanup {
            app: app.clone(),
            label: label.clone(),
        };
        let (sender, receiver) = std::sync::mpsc::channel::<Result<(), String>>();
        let started = Arc::new(AtomicBool::new(false));
        let (ready_title, failed_title) = readiness_titles(id, temporary.path())?;
        let script = readiness_script(&ready_title, &failed_title);
        let load_sender = sender.clone();
        let title_sender = sender.clone();
        let print_path = pdf_path.clone();
        let allowed_path = path.clone();
        tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::CustomProtocol(tauri::Url::parse(&format!("codebook-print://localhost{path}")).map_err(|error| error.to_string())?),
        )
        .title("Preparing PDF")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .inner_size(width * 96.0, height * 96.0)
        .on_navigation(move |url| {
            url.path() == allowed_path &&
                (url.scheme() == "codebook-print" || url.host_str() == Some("codebook-print.localhost"))
        })
        .on_page_load(move |view, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Err(error) = view.eval(&script) {
                    let _ = load_sender.send(Err(format!("Could not prepare the PDF page: {error}")));
                }
            }
        })
        .on_document_title_changed(move |view, title| {
            if title == failed_title {
                let _ = title_sender.send(Err("An image or font could not finish loading for the PDF. Embed the missing image or try again when its source is available.".into()));
            } else if title == ready_title && !started.swap(true, Ordering::SeqCst) {
                let complete = title_sender.clone();
                let immediate_error = title_sender.clone();
                let output = print_path.clone();
                if let Err(error) = view.with_webview(move |platform| {
                    if let Err(error) = start_print(platform, &output, width, height, margin_inches, complete.clone()) {
                        let _ = complete.send(Err(error));
                    }
                }) {
                    let _ = immediate_error.send(Err(format!("Could not access the PDF renderer: {error}")));
                }
            }
        })
        .build()
        .map_err(|error| format!("Could not open the PDF renderer: {error}"))?;
        let finished = tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv_timeout(Duration::from_secs(120))
                .map_err(|_| {
                    "PDF generation timed out. Try a smaller chapter or check remote images."
                        .to_string()
                })?
        })
        .await
        .map_err(|error| error.to_string())?;
        finished?;
        let bytes = std::fs::read(&pdf_path)
            .map_err(|error| format!("Could not read the generated PDF: {error}"))?;
        if !bytes.starts_with(b"%PDF-") {
            return Err("The renderer did not produce a valid PDF file.".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    }
    #[cfg(not(windows))]
    {
        let _ = (width, height);
        Err(
            "Native PDF export is available in the Windows app. Use Print to PDF in this browser."
                .into(),
        )
    }
}

fn readiness_titles(id: u64, directory: &std::path::Path) -> Result<(String, String), String> {
    // The private temporary directory has a fresh random name. Including it
    // prevents an ordinary manuscript title from impersonating a ready event.
    let nonce = directory
        .file_name()
        .ok_or("Could not identify the temporary PDF export folder.")?
        .to_string_lossy();
    Ok((
        format!("codebook-pdf-ready-{id}-{nonce}"),
        format!("codebook-pdf-failed-{id}-{nonce}"),
    ))
}

fn readiness_script(ready: &str, failed: &str) -> String {
    format!(
        r#"(async () => {{
      try {{
        window.__codebookPdfTitle = document.title;
        const deadline = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('asset timeout')), 30000))]);
        await deadline(document.fonts.ready);
        await deadline(Promise.all(Array.from(document.images, (image) => image.complete
          ? (image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('missing image')))
          : new Promise((resolve, reject) => {{ image.addEventListener('load', resolve, {{ once: true }}); image.addEventListener('error', reject, {{ once: true }}); }}))));
        await new Promise(resolve => setTimeout(resolve, 80));
        document.title = {ready};
      }} catch {{ document.title = {failed}; }}
    }})()"#,
        ready = serde_json::to_string(ready).unwrap(),
        failed = serde_json::to_string(failed).unwrap()
    )
}

#[cfg(windows)]
fn start_print(
    platform: tauri::webview::PlatformWebview,
    output: &std::path::Path,
    width: f64,
    height: f64,
    margin: f64,
    complete: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::{
        ExecuteScriptCompletedHandler,
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7},
        PrintToPdfCompletedHandler,
    };
    use windows::core::{Interface, HSTRING};
    // COM objects and their callbacks stay on the owning WebView UI thread.
    unsafe {
        let environment: ICoreWebView2Environment6 = platform
            .environment()
            .cast()
            .map_err(|error| format!("Update Microsoft Edge WebView2 to export PDF: {error}"))?;
        let settings = environment
            .CreatePrintSettings()
            .map_err(|error| error.to_string())?;
        settings
            .SetPageWidth(width)
            .map_err(|error| error.to_string())?;
        settings
            .SetPageHeight(height)
            .map_err(|error| error.to_string())?;
        settings
            .SetScaleFactor(1.0)
            .map_err(|error| error.to_string())?;
        settings
            .SetMarginTop(margin)
            .map_err(|error| error.to_string())?;
        settings
            .SetMarginBottom(margin)
            .map_err(|error| error.to_string())?;
        settings
            .SetMarginLeft(margin)
            .map_err(|error| error.to_string())?;
        settings
            .SetMarginRight(margin)
            .map_err(|error| error.to_string())?;
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|error| error.to_string())?;
        settings
            .SetShouldPrintSelectionOnly(false)
            .map_err(|error| error.to_string())?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|error| error.to_string())?;
        let core: ICoreWebView2_7 = platform
            .controller()
            .CoreWebView2()
            .map_err(|error| error.to_string())?
            .cast()
            .map_err(|error| error.to_string())?;
        let callback_sender = complete.clone();
        let callback = PrintToPdfCompletedHandler::create(Box::new(move |error, success| {
            let result = error
                .map_err(|error| format!("PDF printing failed: {error}"))
                .and_then(|_| {
                    if success {
                        Ok(())
                    } else {
                        Err("WebView2 could not generate this PDF.".into())
                    }
                });
            let _ = callback_sender.send(result);
            Ok(())
        }));
        // The temporary readiness title must not become the PDF metadata title.
        // Wait for the original document title to be restored before printing.
        let print_view = core.clone();
        let destination = HSTRING::from(output.as_os_str());
        let restored = ExecuteScriptCompletedHandler::create(Box::new(move |result, _| {
            let result =
                result.and_then(|_| print_view.PrintToPdf(&destination, &settings, &callback));
            if let Err(error) = result {
                let _ = complete.send(Err(format!("Could not start PDF printing: {error}")));
            }
            Ok(())
        }));
        core.ExecuteScript(
            &HSTRING::from("document.title = window.__codebookPdfTitle || 'CodeBook';"),
            &restored,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn write_pdf_export(window: WebviewWindow, path: String, bytes: Vec<u8>) -> Result<(), String> {
    if window.label() != "main" || !bytes.starts_with(b"%PDF-") {
        return Err("Only valid PDFs from the editor can be saved.".into());
    }
    if !std::path::Path::new(&path)
        .extension()
        .map(|extension| extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
    {
        return Err("Choose a filename ending in .pdf.".into());
    }
    super::atomic_write(std::path::Path::new(&path), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paper_settings_are_bounded_and_exact() {
        assert_eq!(paper_dimensions("letter", 0.55).unwrap(), (8.5, 11.0));
        assert_eq!(
            paper_dimensions("a4", 0.55).unwrap(),
            (210.0 / 25.4, 297.0 / 25.4)
        );
        for margin in [f64::NAN, f64::INFINITY, -0.1, 1.6] {
            assert!(paper_dimensions("letter", margin).is_err());
        }
        assert!(paper_dimensions("other", 0.55).is_err());
    }
    #[test]
    fn readiness_waits_for_fonts_and_images_without_inserting_document_html() {
        let script = readiness_script("ready", "failed");
        assert!(script.contains("document.fonts.ready"));
        assert!(script.contains("document.images"));
        assert!(script.contains("30000"));
        assert!(!script.contains("innerHTML"));
    }
    #[test]
    fn readiness_titles_include_a_private_per_export_nonce() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first_titles = readiness_titles(1, first.path()).unwrap();
        let second_titles = readiness_titles(1, second.path()).unwrap();
        assert_ne!(first_titles.0, "codebook-pdf-ready-1");
        assert_ne!(first_titles.1, "codebook-pdf-failed-1");
        assert_ne!(first_titles.0, second_titles.0);
        assert_ne!(first_titles.1, second_titles.1);
        assert_ne!(first_titles.0, first_titles.1);
    }
}
