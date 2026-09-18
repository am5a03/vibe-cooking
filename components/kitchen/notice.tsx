import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Informational content is not an urgent alert. ErrorBox owns live error messages. */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Alert className={cn("my-4 bg-secondary/60 text-foreground", className)}>
      <AlertDescription className="block text-[13px] leading-relaxed text-foreground [&>p]:mt-2 [&>p]:mb-3">
        {children}
      </AlertDescription>
    </Alert>
  );
}
