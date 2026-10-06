//! Incremental, durable manuscript recovery. All entry points run on workers.
use super::{atomic_write, read_book, safe_id, timestamp, validate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct BookStore {
    root: PathBuf,
    cache: Arc<Mutex<HashMap<String, Value>>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DocumentChange {
    Replace {
        path: Vec<usize>,
        node: Value,
    },
    Splice {
        path: Vec<usize>,
        from: usize,
        #[serde(rename = "deleteCount")]
        delete_count: usize,
        content: Vec<Value>,
    },
}
impl DocumentChange {
    fn path(&self) -> &[usize] {
        match self {
            Self::Replace { path, .. } | Self::Splice { path, .. } => path,
        }
    }
}
#[derive(Debug, Serialize, Deserialize)]
pub struct NodeChange {
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    node: Option<Value>,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    fields: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    unset: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    document: Vec<DocumentChange>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookPatch {
    id: String,
    base_modified: String,
    modified: String,
    #[serde(default)]
    fields: Map<String, Value>,
    #[serde(default)]
    unset: Vec<String>,
    #[serde(default)]
    nodes: Vec<NodeChange>,
    #[serde(default)]
    removed: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    order: Option<Vec<String>>,
}
fn modified(book: &Value) -> &str {
    book["modified"].as_str().unwrap_or("")
}
fn revision(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-:.+".contains(&b))
    {
        return Err("Invalid manuscript revision.".into());
    }
    Ok(())
}
fn at_path<'a>(mut node: &'a Value, path: &[usize]) -> Option<&'a Value> {
    for index in path {
        node = node.get("content")?.as_array()?.get(*index)?;
    }
    Some(node)
}
fn at_path_mut<'a>(mut node: &'a mut Value, path: &[usize]) -> Option<&'a mut Value> {
    for index in path {
        node = node.get_mut("content")?.as_array_mut()?.get_mut(*index)?;
    }
    Some(node)
}
fn valid_node(node: &Value, id: &str) -> bool {
    node["id"] == id
        && node["title"].is_string()
        && (node["type"] == "part"
            || (node["type"] == "chapter" && node["document"]["type"] == "doc"))
}
fn check_fields(
    fields: &Map<String, Value>,
    unset: &[String],
    forbidden: &[&str],
    required: &[&str],
) -> Result<(), String> {
    if fields
        .keys()
        .chain(unset.iter())
        .any(|key| forbidden.contains(&key.as_str()))
        || unset.iter().any(|key| required.contains(&key.as_str()))
        || required
            .iter()
            .any(|key| fields.get(*key).is_some_and(|value| !value.is_string()))
    {
        return Err("Invalid manuscript metadata patch.".into());
    }
    Ok(())
}
fn preflight(book: &Value, patch: &BookPatch) -> Result<(), String> {
    safe_id(&patch.id)?;
    revision(&patch.modified)?;
    if book["id"] != patch.id
        || modified(book) != patch.base_modified
        || patch.modified <= patch.base_modified
    {
        return Err(
            "REVISION_CONFLICT: the saved manuscript changed; resynchronize this edit.".into(),
        );
    }
    check_fields(
        &patch.fields,
        &patch.unset,
        &["id", "version", "nodes", "modified"],
        &[
            "title",
            "subtitle",
            "author",
            "description",
            "language",
            "created",
            "color",
        ],
    )?;
    let original = book["nodes"]
        .as_array()
        .ok_or("Invalid manuscript nodes.")?;
    let mut ids: HashSet<&str> = original
        .iter()
        .filter_map(|node| node["id"].as_str())
        .collect();
    let mut changed = HashSet::new();
    for id in &patch.removed {
        if !ids.remove(id.as_str()) || !changed.insert(id.as_str()) {
            return Err("Invalid removed section.".into());
        }
    }
    for change in &patch.nodes {
        if !changed.insert(&change.id) {
            return Err("A section occurs twice in the patch.".into());
        }
        if let Some(node) = &change.node {
            if !valid_node(node, &change.id)
                || !change.document.is_empty()
                || !change.fields.is_empty()
                || !change.unset.is_empty()
            {
                return Err("Invalid replacement section.".into());
            }
            ids.insert(&change.id);
            continue;
        }
        let node = original
            .iter()
            .find(|node| node["id"] == change.id)
            .ok_or("The edited section is missing.")?;
        check_fields(
            &change.fields,
            &change.unset,
            &["id", "type", "document"],
            &["title"],
        )?;
        for (index, edit) in change.document.iter().enumerate() {
            if edit.path().len() > 50
                || change.document[..index].iter().any(|other| {
                    other.path().starts_with(edit.path()) || edit.path().starts_with(other.path())
                })
            {
                return Err("Overlapping document changes are invalid.".into());
            }
            let target = at_path(&node["document"], edit.path())
                .ok_or("Invalid document patch position.")?;
            match edit {
                DocumentChange::Replace { node, .. }
                    if !node.is_object() || !node["type"].is_string() =>
                {
                    return Err("Invalid replacement document node.".into())
                }
                DocumentChange::Splice {
                    from,
                    delete_count,
                    content,
                    ..
                } => {
                    let old = target["content"]
                        .as_array()
                        .ok_or("Invalid document splice target.")?;
                    if *from > old.len()
                        || *delete_count > old.len() - *from
                        || content
                            .iter()
                            .any(|node| !node.is_object() || !node["type"].is_string())
                    {
                        return Err("Invalid document splice range.".into());
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(order) = &patch.order {
        let ordered: HashSet<&str> = order.iter().map(String::as_str).collect();
        if order.len() != ids.len() || ordered != ids {
            return Err("Invalid section order.".into());
        }
    } else if ids.len() != original.len()
        || !patch.removed.is_empty()
        || patch
            .nodes
            .iter()
            .any(|change| !original.iter().any(|node| node["id"] == change.id))
    {
        return Err("Section additions and removals require their complete order.".into());
    }
    if ids.is_empty() {
        return Err("A manuscript must contain a section.".into());
    }
    Ok(())
}
fn update_fields(value: &mut Value, fields: Map<String, Value>, unset: Vec<String>) {
    let object = value.as_object_mut().expect("validated object");
    for key in unset {
        object.remove(&key);
    }
    object.extend(fields);
}
fn apply(book: &mut Value, patch: BookPatch) {
    update_fields(book, patch.fields, patch.unset);
    book["modified"] = json!(patch.modified);
    let nodes = book["nodes"]
        .as_array_mut()
        .expect("validated manuscript nodes");
    nodes.retain(|node| !patch.removed.iter().any(|id| node["id"] == *id));
    for change in patch.nodes {
        if let Some(replacement) = change.node {
            if let Some(node) = nodes.iter_mut().find(|node| node["id"] == change.id) {
                *node = replacement;
            } else {
                nodes.push(replacement);
            }
            continue;
        }
        let node = nodes
            .iter_mut()
            .find(|node| node["id"] == change.id)
            .expect("preflight section");
        update_fields(node, change.fields, change.unset);
        for edit in change.document {
            let target =
                at_path_mut(&mut node["document"], edit.path()).expect("preflight document path");
            match edit {
                DocumentChange::Replace { node, .. } => *target = node,
                DocumentChange::Splice {
                    from,
                    delete_count,
                    content,
                    ..
                } => {
                    target["content"]
                        .as_array_mut()
                        .expect("preflight content")
                        .splice(from..from + delete_count, content);
                }
            }
        }
    }
    if let Some(order) = patch.order {
        let mut entries: HashMap<String, Value> = std::mem::take(nodes)
            .into_iter()
            .map(|node| (node["id"].as_str().unwrap().to_owned(), node))
            .collect();
        *nodes = order
            .into_iter()
            .map(|id| entries.remove(&id).expect("preflight order"))
            .collect();
    }
}

impl BookStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    fn journal(&self, id: &str) -> PathBuf {
        self.root.join("recovery").join(id)
    }
    fn legacy(&self, id: &str) -> PathBuf {
        self.root.join("recovery").join(format!("{id}.json"))
    }
    fn read_current(&self, id: &str) -> Result<Option<Value>, String> {
        let saved_path = self.root.join(id).join("book.json");
        let mut book = read_book(&saved_path);
        if saved_path.exists() && book.is_none() {
            return Err(format!(
                "Could not read {}. The original was preserved.",
                saved_path.display()
            ));
        }
        for path in [self.legacy(id), self.journal(id).join("base.json")] {
            if path.exists() {
                let candidate = read_book(&path).ok_or_else(|| {
                    format!(
                        "Could not read recovery {}. The file was preserved.",
                        path.display()
                    )
                })?;
                if book
                    .as_ref()
                    .is_none_or(|old| modified(old) <= modified(&candidate))
                {
                    book = Some(candidate);
                }
            }
        }
        let dir = self.journal(id);
        if dir.exists() {
            let mut paths: Vec<_> = fs::read_dir(dir)
                .map_err(|e| e.to_string())?
                .flatten()
                .map(|e| e.path())
                .filter(|path| {
                    path.file_name()
                        .is_some_and(|name| name.to_string_lossy().starts_with("patch-"))
                })
                .collect();
            paths.sort();
            for path in paths {
                let patch: BookPatch = serde_json::from_slice(
                    &fs::read(&path).map_err(|e| e.to_string())?,
                )
                .map_err(|_| {
                    format!(
                        "Could not read recovery {}. The file was preserved.",
                        path.display()
                    )
                })?;
                let current = book
                    .as_mut()
                    .ok_or("A recovery patch has no base manuscript; its files were preserved.")?;
                if patch.modified.as_str() <= modified(current) {
                    continue;
                }
                preflight(current, &patch)?;
                apply(current, patch);
            }
        }
        Ok(book)
    }
    pub fn stage(&self, book: Value) -> Result<(), String> {
        let id = validate(&book)?;
        revision(modified(&book))?;
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        if !cache.contains_key(&id) {
            if let Some(old) = self.read_current(&id)? {
                cache.insert(id.clone(), old);
            }
        }
        if cache
            .get(&id)
            .is_some_and(|old| modified(old) > modified(&book))
        {
            return Err("REVISION_CONFLICT: refusing an older manuscript.".into());
        }
        atomic_write(
            &self.journal(&id).join("base.json"),
            &serde_json::to_vec(&book).map_err(|e| e.to_string())?,
        )?;
        cache.insert(id, book);
        Ok(())
    }
    pub fn stage_patch(&self, patch: BookPatch) -> Result<(), String> {
        safe_id(&patch.id)?;
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        if !cache.contains_key(&patch.id) {
            let old = self
                .read_current(&patch.id)?
                .ok_or("REVISION_CONFLICT: no base manuscript.")?;
            cache.insert(patch.id.clone(), old);
        }
        let book = cache.get_mut(&patch.id).unwrap();
        preflight(book, &patch)?;
        // The immutable journal record reaches disk before the in-memory head
        // advances. A failed write cannot silently become the next patch's base.
        let name: String = patch
            .modified
            .bytes()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        atomic_write(
            &self.journal(&patch.id).join(format!("patch-{name}.json")),
            &serde_json::to_vec(&patch).map_err(|e| e.to_string())?,
        )?;
        apply(book, patch);
        Ok(())
    }
    fn cleanup_through(&self, id: &str, through: Option<&str>) -> Result<(), String> {
        super::clear_journal(&self.root, id, through)?;
        let dir = self.journal(id);
        if !dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name != "base.json" && !name.starts_with("patch-") {
                // A process killed during an atomic write may leave an
                // uncommitted tempfile; it is never part of the journal.
                continue;
            }
            let remove = if let Some(through) = through {
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                value["modified"]
                    .as_str()
                    .is_some_and(|revision| revision <= through)
            } else {
                true
            };
            if remove {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        if fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_none()
        {
            fs::remove_dir(dir).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn write_snapshot(&self, book: &Value) -> Result<(), String> {
        let id = validate(book)?;
        let dir = self.root.join(&id);
        let path = dir.join("book.json");
        let backups = dir.join("backups");
        if path.exists() {
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
                let previous = fs::read(&path).map_err(|e| e.to_string())?;
                atomic_write(&backups.join(format!("{}.json", timestamp())), &previous)?;
                while files.len() >= 30 {
                    fs::remove_file(files.remove(0)).map_err(|e| e.to_string())?;
                }
            }
        }
        atomic_write(
            &path,
            &serde_json::to_vec_pretty(book).map_err(|e| e.to_string())?,
        )?;
        self.cleanup_through(&id, Some(modified(book)))
    }
    pub fn checkpoint(&self, id: &str, requested: &str) -> Result<(), String> {
        safe_id(id)?;
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        if !cache.contains_key(id) {
            cache.insert(
                id.to_owned(),
                self.read_current(id)?.ok_or("The manuscript is missing.")?,
            );
        }
        let book = cache.get(id).unwrap();
        if modified(book) < requested {
            return Err("The requested edit has not reached recovery storage yet.".into());
        }
        self.write_snapshot(book)
    }
    pub fn save(&self, book: Value) -> Result<(), String> {
        let id = validate(&book)?;
        let revision = modified(&book).to_owned();
        self.stage(book)?;
        self.checkpoint(&id, &revision)
    }
    pub fn clear(&self, id: &str, through: Option<&str>) -> Result<(), String> {
        safe_id(id)?;
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        // A later patch may depend on every earlier patch. Dismissing an old
        // recovery revision must leave that whole newer recovery chain intact.
        if let Some(through) = through {
            if self
                .read_current(id)?
                .as_ref()
                .is_some_and(|book| modified(book) > through)
            {
                return Ok(());
            }
        }
        self.cleanup_through(id, through)?;
        cache.remove(id);
        Ok(())
    }
    pub fn delete(&self, id: &str) -> Result<(), String> {
        safe_id(id)?;
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        let trash = self.root.join("trash");
        fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
        let src = self.root.join(id);
        if src.exists() {
            fs::rename(src, trash.join(format!("{id}-{}", timestamp())))
                .map_err(|e| e.to_string())?;
        }
        self.cleanup_through(id, None)?;
        cache.remove(id);
        Ok(())
    }
    pub fn load(&self) -> Result<Value, String> {
        let _guard = self.cache.lock().map_err(|e| e.to_string())?;
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let mut books = Vec::new();
        let mut recovery = Vec::new();
        let mut warnings = Vec::new();
        let mut ids = HashSet::new();
        for entry in fs::read_dir(&self.root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let path = entry.path().join("book.json");
            if entry.file_name() == "trash" || entry.file_name() == "recovery" || !path.exists() {
                continue;
            }
            match read_book(&path) {
                Some(book) => {
                    books.push(book);
                }
                None => warnings.push(format!(
                    "Could not read {}. The file was preserved; check its backups folder.",
                    path.display()
                )),
            }
        }
        if let Ok(entries) = fs::read_dir(self.root.join("recovery")) {
            for entry in entries.flatten() {
                let path = entry.path();
                let id = if path.is_dir() {
                    path.file_name()
                } else {
                    path.file_stem()
                };
                if let Some(id) = id
                    .and_then(|id| id.to_str())
                    .filter(|id| safe_id(id).is_ok())
                {
                    ids.insert(id.to_owned());
                }
            }
        }
        for id in ids {
            match self.read_current(&id) {
                Ok(Some(current)) => {
                    if books
                        .iter()
                        .find(|book| book["id"] == id)
                        .is_none_or(|saved| modified(&current) > modified(saved))
                    {
                        recovery.push(current);
                    }
                }
                Ok(None) => {}
                Err(error) => warnings.push(error),
            }
        }
        Ok(json!({"books": books, "recovery": recovery, "warnings": warnings}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn book() -> Value {
        json!({"version":1,"id":"book","title":"Systems","subtitle":"","author":"","description":"","language":"en","color":"white","created":"2026-01-01T00:00:00.000Z","modified":"2026-01-01T00:00:00.000Z","nodes":[
            {"id":"chapter-a","type":"chapter","title":"Overview","parentId":null,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"original","marks":[{"type":"bold"}]}]},{"type":"paragraph","content":[{"type":"text","text":"untouched"}]}]}},
            {"id":"chapter-b","type":"chapter","title":"Child","parentId":"chapter-a","document":{"type":"doc","content":[{"type":"paragraph"}]}}
        ]})
    }
    fn patch(base: u8, next: u8, text: &str) -> BookPatch {
        serde_json::from_value(json!({"id":"book","baseModified":format!("2026-01-01T00:00:0{base}.000Z"),"modified":format!("2026-01-01T00:00:0{next}.000Z"),"fields":{},"unset":[],"removed":[],"nodes":[{"id":"chapter-a","document":[{"kind":"replace","path":[0,0],"node":{"type":"text","text":text,"marks":[{"type":"bold"}]}}]}]})).unwrap()
    }
    fn saved(store: &BookStore) -> Value {
        read_book(&store.root.join("book/book.json")).unwrap()
    }
    #[test]
    fn small_durable_patches_recover_after_process_state_is_lost() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        store.stage_patch(patch(0, 1, "changed once")).unwrap();
        store.stage_patch(patch(1, 2, "changed twice")).unwrap();
        assert_eq!(saved(&store), book());
        let files: Vec<_> = fs::read_dir(store.journal("book"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(files.len(), 2);
        assert!(files
            .iter()
            .all(|entry| entry.metadata().unwrap().len() < 600));
        drop(store);
        let restarted = BookStore::new(directory.path().into());
        let loaded = restarted.load().unwrap();
        assert_eq!(loaded["warnings"], json!([]));
        assert_eq!(loaded["books"][0], book());
        let recovery = &loaded["recovery"][0];
        assert_eq!(
            recovery["nodes"][0]["document"]["content"][0]["content"][0]["text"],
            "changed twice"
        );
        assert_eq!(
            recovery["nodes"][0]["document"]["content"][0]["content"][0]["marks"],
            book()["nodes"][0]["document"]["content"][0]["content"][0]["marks"]
        );
        assert_eq!(recovery["nodes"][1], book()["nodes"][1]);
        restarted
            .checkpoint("book", "2026-01-01T00:00:02.000Z")
            .unwrap();
        assert_eq!(saved(&restarted), *recovery);
        assert!(!restarted.journal("book").exists());
        assert_eq!(restarted.load().unwrap()["recovery"], json!([]));
    }
    #[test]
    fn stale_edits_and_old_recovery_clear_cannot_erase_newer_changes() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        store.stage_patch(patch(0, 1, "first")).unwrap();
        store.stage_patch(patch(1, 2, "second")).unwrap();
        assert!(store
            .stage_patch(patch(0, 1, "stale"))
            .unwrap_err()
            .contains("REVISION_CONFLICT"));
        assert!(store
            .stage(book())
            .unwrap_err()
            .contains("REVISION_CONFLICT"));
        store
            .clear("book", Some("2026-01-01T00:00:01.000Z"))
            .unwrap();
        let restarted = BookStore::new(directory.path().into());
        assert_eq!(
            restarted.load().unwrap()["recovery"][0]["modified"],
            "2026-01-01T00:00:02.000Z"
        );
        // An old autosave request safely checkpoints the already newer head.
        store
            .checkpoint("book", "2026-01-01T00:00:01.000Z")
            .unwrap();
        assert_eq!(modified(&saved(&store)), "2026-01-01T00:00:02.000Z");
    }
    #[test]
    fn failed_journal_write_does_not_advance_revision_or_overwrite_saved_book() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        fs::write(store.journal("book"), b"block directory creation").unwrap();
        assert!(store.stage_patch(patch(0, 1, "lost write")).is_err());
        assert_eq!(saved(&store), book());
        fs::remove_file(store.journal("book")).unwrap();
        store.stage_patch(patch(0, 1, "retry")).unwrap();
        assert_eq!(
            store.load().unwrap()["recovery"][0]["modified"],
            "2026-01-01T00:00:01.000Z"
        );
    }
    #[test]
    fn failed_checkpoint_preserves_recovery_and_successful_retry_creates_backup() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        store.stage_patch(patch(0, 1, "recoverable")).unwrap();
        let backups = directory.path().join("book/backups");
        fs::write(&backups, b"block backup creation").unwrap();
        assert!(store
            .checkpoint("book", "2026-01-01T00:00:01.000Z")
            .is_err());
        assert_eq!(saved(&store), book());
        assert_eq!(
            BookStore::new(directory.path().into()).load().unwrap()["recovery"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::remove_file(backups).unwrap();
        store
            .checkpoint("book", "2026-01-01T00:00:01.000Z")
            .unwrap();
        let backup = fs::read_dir(directory.path().join("book/backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(read_book(&backup).unwrap(), book());
    }
    #[test]
    fn restart_after_atomic_checkpoint_ignores_old_journal_records() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        store.stage_patch(patch(0, 1, "checkpointed")).unwrap();
        let head = store.read_current("book").unwrap().unwrap();
        atomic_write(
            &directory.path().join("book/book.json"),
            &serde_json::to_vec(&head).unwrap(),
        )
        .unwrap();
        // Simulate power loss after book replacement but before journal removal.
        let restarted = BookStore::new(directory.path().into());
        assert_eq!(restarted.load().unwrap()["recovery"], json!([]));
        restarted.stage_patch(patch(1, 2, "next edit")).unwrap();
        restarted
            .checkpoint("book", "2026-01-01T00:00:02.000Z")
            .unwrap();
        assert!(!restarted.journal("book").exists());
    }
    #[test]
    fn metadata_hierarchy_and_document_splices_replay_without_flattening() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        let changes: BookPatch = serde_json::from_value(json!({"id":"book","baseModified":modified(&book()),"modified":"2026-01-01T00:00:01.000Z","fields":{"title":"Renamed","mode":"bible"},"unset":[],"removed":[],"order":["chapter-b","chapter-a"],"nodes":[
          {"id":"chapter-a","fields":{"parentId":"chapter-b"},"document":[{"kind":"splice","path":[],"from":1,"deleteCount":0,"content":[{"type":"heading","attrs":{"level":2,"fontFamily":"Arial","fontSize":"16pt"},"content":[{"type":"text","text":"Inserted"}]}]}]},
          {"id":"chapter-b","fields":{"parentId":null,"emoji":"✅"}}
        ]})).unwrap();
        store.stage_patch(changes).unwrap();
        let recovered =
            BookStore::new(directory.path().into()).load().unwrap()["recovery"][0].clone();
        assert_eq!(recovered["title"], "Renamed");
        assert_eq!(recovered["nodes"][0]["id"], "chapter-b");
        assert_eq!(recovered["nodes"][0]["emoji"], "✅");
        assert_eq!(recovered["nodes"][1]["parentId"], "chapter-b");
        assert_eq!(
            recovered["nodes"][1]["document"]["content"][1]["attrs"]["fontSize"],
            "16pt"
        );
        assert_eq!(
            recovered["nodes"][1]["document"]["content"][2],
            book()["nodes"][0]["document"]["content"][1]
        );
    }
    #[test]
    fn invalid_patch_leaves_cache_and_journal_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        store.save(book()).unwrap();
        let mut bad = patch(0, 1, "bad");
        bad.nodes[0].document = vec![DocumentChange::Replace {
            path: vec![99],
            node: json!({"type":"paragraph"}),
        }];
        assert!(store.stage_patch(bad).is_err());
        assert!(!store.journal("book").exists());
        store.stage_patch(patch(0, 1, "valid retry")).unwrap();
    }
    #[test]
    fn legacy_recovery_new_project_and_trash_deletion_remain_compatible() {
        let directory = tempfile::tempdir().unwrap();
        let store = BookStore::new(directory.path().into());
        atomic_write(&store.legacy("book"), &serde_json::to_vec(&book()).unwrap()).unwrap();
        assert_eq!(store.load().unwrap()["recovery"][0], book());
        store.stage_patch(patch(0, 1, "legacy recovered")).unwrap();
        store
            .checkpoint("book", "2026-01-01T00:00:01.000Z")
            .unwrap();
        assert!(!store.legacy("book").exists());
        store.stage_patch(patch(1, 2, "discarded")).unwrap();
        store.delete("book").unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded["books"], json!([]));
        assert_eq!(loaded["recovery"], json!([]));
        assert_eq!(
            fs::read_dir(directory.path().join("trash"))
                .unwrap()
                .count(),
            1
        );
        store.stage(book()).unwrap();
        assert_eq!(
            BookStore::new(directory.path().into()).load().unwrap()["recovery"][0],
            book()
        );
    }
}
