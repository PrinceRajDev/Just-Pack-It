import { useRef } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
export function useDraftGuard() {
  const dirty = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current,
    enableBeforeUnload: () => dirty.current,
    withResolver: true,
  });
  return {
    mark: () => {
      dirty.current = true;
    },
    reset: () => {
      dirty.current = false;
    },
    dialog: (
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button onClick={() => blocker.proceed?.()}>Leave page</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
