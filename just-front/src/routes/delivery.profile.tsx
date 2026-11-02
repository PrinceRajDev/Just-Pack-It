import { createFileRoute } from "@tanstack/react-router";
import { AccountProfile } from "@/components/auth/AccountProfile";
export const Route = createFileRoute("/delivery/profile")({ component: AccountProfile });
