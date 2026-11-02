import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "./states";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
export function Phase1Unavailable({ title = "Ordering is not available yet" }: { title?: string }) {
  const { session, signOut } = useAuth();
  return (
    <StoreLayout>
      <UiAttributes>
        <PageTitle title={title} />
      </UiAttributes>
      <div className="mx-auto max-w-7xl px-4">
        <UiAttributes>
          <EmptyState
            title="Catalogue preview"
            body="You can browse shops and products. This feature will open after the next backend integration step."
            action={
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/categories" className="text-primary underline">
                  <UiText>{"Explore categories"}</UiText>
                </Link>
                {session && (
                  <Button variant="outline" onClick={() => void signOut()}>
                    <UiText>{"Sign out"}</UiText>
                  </Button>
                )}
              </div>
            }
          />
        </UiAttributes>
      </div>
    </StoreLayout>
  );
}
