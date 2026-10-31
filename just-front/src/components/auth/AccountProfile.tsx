import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authentication, type AccountProfile as Profile } from "@/services/auth";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserRound } from "lucide-react";
export function AccountProfile() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["account-profile", session?.userId],
    queryFn: authentication.profile,
    retry: false,
  });
  if (query.isPending) return <p role="status">Loading profile…</p>;
  if (query.isError)
    return (
      <div role="alert">
        Could not load profile.{" "}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry profile
        </Button>
      </div>
    );
  return <ProfileForm key={query.data.version} profile={query.data} />;
}
function ProfileForm({ profile }: { profile: Profile }) {
  const { name: original, version } = profile,
    [name, setName] = useState(original),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    client = useQueryClient(),
    auth = useAuth();
  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await authentication.updateProfile(name.trim(), version);
      await auth.refreshProfile();
      client.setQueryData(["account-profile", auth.session?.userId], saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile. Reload before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 space-y-3 rounded-xl border p-4" aria-label="Account profile">
      <h2 className="account-card-heading font-display text-2xl">
        <span>
          <UserRound size={21} aria-hidden="true" />
        </span>
        Your profile
      </h2>
      <p className="text-sm">Phone: {profile.phone}</p>
      {profile.email && (
        <p className="break-words text-sm">
          Email: {profile.email} · {profile.emailVerified ? "Verified" : "Not verified"}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Phone and email changes need verification and are not available here.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm">
          Your name
          <Input
            required
            minLength={2}
            maxLength={100}
            value={name}
            disabled={busy}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button disabled={busy || name.trim().length < 2 || name.trim() === original}>
          {busy ? "Saving profile…" : "Save profile"}
        </Button>
      </form>
      {error && <p role="alert">{error} Reload the latest profile before retrying.</p>}
      <p className="text-sm text-muted-foreground">Saved name: {original}</p>
    </section>
  );
}
