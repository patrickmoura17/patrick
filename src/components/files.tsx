"use client";
// File upload + gallery shared by customers, projects, estimates, measurements and the document center.
import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImageIcon, Trash2, Upload, X, Eye, EyeOff } from "lucide-react";
import { db, uid } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import type { FileCategory, FileRecord, ID } from "@/lib/types";
import { Badge, Button, cn, Select, useToast } from "./ui";

export const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: "photo", label: "Photo" },
  { key: "estimate", label: "Estimate" },
  { key: "contract", label: "Contract" },
  { key: "invoice", label: "Invoice" },
  { key: "change_order", label: "Change order" },
  { key: "receipt", label: "Material receipt" },
  { key: "spec", label: "Product specification" },
  { key: "floor_plan", label: "Floor plan" },
  { key: "drawing", label: "Drawing / sketch" },
  { key: "warranty", label: "Warranty" },
  { key: "instructions", label: "Installation instructions" },
  { key: "inspiration", label: "Inspiration" },
  { key: "other", label: "Other" },
];

const MAX = 25 * 1024 * 1024;

export async function uploadFiles(
  files: FileList | File[],
  meta: Partial<Pick<FileRecord, "customer_id" | "project_id" | "estimate_id" | "measurement_id" | "category" | "photo_phase" | "shared_with_customer" | "uploaded_by_customer">>,
) {
  const out: FileRecord[] = [];
  for (const f of Array.from(files)) {
    if (f.size > MAX) throw new Error(`${f.name} exceeds 25 MB`);
    const id = uid();
    const path = `${meta.customer_id ?? "general"}/${meta.project_id ?? "none"}/${id}-${f.name.replace(/[^\w.-]+/g, "_")}`;
    await db.backend!.putFile(path, f);
    out.push(
      db.insert("files", {
        id, name: f.name, mime: f.type || "application/octet-stream", size: f.size,
        category: meta.category ?? (f.type.startsWith("image/") ? "photo" : "other"), photo_phase: meta.photo_phase ?? null,
        customer_id: meta.customer_id ?? null, project_id: meta.project_id ?? null, estimate_id: meta.estimate_id ?? null, measurement_id: meta.measurement_id ?? null,
        storage_path: path, url: null, uploaded_by: meta.uploaded_by_customer ? null : db.currentUserId, uploaded_by_customer: !!meta.uploaded_by_customer,
        shared_with_customer: meta.shared_with_customer ?? false, notes: "",
      }),
    );
  }
  return out;
}

export async function deleteFile(f: FileRecord) {
  await db.backend?.removeFile(f.storage_path).catch(() => {});
  db.remove("files", f.id);
}

const urlCache = new Map<string, string>();
export function useFileUrl(f: FileRecord | undefined | null) {
  const [url, setUrl] = useState<string | null>(f ? urlCache.get(f.storage_path) ?? f.url : null);
  useEffect(() => {
    if (!f) return;
    if (urlCache.has(f.storage_path)) return setUrl(urlCache.get(f.storage_path)!);
    let alive = true;
    db.backend?.fileUrl(f.storage_path).then((u) => {
      if (u) urlCache.set(f.storage_path, u);
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [f]);
  return url;
}

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function Dropzone({ onFiles, accept, label = "Drop files or click to upload", compact }: { onFiles: (f: FileList) => void; accept?: string; label?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition",
        compact ? "px-3 py-4" : "px-4 py-8",
        over ? "border-brass-400 bg-brass-50" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
      )}
    >
      <Upload className="mb-1.5 h-5 w-5 text-stone-400" />
      <p className="text-sm font-medium text-ink-800">{label}</p>
      {!compact && <p className="mt-0.5 text-xs text-stone-400">PDF, JPG, PNG, DWG, DOCX · up to 25 MB</p>}
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Thumb({ f, onOpen }: { f: FileRecord; onOpen: () => void }) {
  const url = useFileUrl(f.mime.startsWith("image/") ? f : null);
  return (
    <button onClick={onOpen} className="group relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={f.name} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-stone-400">
          {f.mime.startsWith("image/") ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-7 w-7" />}
          <span className="text-[10px] font-semibold uppercase">{f.name.split(".").pop()}</span>
        </div>
      )}
      {f.photo_phase && <Badge tone={f.photo_phase === "after" ? "green" : f.photo_phase === "before" ? "neutral" : "blue"} className="absolute left-1.5 top-1.5">{f.photo_phase}</Badge>}
    </button>
  );
}

export function Lightbox({ f, onClose }: { f: FileRecord | null; onClose: () => void }) {
  const url = useFileUrl(f);
  if (!f) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink-950/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm font-medium">{f.name}</p>
        <div className="flex gap-2">
          {url && (
            <a href={url} download={f.name} className="rounded-lg p-2 hover:bg-white/10">
              <Download className="h-4 w-4" />
            </a>
          )}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <p className="text-stone-400">Loading…</p>
        ) : f.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={f.name} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : f.mime === "application/pdf" ? (
          <iframe src={url} className="h-full w-full max-w-5xl rounded-lg bg-white" title={f.name} />
        ) : (
          <a href={url} download={f.name} className="rounded-lg bg-white px-4 py-2 text-sm font-medium">
            Download {f.name}
          </a>
        )}
      </div>
    </div>
  );
}

