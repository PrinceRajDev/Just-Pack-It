import { UiText } from "@/lib/i18n/Language";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-panel", className)}>
      {(title || description || actions) && (
        <div className="surface-panel-heading">
          <div>
            {title && (
              <h2>
                <UiText>{title}</UiText>
              </h2>
            )}
            {description && <p>{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
