import { useRef, useState } from "react";
import { ImagePlus, Info, Trash2, X } from "lucide-react";
import type { UploadedImage } from "../state/store";
import { cn } from "../utils/cn";
import { Segmented } from "./ui";

const MAX = 15 * 1024 * 1024;

export function UploadSlot({ label, image, onChange }: { label: string; image: UploadedImage | null; onChange: (img: UploadedImage | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const handle = (f: File) => {
    setErr(null);
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext === "tif" || ext === "tiff" || f.type === "image/tiff") {
      setErr("GeoTIFF detected. Geospatial processing of GeoTIFFs needs a backend that is not connected in this build, and browsers cannot preview TIFF files. The file was not read.");
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setErr("Unsupported file type. Choose a PNG, JPG or WebP image to preview.");
      return;
    }
    if (f.size > MAX) {
      setErr("File is larger than 15 MB.");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => onChange({ name: f.name, url, size: f.size, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("This file could not be decoded as an image.");
    };
    img.src = url;
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,.tif,.tiff"
        className="hidden"
        aria-label={`${label} image file`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handle(f);
        }}
      />
      {image ? (
        <div className="overflow-hidden rounded-md border border-line bg-ink-900">
          <img src={image.url} alt={`${label} upload preview`} className="h-[72px] w-full object-cover" />
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] text-slate-300" title={image.name}>
                {image.name}
              </span>
              <span className="block font-mono text-[9.5px] text-slate-600">
                {image.width}×{image.height} · {(image.size / 1024).toFixed(0)} KB
              </span>
            </span>
            <button onClick={() => onChange(null)} aria-label={`Remove ${label} image`} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-red-400">
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} className="flex h-[72px] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-ink-900 text-[11px] text-slate-400 transition hover:border-slate-500 hover:text-slate-200">
          <ImagePlus className="size-4" />
          {label} image
        </button>
      )}
      {err && <p className="mt-1 text-[10.5px] leading-snug text-warn">{err}</p>}
    </div>
  );
}

export function UploadCompareDialog({ before, after, onClose }: { before: UploadedImage | null; after: UploadedImage | null; onClose: () => void }) {
  const [mode, setMode] = useState<"before" | "after" | "swipe">("swipe");
  const [split, setSplit] = useState(50);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Uploaded image preview" onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-line bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <h2 className="mr-auto text-[13px] font-semibold text-white">Uploaded image preview</h2>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "before", label: "Before" },
              { value: "swipe", label: "Swipe" },
              { value: "after", label: "After" },
            ]}
          />
          <button onClick={onClose} aria-label="Close" className="rounded p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-start gap-2 border-b border-line bg-warn/5 px-4 py-2 text-[11.5px] text-slate-300">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <span>
            <span className="font-medium text-warn">Display only.</span> Ordinary PNG/JPG files carry no georeferencing, orbit or radiometric metadata, so FloodLens cannot process them. These images are not analysed and are not used in any result.
          </span>
        </div>
        <div className="relative min-h-[280px] flex-1 overflow-hidden bg-ink-950">
          <div className="relative mx-auto aspect-[16/10] max-h-[60vh] w-full">
            {before ? <img src={before.url} alt="Before" className="absolute inset-0 size-full object-contain" /> : <Empty label="No before image" />}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${mode === "before" ? 100 : mode === "after" ? 0 : split}%)` }}>
              {after ? <img src={after.url} alt="After" className="absolute inset-0 size-full object-contain" /> : <Empty label="No after image" />}
            </div>
            {mode === "swipe" && <div className="absolute inset-y-0 w-px bg-white/90" style={{ left: `${split}%` }} />}
          </div>
        </div>
        <div className={cn("flex items-center gap-3 border-t border-line px-4 py-2.5", mode !== "swipe" && "opacity-40")}>
          <span className="text-[11px] text-slate-500">Before</span>
          <input type="range" min={0} max={100} value={split} disabled={mode !== "swipe"} onChange={(e) => setSplit(Number(e.target.value))} className="h-1 flex-1" aria-label="Swipe position" />
          <span className="text-[11px] text-slate-500">After</span>
        </div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="absolute inset-0 flex items-center justify-center bg-ink-900 text-[12px] text-slate-600">{label}</div>;
}
