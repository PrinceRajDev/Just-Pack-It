import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ManagedShop } from "@/domain/management";
import { ShopPhotoPicker } from "@/components/common/ShopPhotoPicker";
import { shopImages } from "@/services/shop-images";
import { Button } from "@/components/ui/button";
import { imageUrl } from "@/lib/image";
import { useDraftGuard } from "./useDraftGuard";
export function ShopPhotoUpload({
  shop,
  disabled,
  onEditing,
}: {
  shop: ManagedShop;
  disabled: boolean;
  onEditing: (editing: boolean) => void;
}) {
  const draft = useDraftGuard();
  const [file, setFile] = useState<File | null>(null),
    client = useQueryClient();
  const upload = useMutation({
    mutationFn: () => shopImages.upload(shop, file!),
    onSuccess: async () => {
      draft.reset();
      onEditing(false);
      setFile(null);
      await client.invalidateQueries({ queryKey: ["seller-shop"] });
      await client.invalidateQueries({ queryKey: ["shops"] });
    },
  });
  return (
    <UiAttributes>
      <section className="space-y-3" aria-label="Shop photo upload">
        {draft.dialog}
        {disabled && (
          <p className="text-sm">Save your profile changes before changing the shop photo.</p>
        )}
        {shop.coverImage && (
          <img
            src={imageUrl(shop.coverImage, { width: 600 })}
            alt={`${shop.name} current shop photo`}
            className="max-h-48 rounded-lg object-contain"
          />
        )}
        <ShopPhotoPicker
          file={file}
          disabled={upload.isPending || disabled}
          onChange={(next) => {
            setFile(next);
            onEditing(!!next);
            if (next) draft.mark();
            else draft.reset();
            upload.reset();
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!file || upload.isPending || disabled}
          onClick={() => upload.mutate()}
        >
          <UiText>{upload.isPending ? "Uploading shop photo…" : "Save shop photo"}</UiText>
        </Button>
        {upload.isError && (
          <div role="alert" className="text-sm">
            <p>{upload.error.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => client.invalidateQueries({ queryKey: ["seller-shop"] })}
            >
              Reload saved shop before retry
            </Button>
          </div>
        )}
        {upload.isSuccess && (
          <p role="status" className="text-sm">
            Shop photo saved for admin review.
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
