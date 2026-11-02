import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSeller } from "@/stores/seller";
import { SellerProductForm } from "@/components/portal/SellerProductForm";
import { EmptyState } from "@/components/common/states";
export const Route = createFileRoute("/seller/products/$id/edit")({ component: EditProduct });
function EditProduct() {
  const { id } = Route.useParams();
  const { products } = useSeller();
  const product = products.find((p) => p.id === id);
  if (!product)
    return (
      <UiAttributes>
        <EmptyState
          title="Listing not found in your shop"
          body="It may have been removed, or belongs to another shop."
          action={
            <Link to="/seller/products" className="text-primary underline">
              <UiText>{"Back to products"}</UiText>
            </Link>
          }
        />
      </UiAttributes>
    );
  return <SellerProductForm key={product.id} product={product} />;
}
