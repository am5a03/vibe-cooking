"use client";

import { BookOpen, Bookmark, Leaf, LockKeyhole, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { route: "discover", label: "Discover", icon: Sparkles },
  { route: "all", label: "All recipes", icon: BookOpen },
  { route: "saved", label: "My kitchen", icon: Bookmark },
  { route: "preferences", label: "Preferences", icon: SlidersHorizontal },
] as const;

interface KitchenHeaderProps {
  view: string;
  unlocked: boolean;
  locking: boolean;
  onNavigate: (route: string) => void;
  onLock: () => void;
}

export function KitchenHeader({ view, unlocked, locking, onNavigate, onLock }: KitchenHeaderProps) {
  return (
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b px-5 py-[18px] sm:px-6 lg:flex-nowrap lg:gap-6 lg:px-10 lg:py-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onNavigate("discover")}
        aria-label="Vibe Cooking home"
        className="h-auto shrink-0 justify-start gap-3 rounded-md p-0 text-left hover:bg-transparent"
      >
        <span className="grid h-11 w-[42px] -rotate-[5deg] place-items-center rounded-[12px_12px_12px_3px] bg-primary text-primary-foreground">
          <Leaf className="size-6" aria-hidden="true" />
        </span>
        <span className="text-[21px] font-bold leading-tight text-foreground sm:text-[23px]">
          Vibe Cooking
          <span className="mt-0.5 block text-[9px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
            The personal kitchen
          </span>
        </span>
      </Button>
      {unlocked && (
        <>
          <nav
            aria-label="Main navigation"
            className="order-3 grid w-full grid-cols-4 gap-1 lg:order-none lg:flex lg:w-auto lg:gap-2"
          >
            {navigation.map(({ route, label, icon: Icon }) => (
              <Button
                key={route}
                type="button"
                variant="ghost"
                aria-current={view === route ? "page" : undefined}
                onClick={() => onNavigate(route)}
                className={cn(
                  "h-auto min-h-11 min-w-0 flex-col gap-1 px-1 py-2 text-[11px] font-normal sm:flex-row sm:gap-2 sm:px-2 sm:text-xs lg:text-[13px]",
                  view === route
                    ? "bg-secondary font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-[17px]" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </nav>
          <Button
            type="button"
            variant="outline"
            onClick={onLock}
            disabled={locking}
            aria-busy={locking}
            className="h-11 shrink-0 gap-2 bg-transparent px-3 text-xs text-primary"
          >
            <LockKeyhole className="size-4" aria-hidden="true" />
            {locking ? "Locking…" : "Lock"}
          </Button>
        </>
      )}
    </header>
  );
}
