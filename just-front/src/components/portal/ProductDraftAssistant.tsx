import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { productDraft, type ProductDraft } from "@/services/product-draft";
import { Button } from "@/components/ui/button";
export function ProductDraftAssistant({
  file,
  onApply,
  disabled = false,
}: {
  file: File | null;
  disabled?: boolean;
  onApply: (draft: ProductDraft) => void;
}) {
  const capability = useQuery({
    queryKey: ["product-draft-capability"],
    queryFn: productDraft.capability,
    retry: false,
  });
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [controller, setController] = useState<AbortController>();
  useEffect(() => () => controller?.abort(), [controller]);
  useEffect(() => {
    setDraft(null);
    setError("");
  }, [file]);
  if (!capability.data?.enabled) return null;
  return (
    <section className="seller-ai-assistant mt-4 space-y-3" aria-label="AI product assistant">
      <h3 className="font-semibold">A little help with the writing</h3>
      <p className="text-sm text-muted-foreground">
        Let Gemini suggest a name and description from your photo. Your photo is sent to Google only
        when you ask. Review before applying; you set the price and stock.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={!file || busy || disabled}
        onClick={async () => {
          if (!file || busy || disabled) return;
          const abort = new AbortController();
          setController(abort);
          setBusy(true);
          setError("");
          setDraft(null);
          try {
            const result = await productDraft.generate(file, abort.signal);
            if (!abort.signal.aborted) setDraft(result);
          } catch (cause) {
            if (!abort.signal.aborted)
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not generate details. Fill them manually.",
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading your photo..." : "AI se details bharo"}
      </Button>
      {!file && <p className="text-sm">Choose a product photo first.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {draft && (draft.name.trim() || draft.description.trim() || draft.unit.trim()) ? (
        <div className="space-y-2" aria-live="polite">
          <p className="font-medium">Suggested draft: check every detail</p>
          <p>{draft.name || "Product not identified"}</p>
          <p>{draft.description}</p>
          <p>{draft.unit}</p>
          <Button
            type="button"
            disabled={disabled}
            onClick={() => {
              onApply(draft);
              setDraft(null);
            }}
          >
            Fill empty fields with this draft
          </Button>
        </div>
      ) : draft ? (
        <p role="status" className="text-sm">
          No product details identified. Try a clear photo of the actual product or its packaging,
          rather than an icon or illustration. You can also fill the form manually.
        </p>
      ) : null}
    </section>
  );
}
