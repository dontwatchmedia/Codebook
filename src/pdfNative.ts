import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export async function generateNativePDF(
  html: string,
  paperSize: "letter" | "a4",
  marginInches = 0.55,
): Promise<Uint8Array> {
  if (!isTauri())
    throw new Error(
      "Open the Windows app to generate a PDF, or use your browser’s Print to PDF option.",
    );
  const bytes = await invoke<ArrayBuffer | number[]>("generate_native_pdf", {
    html,
    paperSize,
    marginInches,
  });
  return bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : Uint8Array.from(bytes);
}

export async function saveNativePDF(
  filename: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (!isTauri())
    throw new Error("Native PDF saving is available in the Windows app.");
  const path = await save({
    defaultPath: filename,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (!path) return false;
  await invoke("write_pdf_export", { path, bytes: Array.from(bytes) });
  return true;
}
