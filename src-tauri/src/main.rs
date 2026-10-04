#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

struct Storage {
    root: PathBuf,
    lock: Mutex<()>,
}
fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        Err("Invalid project ID".into())
    } else {
        Ok(())
    }
}
fn validate(book: &Value) -> Result<String, String> {
    let id = book["id"].as_str().ok_or("Missing book ID")?;
    safe_id(id)?;
    if book["version"] != 1 || !book["title"].is_string() || !book["nodes"].is_array() {
        return Err("Invalid manuscript".into());
    }
    Ok(id.into())
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid destination")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
fn read_book(path: &Path) -> Option<Value> {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .filter(|v| validate(v).is_ok())
}
fn clear_journal(root: &Path, id: &str, modified: Option<&str>) -> Result<(), String> {
    let path = root.join("recovery").join(format!("{}.json", id));
    if path.exists()
        && (modified.is_none()
            || read_book(&path)
                .map(|v| v["modified"].as_str().unwrap_or("") <= modified.unwrap_or(""))
                .unwrap_or(false))
    {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn stage_book(book: Value, s: tauri::State<Storage>) -> Result<(), String> {
    let id = validate(&book)?;
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let modified = book["modified"]
        .as_str()
        .ok_or("Missing modification time")?;
    let path = s.root.join("recovery").join(format!("{}.json", id));
    for candidate in [&path, &s.root.join(&id).join("book.json")] {
        if read_book(candidate)
            .map(|v| v["modified"].as_str().unwrap_or("") >= modified)
            .unwrap_or(false)
        {
            return Ok(());
        }
    }
    atomic_write(
        &path,
        &serde_json::to_vec(&book).map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
fn clear_recovery(
    id: String,
    modified: Option<String>,
    s: tauri::State<Storage>,
) -> Result<(), String> {
    safe_id(&id)?;
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    clear_journal(&s.root, &id, modified.as_deref())
}
#[tauri::command]
fn storage_path(s: tauri::State<Storage>) -> String {
    s.root.to_string_lossy().into()
}
const THEMES: &[&str] = &[
    "light", "white", "sepia", "dark", "midnight", "ocean", "rose", "lavender",
];
const LAYOUTS: &[&str] = &["compact", "original"];
const DEFAULT_WRITING_ZOOM: u16 = 100;
fn valid_writing_zoom(zoom: u16) -> bool {
    (50..=200).contains(&zoom)
}
fn read_preferences(root: &Path) -> Result<Value, String> {
    let path = root.join(".preferences.json");
    if !path.exists() {
        return Ok(json!({}));
    }
    let data: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if !data.is_object() {
        return Err("Invalid preferences file; the original was preserved".into());
    }
    Ok(data)
}
// Preference setters call this while holding the same Storage mutex. Each update
// rereads and merges the current file before replacing it atomically, so an
// appearance update and a layout update cannot discard one another's values.
fn write_preference(root: &Path, key: &str, value: Value) -> Result<(), String> {
    let mut preferences = read_preferences(root)?;
    preferences[key] = value;
    atomic_write(
        &root.join(".preferences.json"),
        &serde_json::to_vec(&preferences).map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
fn get_theme_preference(s: tauri::State<Storage>) -> Result<Option<String>, String> {
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let data = read_preferences(&s.root)?;
    Ok(data["theme"]
        .as_str()
        .filter(|t| THEMES.contains(t))
        .map(String::from))
}
#[tauri::command]
fn set_theme_preference(theme: String, s: tauri::State<Storage>) -> Result<(), String> {
    if !THEMES.contains(&theme.as_str()) {
        return Err("Unknown theme".into());
    }
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    write_preference(&s.root, "theme", json!(theme))
}
#[tauri::command]
fn get_layout_preference(s: tauri::State<Storage>) -> Result<Option<String>, String> {
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let data = read_preferences(&s.root)?;
    Ok(data["layout"]
        .as_str()
        .filter(|value| LAYOUTS.contains(value))
        .map(String::from))
}
#[tauri::command]
fn set_layout_preference(layout: String, s: tauri::State<Storage>) -> Result<(), String> {
    if !LAYOUTS.contains(&layout.as_str()) {
        return Err("Unknown workspace layout".into());
    }
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    write_preference(&s.root, "layout", json!(layout))
}
fn read_writing_zoom(root: &Path) -> u16 {
    let Ok(data) = read_preferences(root) else {
        return DEFAULT_WRITING_ZOOM;
    };
    data["writingZoom"]
        .as_u64()
        .and_then(|zoom| u16::try_from(zoom).ok())
        .filter(|zoom| valid_writing_zoom(*zoom))
        .unwrap_or(DEFAULT_WRITING_ZOOM)
}
fn write_writing_zoom(root: &Path, zoom: u16) -> Result<(), String> {
    if !valid_writing_zoom(zoom) {
        return Err("Writing zoom must be an integer from 50 to 200".into());
    }
    write_preference(root, "writingZoom", json!(zoom))
}
#[tauri::command]
fn get_writing_zoom(s: tauri::State<Storage>) -> Result<u16, String> {
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    Ok(read_writing_zoom(&s.root))
}
#[tauri::command]
fn set_writing_zoom(zoom: u16, s: tauri::State<Storage>) -> Result<(), String> {
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    write_writing_zoom(&s.root, zoom)
}
#[tauri::command]
fn load_library(s: tauri::State<Storage>) -> Result<Value, String> {
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let mut books = Vec::new();
    let mut warnings = Vec::new();
    fs::create_dir_all(&s.root).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&s.root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path().join("book.json");
        if entry.file_name() == "trash" || !path.exists() {
            continue;
        }
        match fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .filter(|v| validate(v).is_ok())
        {
            Some(book) => books.push(book),
            None => warnings.push(format!(
                "Could not read {}. The file was preserved; check its backups folder.",
                path.display()
            )),
        }
    }
    let mut recovery = Vec::new();
    if let Ok(entries) = fs::read_dir(s.root.join("recovery")) {
        for e in entries.flatten() {
            if let Some(book) = read_book(&e.path()) {
                recovery.push(book);
            }
        }
    }
    Ok(json!({"books":books,"warnings":warnings,"recovery":recovery}))
}
#[tauri::command]
fn save_book(book: Value, s: tauri::State<Storage>) -> Result<(), String> {
    let id = validate(&book)?;
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let dir = s.root.join(&id);
    let path = dir.join("book.json");
    let backups = dir.join("backups");
    if path.exists() {
        let previous = fs::read(&path).map_err(|e| e.to_string())?;
        if let Ok(old) = serde_json::from_slice::<Value>(&previous) {
            if old["modified"].as_str().unwrap_or("") > book["modified"].as_str().unwrap_or("") {
                return Ok(());
            }
        }
        fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
        let mut files: Vec<_> = fs::read_dir(&backups)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .collect();
        files.sort();
        let last = files
            .last()
            .and_then(|p| p.file_stem())
            .and_then(|s| s.to_str())
            .and_then(|s| s.parse::<u128>().ok())
            .unwrap_or(0);
        if timestamp().saturating_sub(last) > 300_000 {
            atomic_write(&backups.join(format!("{}.json", timestamp())), &previous)?;
            while files.len() >= 30 {
                let old = files.remove(0);
                fs::remove_file(old).map_err(|e| e.to_string())?;
            }
        }
    }
    atomic_write(
        &path,
        &serde_json::to_vec_pretty(&book).map_err(|e| e.to_string())?,
    )?;
    clear_journal(&s.root, &id, book["modified"].as_str())
}
#[tauri::command]
fn delete_book(id: String, s: tauri::State<Storage>) -> Result<(), String> {
    safe_id(&id)?;
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let trash = s.root.join("trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let src = s.root.join(&id);
    if src.exists() {
        fs::rename(src, trash.join(format!("{}-{}", id, timestamp())))
            .map_err(|e| e.to_string())?;
    }
    clear_journal(&s.root, &id, None)
}
#[tauri::command]
fn list_backups(id: String, s: tauri::State<Storage>) -> Result<Value, String> {
    safe_id(&id)?;
    let _guard = s.lock.lock().map_err(|e| e.to_string())?;
    let dir = s.root.join(id).join("backups");
    let mut result = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
            if let Some(book) = fs::read(entry.path())
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                .filter(|b| validate(b).is_ok())
            {
                result.push(json!({"name":entry.file_name().to_string_lossy(),"modified":book["modified"],"book":book}));
            }
        }
    }
    result.sort_by(|a, b| b["name"].as_str().cmp(&a["name"].as_str()));
    Ok(json!(result))
}
#[tauri::command]
fn write_export(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), content.as_bytes())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = std::env::var_os("CODEBOOK_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("books"));
            app.manage(Storage {
                root,
                lock: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            stage_book,
            clear_recovery,
            save_book,
            delete_book,
            list_backups,
            write_export,
            storage_path,
            get_theme_preference,
            set_theme_preference,
            get_layout_preference,
            set_layout_preference,
            get_writing_zoom,
            set_writing_zoom
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start CodeBook");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn appearance_updates_preserve_other_preferences() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".preferences.json");
        atomic_write(
            &path,
            br#"{"theme":"dark","layout":"original","future":{"keep":true}}"#,
        )
        .unwrap();
        write_preference(dir.path(), "theme", json!("midnight")).unwrap();
        write_preference(dir.path(), "layout", json!("compact")).unwrap();
        let saved = read_preferences(dir.path()).unwrap();
        assert_eq!(saved["theme"], "midnight");
        assert_eq!(saved["layout"], "compact");
        assert_eq!(saved["future"]["keep"], true);
    }
    #[test]
    fn invalid_preferences_are_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".preferences.json");
        atomic_write(&path, b"not json").unwrap();
        assert!(write_preference(dir.path(), "theme", json!("rose")).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "not json");
    }
    #[test]
    fn writing_zoom_updates_preserve_appearance_and_future_preferences() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".preferences.json");
        atomic_write(
            &path,
            br#"{"theme":"rose","layout":"compact","future":{"keep":true}}"#,
        )
        .unwrap();
        write_writing_zoom(dir.path(), 80).unwrap();
        write_preference(dir.path(), "theme", json!("midnight")).unwrap();
        let saved = read_preferences(dir.path()).unwrap();
        assert_eq!(saved["writingZoom"], 80);
        assert_eq!(saved["theme"], "midnight");
        assert_eq!(saved["layout"], "compact");
        assert_eq!(saved["future"]["keep"], true);
        assert_eq!(read_writing_zoom(dir.path()), 80);
        let before = fs::read(&path).unwrap();
        for invalid in [0, 49, 201, u16::MAX] {
            assert!(write_writing_zoom(dir.path(), invalid).is_err());
            assert_eq!(fs::read(&path).unwrap(), before);
        }
        for zoom in [50, 100, 200] {
            write_writing_zoom(dir.path(), zoom).unwrap();
            assert_eq!(read_writing_zoom(dir.path()), zoom);
        }
    }
    #[test]
    fn missing_or_invalid_writing_zoom_uses_one_hundred_percent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".preferences.json");
        assert_eq!(read_writing_zoom(dir.path()), 100);
        for invalid in [
            Value::Null,
            json!(49),
            json!(201),
            json!(-1),
            json!(80.5),
            json!("80"),
            json!(true),
        ] {
            atomic_write(
                &path,
                &serde_json::to_vec(&json!({"writingZoom": invalid})).unwrap(),
            )
            .unwrap();
            assert_eq!(read_writing_zoom(dir.path()), 100);
        }
        for corrupt in [b"not json".as_slice(), b"[]".as_slice()] {
            atomic_write(&path, corrupt).unwrap();
            assert_eq!(read_writing_zoom(dir.path()), 100);
            assert!(write_writing_zoom(dir.path(), 80).is_err());
            assert_eq!(fs::read(&path).unwrap(), corrupt);
        }
    }
    #[test]
    fn atomic_replace_keeps_valid_json() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("book.json");
        atomic_write(&p, b"{\"version\":1}").unwrap();
        atomic_write(&p, b"{\"version\":2}").unwrap();
        assert_eq!(fs::read_to_string(p).unwrap(), "{\"version\":2}");
    }
    #[test]
    fn ids_cannot_escape_library() {
        assert!(safe_id("../elsewhere").is_err());
        assert!(safe_id("C:\\book").is_err());
        assert!(safe_id("a-valid-id").is_ok());
    }
    #[test]
    fn older_save_cannot_clear_newer_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("recovery").join("test-book.json");
        let book = json!({"version":1,"id":"test-book","title":"Test","nodes":[],"modified":"2026-09-17T01:00:02.000Z"});
        atomic_write(&path, &serde_json::to_vec(&book).unwrap()).unwrap();
        clear_journal(dir.path(), "test-book", Some("2026-09-17T01:00:01.000Z")).unwrap();
        assert!(path.exists());
        clear_journal(dir.path(), "test-book", Some("2026-09-17T01:00:02.000Z")).unwrap();
        assert!(!path.exists());
    }
}
