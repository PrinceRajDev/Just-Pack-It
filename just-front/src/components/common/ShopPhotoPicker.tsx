import { useEffect, useId, useState } from "react";
import { imageUrl } from "@/lib/image";
export function ShopPhotoPicker({
  file,
  onChange,
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId(),
    [preview, setPreview] = useState<string>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
      <label htmlFor={id} className="block text-sm font-medium">
        Shop photo (optional)
      </label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Choose a clear storefront photo. JPEG, PNG or WebP, up to 5 MiB. Your photo will be reviewed
        by admin.
      </p>
      <input
        id={id}
        name="shopPhoto"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setError("");
          if (
            next &&
            (!["image/jpeg", "image/png", "image/webp"].includes(next.type) ||
              next.size > 5 * 1024 * 1024 ||
              !next.size)
          ) {
            setError("Choose a JPEG, PNG or WebP photo under 5 MiB.");
            event.target.value = "";
            onChange(null);
            return;
          }
          onChange(next);
        }}
        className="block max-w-full text-sm"
      />
      {preview && (
        <img
          src={imageUrl(preview)}
          alt="Selected shop photo preview"
          className="max-h-44 w-full rounded-lg object-contain"
        />
      )}
      {file && (
        <button
          type="button"
          disabled={disabled}
          className="text-sm text-primary underline"
          onClick={() => {
            onChange(null);
            const input = document.getElementById(id) as HTMLInputElement | null;
            if (input) input.value = "";
          }}
        >
          Remove selected photo
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
