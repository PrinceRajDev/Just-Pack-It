import { createFileRoute } from "@tanstack/react-router";
import { Tasks } from "./delivery.index";
export const Route = createFileRoute("/delivery/tasks")({ component: Tasks });
