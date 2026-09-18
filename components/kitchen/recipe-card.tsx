"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { RecipeDocument } from "@/lib/kitchen/client";
import { ArrowRight, Bookmark, Clock3, Users } from "lucide-react";
import { DishArt } from "./dish-art";

interface RecipeCardProps {
  recipe: RecipeDocument;
  eyebrow: string;
  serving?: { portions: number; totalMinutes: number };
  actionLabel: string;
  onOpen: () => void;
  saved?: boolean;
  reason?: string;
  mainLabel?: string;
}

/** One presentation for catalogue entries, saved snapshots and discovery results.
 * Callers select the exact authored serving and own navigation/data fetching.
 */
export function RecipeCard({
  recipe,
  eyebrow,
  serving,
  actionLabel,
  onOpen,
  saved = false,
  reason,
  mainLabel,
}: RecipeCardProps) {
  return (
    <article className="min-w-0 h-full">
      <Card data-kitchen-recipe-card className="h-full gap-0 overflow-hidden rounded-2xl py-0 shadow-sm">
        <DishArt recipe={recipe} />
        <CardContent className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">
              {eyebrow}
            </span>
            {recipe.status === "archived" && <Badge variant="outline">Archived</Badge>}
          </div>
          <h2 className="font-serif text-[27px] font-normal leading-tight tracking-[-.035em]">
            <Button
              type="button"
              variant="link"
              className="h-auto max-w-full justify-start whitespace-normal p-0 break-words text-left font-serif text-[27px] font-normal leading-tight tracking-[-.035em] text-foreground hover:underline focus-visible:ring-ring"
              onClick={onOpen}
            >
              {recipe.title}
            </Button>
          </h2>
          <p className="break-words text-sm leading-relaxed text-muted-foreground">
            {recipe.description || "A little room for your own finishing touch."}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-4" aria-hidden="true" />~{serving?.totalMinutes ?? "—"} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-4" aria-hidden="true" />
              {serving?.portions ?? "—"} portions
            </span>
            {mainLabel && <span>{mainLabel}</span>}
          </div>
          {reason && (
            <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{reason}</p>
          )}
        </CardContent>
        <CardFooter className="mt-auto px-6 pb-6">
          <Button
            type="button"
            variant={reason ? "default" : "outline"}
            className="h-11 w-full gap-2 whitespace-normal"
            onClick={onOpen}
          >
            {saved && <Bookmark className="size-4" aria-hidden="true" />}
            {actionLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardFooter>
      </Card>
    </article>
  );
}
