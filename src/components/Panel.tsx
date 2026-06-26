import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card/60 backdrop-blur-xl p-6 ${className}`}
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.04)" }}
    >
      {title && (
        <div className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
