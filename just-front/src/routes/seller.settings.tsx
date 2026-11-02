import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { shopById } from "@/services/catalog";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import type { FulfilmentMethod } from "@/domain/types";

export const Route = createFileRoute("/seller/settings")({ component: Settings });

function Settings() {
  const shop = shopById("s1")!;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Saved locally: will sync once the backend is connected.");
  };
  return (
    <>
      <UiAttributes>
        <PortalHeader title="Shop settings" />
      </UiAttributes>
      <div className="workspace-settings">
        <form onSubmit={save} className="space-y-4">
          <h2 className="border-b border-foreground pb-2 font-display text-xl">
            <UiText>{"Shop profile"}</UiText>
          </h2>
          <div>
            <Label htmlFor="sn">
              <UiText>{"Shop name"}</UiText>
            </Label>
            <Input id="sn" defaultValue={shop.name} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="st">Tagline</Label>
            <Textarea id="st" defaultValue={shop.tagline} className="mt-1" rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="so">Opens at</Label>
              <Input id="so" type="time" defaultValue="07:00" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sc">Closes at</Label>
              <Input id="sc" type="time" defaultValue="22:00" className="mt-1" />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch defaultChecked={shop.isOpen} /> Accepting orders now
          </label>
          <Button type="submit">
            <UiText>{"Save profile"}</UiText>
          </Button>
        </form>
        <form onSubmit={save} className="space-y-4">
          <h2 className="border-b border-foreground pb-2 font-display text-xl">
            Delivery preferences
          </h2>
          {(["seller_delivery", "platform_delivery", "pickup"] as FulfilmentMethod[]).map((m) => (
            <label
              key={m}
              className="flex items-center justify-between border border-border bg-card p-4 text-sm"
            >
              <span>
                <span className="font-medium">{fulfilmentLabel[m]}</span>
                <span className="block text-muted-foreground">
                  <UiText>
                    {m === "seller_delivery"
                      ? "Your own staff deliver within your radius"
                      : m === "platform_delivery"
                        ? "A Just Pack It rider picks up from you"
                        : "Customer collects from the counter"}
                  </UiText>
                </span>
              </span>
              <Switch defaultChecked={shop.fulfilment.includes(m)} />
            </label>
          ))}
          <div>
            <Label htmlFor="rad">Own delivery radius (km)</Label>
            <Input id="rad" type="number" defaultValue={2} className="mt-1 w-32" />
          </div>
          <Button type="submit">Save preferences</Button>
        </form>
        <section className="space-y-2 text-sm">
          <h2 className="border-b border-foreground pb-2 font-display text-xl">
            Account & support
          </h2>
          <p>
            Need help with orders or payouts? Seller support will be reachable here once connected.
          </p>
          <Button
            variant="outline"
            onClick={() => toast.info("Support requests need the backend.")}
          >
            Contact seller support
          </Button>
        </section>
      </div>
    </>
  );
}
