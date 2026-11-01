import { Wallet, Banknote, Store, RotateCcw, ShieldCheck, ChevronRight } from "lucide-react";
import { imageUrl } from "@/lib/image";
import { SettlementLedger } from "./SettlementLedger";
import { Reconciliation } from "./AdminWorkspace";
import { AdminPayments } from "./AdminPayments";
import "@/styles/admin-finance.css";

export function AdminFinance() {
  return (
    <div className="admin-finance">
      <header className="finance-hero">
        <div>
          <nav aria-label="Breadcrumb">
            OPERATIONS <ChevronRight size={13} /> <b>PAYMENTS &amp; REFUNDS</b>
          </nav>
          <h1>Payments &amp; refunds</h1>
          <p>
            Track payments, cash collections and seller settlements. Keep your marketplace
            transparent, accurate and trusted.
          </p>
        </div>
        <div className="finance-hero-art">
          <img src={imageUrl("/admin-finance-hero-v1.webp")} alt="" />
          <aside>
            <ShieldCheck />
            <h2>
              Transparent payments.
              <br />
              Trusted neighbourhoods.
            </h2>
            <p>Keep every transaction accurate and fair for local businesses.</p>
          </aside>
        </div>
      </header>
      <section className="finance-metrics" aria-label="Financial overview">
        {[
          { title: "Captured online payments", icon: Wallet },
          { title: "Recorded COD collections", icon: Banknote },
          { title: "Recorded seller payouts", icon: Store },
          { title: "Processed refunds", icon: RotateCcw },
        ].map(({ title, icon: Icon }) => (
          <article key={title}>
            <Icon aria-hidden="true" />
            <div>
              <p>{title}</p>
              <strong>N/A</strong>
              <small>Global reporting unavailable</small>
            </div>
          </article>
        ))}
      </section>
      <p className="finance-report-note">
        The APIs provide paginated records, not platform-wide totals. Pending collections, requested
        refunds and prepared payouts are never counted as completed money movements.
      </p>
      <SettlementLedger adminLayout />
      <AdminPayments />
      <Reconciliation />
    </div>
  );
}