export function FileGallery({ files, canEdit = true, showShare = false, emptyText = "No files yet." }: { files: FileRecord[]; canEdit?: boolean; showShare?: boolean; emptyText?: string }) {
  const [open, setOpen] = useState<FileRecord | null>(null);
  const { confirm } = useToast();
  if (!files.length) return <p className="py-4 text-center text-sm text-stone-400">{emptyText}</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((f) => (
          <div key={f.id} className="min-w-0">
            <Thumb f={f} onOpen={() => setOpen(f)} />
            <div className="mt-1.5 flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink-800" title={f.name}>{f.name}</p>
                <p className="text-[11px] text-stone-400">{fmtSize(f.size)} · {fmtDate(f.created_at, "MMM d")}{f.uploaded_by_customer ? " · customer" : ""}</p>
              </div>
              {canEdit && showShare && (
                <button title={f.shared_with_customer ? "Visible in customer portal" : "Internal only"} onClick={() => db.update("files", f.id, { shared_with_customer: !f.shared_with_customer })} className={cn("rounded p-1", f.shared_with_customer ? "text-sage-600" : "text-stone-300 hover:text-stone-500")}>
                  {f.shared_with_customer ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              )}
              {canEdit && (
                <button
                  className="rounded p-1 text-stone-300 hover:text-clay-600"
                  onClick={async () => {
                    if (await confirm({ title: "Delete file?", body: f.name, danger: true, confirmLabel: "Delete" })) await deleteFile(f);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Lightbox f={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function FileUploader({ meta, categories = true, phases = false, compact }: { meta: Parameters<typeof uploadFiles>[1]; categories?: boolean; phases?: boolean; compact?: boolean }) {
  const [cat, setCat] = useState<FileCategory>(meta.category ?? "photo");
  const [phase, setPhase] = useState<"" | "before" | "progress" | "after">("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <div className="space-y-2">
      {(categories || phases) && (
        <div className="flex flex-wrap gap-2">
          {categories && (
            <div className="w-48">
              <Select value={cat} onChange={(e) => setCat(e.target.value as FileCategory)}>
                {FILE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </Select>
            </div>
          )}
          {phases && (
            <div className="w-40">
              <Select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)}>
                <option value="">No photo phase</option>
                <option value="before">Before</option>
                <option value="progress">Progress</option>
                <option value="after">After</option>
              </Select>
            </div>
          )}
        </div>
      )}
      <Dropzone
        compact={compact}
        label={busy ? "Uploading…" : undefined}
        onFiles={async (fl) => {
          setBusy(true);
          try {
            const r = await uploadFiles(fl, { ...meta, category: cat, photo_phase: phase || null });
            toast(`${r.length} file${r.length > 1 ? "s" : ""} uploaded`);
          } catch (e) {
            toast((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function filesFor(where: Partial<Record<"customer_id" | "project_id" | "estimate_id" | "measurement_id", ID>>) {
  return db.all("files").filter((f) => Object.entries(where).every(([k, v]) => f[k as keyof FileRecord] === v));
}

export { Button };
