import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import type { Book } from "../model";
import { desktop } from "../storage";
import {
  estimatePDFPages,
  exportPDFHTML,
  generateBookPDF,
  readPDFOptions,
  saveBookPDF,
  savePDFOptions,
  type GeneratedPDF,
  type PDFOptions,
} from "../pdf";
import Modal from "./Modal";
import "./pdf.css";

export interface PdfExportProps {
  book: Book;
  onClose: () => void;
  onGeneratedCount: (
    count: number,
    modified: string,
    settings: PDFOptions,
  ) => void;
  notify: (message: string) => void;
}

export default function PdfExport({
  book,
  onClose,
  onGeneratedCount,
  notify,
}: PdfExportProps) {
  const [options, setOptions] = useState<PDFOptions>(readPDFOptions);
  const [pdf, setPDF] = useState<GeneratedPDF | null>(null);
  const [preparing, setPreparing] = useState(desktop);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onGeneratedCount, notify });
  callbacks.current = { onGeneratedCount, notify };
  const html = useMemo(() => exportPDFHTML(book, options), [book, options]);
  const estimate = useMemo(
    () => estimatePDFPages(book, options),
    [book, options],
  );
  const fitPreview = () => {
    const element = frame.current;
    const body = element?.contentDocument?.body;
    if (element && body) {
      const paperWidth = options.paper === "a4" ? (210 * 96) / 25.4 : 8.5 * 96;
      body.style.zoom = String(
        Math.min(1, Math.max(0.2, (element.clientWidth - 24) / paperWidth)),
      );
    }
  };
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(fitPreview);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [options.paper]);
  useEffect(() => {
    let current = true;
    setPDF(null);
    setError("");
    if (!desktop) return;
    setPreparing(true);
    void generateBookPDF(book, options)
      .then((result) => {
        if (!current) return;
        setPDF(result);
        setPreparing(false);
        callbacks.current.onGeneratedCount(
          result.pageCount,
          book.modified,
          options,
        );
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setPreparing(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      current = false;
    };
  }, [book, options, retry]);

  const change = (next: PDFOptions) => {
    setOptions(next);
    try {
      savePDFOptions(next);
    } catch {
      callbacks.current.notify(
        "PDF settings could not be remembered on this device.",
      );
    }
  };
  const save = async () => {
    if (!pdf) return;
    setSaving(true);
    setError("");
    try {
      if (await saveBookPDF(book, pdf))
        callbacks.current.notify(
          `PDF saved. ${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"}.`,
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const print = () => {
    const preview = frame.current?.contentWindow;
    if (!preview) return;
    preview.focus();
    preview.print();
  };
  return (
    <Modal
      title="Export PDF"
      subtitle="Your complete project, with its formatting and chapter order."
      close={onClose}
      wide
    >
      <div className="pdf-export">
        <div className="pdf-settings">
          <label>
            Paper size
            <select
              aria-label="Paper size"
              value={options.paper}
              disabled={saving}
              onChange={(event) =>
                change({
                  ...options,
                  paper: event.target.value as PDFOptions["paper"],
                })
              }
            >
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="a4">A4 (210 × 297 mm)</option>
            </select>
          </label>
          <label className="pdf-checkbox">
            <input
              type="checkbox"
              checked={options.includeTitle}
              disabled={saving}
              onChange={(event) =>
                change({ ...options, includeTitle: event.target.checked })
              }
            />
            Include project title
          </label>
          <label className="pdf-checkbox">
            <input
              type="checkbox"
              checked={options.startChaptersOnNewPage}
              disabled={saving}
              onChange={(event) =>
                change({
                  ...options,
                  startChaptersOnNewPage: event.target.checked,
                })
              }
            />
            Start each {book.mode === "bible" ? "section" : "chapter"} on a new
            page
          </label>
          <label className="pdf-checkbox">
            <input
              type="checkbox"
              checked={options.pageNumbers}
              disabled={saving}
              onChange={(event) =>
                change({ ...options, pageNumbers: event.target.checked })
              }
            />
            Page numbers
          </label>
          <label className="pdf-checkbox">
            <input
              type="checkbox"
              checked={options.compactSpacing}
              disabled={saving}
              onChange={(event) =>
                change({ ...options, compactSpacing: event.target.checked })
              }
            />
            Compact spacing
          </label>
          <p
            className="pdf-page-count"
            role="status"
            aria-label="PDF page count"
          >
            {preparing
              ? "Preparing PDF…"
              : pdf
                ? `${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"} in this PDF`
                : `About ${estimate} ${estimate === 1 ? "page" : "pages"} (estimated)`}
          </p>
          <p className="pdf-hint">
            The preview shows your content on white paper. Page breaks and the
            total are confirmed when the PDF is prepared.
          </p>
          {!desktop && (
            <p className="pdf-hint">
              Choose “Save as PDF” in your browser’s print window. The page
              total shown here is an estimate.
            </p>
          )}
          {error && (
            <div className="pdf-error" role="alert">
              <p>{error}</p>
              {!pdf && (
                <button
                  className="secondary"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  <RefreshCw size={14} />
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
        <div className="pdf-preview">
          <iframe
            ref={frame}
            title="PDF content preview"
            srcDoc={html}
            sandbox="allow-same-origin allow-modals"
            onLoad={fitPreview}
          />
        </div>
      </div>
      <div className="modal-footer pdf-footer">
        <button className="secondary" onClick={onClose}>
          Close
        </button>
        {desktop ? (
          <button
            className="primary"
            disabled={!pdf || preparing || saving}
            onClick={() => void save()}
          >
            <Download size={15} />
            {saving ? "Saving…" : "Save PDF"}
          </button>
        ) : (
          <button className="primary" onClick={print}>
            <Printer size={15} />
            Print / Save as PDF
          </button>
        )}
      </div>
    </Modal>
  );
}
