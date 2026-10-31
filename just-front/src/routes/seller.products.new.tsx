import { createFileRoute } from "@tanstack/react-router";
import { SellerProductForm } from "@/components/portal/SellerProductForm";
export const Route = createFileRoute("/seller/products/new")({
  component: () => <SellerProductForm />,
});
