import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { productImages } from "@/services/product-images";
import type { ManagedProduct } from "@/domain/management";
import { ProductImage } from "@/components/store/ProductImage";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { Panel, SaveError } from "./management-shared";
import { useDraftGuard } from "./useDraftGuard";
import { ApiError } from "@/lib/api/client";
export function ProductPhotoUpload({
  product,
  disabled,
  onEditing,
}: {
  product: ManagedProduct;
  disabled: boolean;
  onEditing: (editing: boolean) => void;
}) {
  const client = useQueryClient();
  const draft = useDraftGuard();
  const capability = useQuery({
    queryKey: ["seller-image-upload"],
    queryFn: productImages.capability,
    staleTime: 60000,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const upload = useMutation({
    mutationFn: () => productImages.upload(product, file!),
    onSuccess: async () => {
      setSaved(true);
      draft.reset();
      onEditing(false);
      setFile(null);
      if (input.current) input.current.value = "";
      await client.invalidateQueries();
      toast.success("Product photo saved");
    },
  });
  const needsRefresh =
    !!upload.error &&
    (!(upload.error instanceof ApiError) ||
      upload.error.status === 0 ||
      upload.error.status >= 500 ||
      upload.error.code === "VERSION_CONFLICT");
  const clear = () => {
    if (needsRefresh) return;
    setFile(null);
    draft.reset();
    onEditing(false);
    upload.reset();
    setError(undefined);
    if (input.current) input.current.value = "";
  };
  async function refreshSaved() {
    setRefreshing(true);
    setError(undefined);
    try {
      // Discard local selection only after the operator explicitly requests a server refresh.
      await client.refetchQueries({ queryKey: ["seller-products"] }, { throwOnError: true });
      await client.refetchQueries({ queryKey: ["seller-product"] }, { throwOnError: true });
      setFile(null);
      draft.reset();
      onEditing(false);
      upload.reset();
      if (input.current) input.current.value = "";
    } catch {
      setError(
        "Could not refresh the saved listing. Your selected photo is kept. Retry the refresh before uploading again.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <Panel>
      {draft.dialog}
      <h2 className="font-display text-2xl">Product photo</h2>
      {product.image && (
        <div className="w-36">
          <ProductImage src={product.image} alt="Current saved product photo" width={240} />
          <p className="mt-1 text-sm text-muted-foreground">Currently saved</p>
        </div>
      )}
      {saved && (
        <p role="status" className="text-sm text-primary">
          Product photo saved to this listing.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Choose a JPEG, PNG or WebP photo up to 5 MiB. Uploading saves the photo to this listing
        immediately; the server checks and optimises the file.
      </p>
      {capability.isPending ? (
        <p role="status">Checking photo uploads…</p>
      ) : capability.error ? (
        <ErrorState
          message="Upload availability could not be checked."
          onRetry={() => void capability.refetch()}
        />
      ) : !capability.data.enabled ? (
        <div className="space-y-2">
          <p className="text-sm">
            Photo uploads are not configured yet. Your existing image is unchanged.
          </p>
          <Button type="button" variant="outline" onClick={() => void capability.refetch()}>
            Check upload availability
          </Button>
        </div>
      ) : (
        <fieldset disabled={disabled || upload.isPending || refreshing} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Choose product photo</span>
            <input
              ref={input}
              type="file"
              disabled={needsRefresh}
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (needsRefresh) return;
                setSaved(false);
                clear();
                if (!next) return;
                if (!capability.data.types.includes(next.type)) {
                  setError("Choose a JPEG, PNG or WebP photo.");
                  return;
                }
                if (!next.size || next.size > Math.min(capability.data.maxBytes, 5 * 1024 * 1024)) {
                  setError("Choose a non-empty photo no larger than 5 MiB.");
                  return;
                }
                setFile(next);
                draft.mark();
                onEditing(true);
              }}
            />
          </label>
          {preview && (
            <div className="w-36">
              <ProductImage src={preview} alt="Selected product photo preview" width={240} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <SaveError error={upload.error} />
          {needsRefresh && (
            <div className="space-y-2">
              <p className="text-sm">
                The saved result is uncertain or the listing changed. Refresh and inspect the saved
                photo before another upload. This discards the local selection after a successful
                refresh.
              </p>
              <Button type="button" variant="outline" onClick={() => void refreshSaved()}>
                Refresh saved photo and listing
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!file || needsRefresh} onClick={() => upload.mutate()}>
              {upload.isPending ? "Uploading photo…" : "Upload and save photo"}
            </Button>
            {file && (
              <Button type="button" variant="outline" disabled={needsRefresh} onClick={clear}>
                Discard selected photo
              </Button>
            )}
          </div>
          {disabled && (
            <p className="text-sm">Save your listing or option changes before uploading a photo.</p>
          )}
        </fieldset>
      )}
    </Panel>
  );
}
