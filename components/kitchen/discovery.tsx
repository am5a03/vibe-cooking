"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorText, label, type Preferences } from "../../lib/kitchen/client";
import type { DiscoveryConstraints, DiscoveryResult } from "../../lib/kitchen/exploration-client";
import { Notice } from "./notice";
import { useFlavors } from "./flavor-context";
import { flavorName } from "../../lib/kitchen/flavors";
import { RecipeCard } from "./recipe-card";
import { ErrorBox, Field, Loading, useKitchen } from "./shared";

export function Discovery() {
  const flavors = useFlavors();
  const { entries, go, discovery, setDiscovery } = useKitchen();
  const [filters, setFilters] = useState<DiscoveryConstraints>(
    discovery ?? { mode: "dinner", portions: 3, maxMinutes: null, requiredIngredient: null },
  );
  const [defaults, setDefaults] = useState<Preferences | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<
    (DiscoveryConstraints & { seen: string[]; seed: string }) | null
  >(null);
  const seen = useRef<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const name = (id: string) =>
    entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  useEffect(() => {
    const abort = new AbortController();
    api<{ preferences: Preferences }>("/preferences", { signal: abort.signal })
      .then(({ data }) => {
        if (abort.signal.aborted) return;
        setDefaults(data.preferences);
        const initial = discovery ?? {
          mode: "dinner" as const,
          portions: data.preferences.defaultDinnerPortions,
          maxMinutes: data.preferences.maxMinutes,
          requiredIngredient: null,
        };
        setFilters(initial);
        setSelection({ ...initial, seen: [], seed: crypto.randomUUID() });
        setReady(true);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [discovery]);
  // Explicit submission replaces the result set; edits invalidate previews immediately.
  useEffect(() => {
    if (!selection) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setBusy(true);
    setError("");
    setResult(null);
    api<DiscoveryResult>("/discover", { method: "POST", value: selection, signal: request.signal })
      .then(({ data }) => {
        if (request.signal.aborted) return;
        setResult(data);
        seen.current = [
          ...new Set([...data.items.map((item) => item.snapshot.id), ...seen.current]),
        ].slice(0, 60);
      })
      .catch((cause) => {
        if (!request.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [selection]);
  function change<K extends keyof DiscoveryConstraints>(key: K, value: DiscoveryConstraints[K]) {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!ready || busy) return;
    seen.current = [];
    setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() });
  }
  function open(id: string) {
    if (!result) return;
    setDiscovery(result.constraints);
    go(`recipe/${id}`);
  }
  return (
    <>
      <div className="mb-7 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            A familiar anchor. A fresh idea.
          </span>
          <h1 className="mb-4 mt-3 break-words font-serif text-[clamp(34px,4vw,53px)] font-normal leading-[1.15] tracking-[-.035em]">
            What sounds <em className="font-normal text-[#6f805b]">good?</em>
          </h1>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            Three possibilities from your kitchen. Pick a dish, then explore what it could become.
          </p>
        </div>
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          onClick={() => go("all")}
          variant="outline"
        >
          Browse all recipes
          <ArrowRight className="size-[16px]" aria-hidden="true" />
        </Button>
      </div>
      <form onSubmit={submit}>
        <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
          <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-[1fr_.6fr_.8fr_1.4fr]">
            <Field label="Meal">
              <NativeSelect
                disabled={!ready || busy}
                value={filters.mode}
                onChange={(event) => {
                  const mode = event.target.value as DiscoveryConstraints["mode"];
                  controller.current?.abort();
                  setResult(null);
                  seen.current = [];
                  setFilters({
                    ...filters,
                    mode,
                    portions:
                      mode === "breakfast"
                        ? (defaults?.defaultBreakfastPortions ?? 1)
                        : (defaults?.defaultDinnerPortions ?? 3),
                  });
                }}
                className="h-11 md:h-10"
              >
                <NativeSelectOption value="dinner">Lunch & dinner</NativeSelectOption>
                <NativeSelectOption value="breakfast">Breakfast</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Discovery portions">
              <Input
                disabled={!ready || busy}
                type="number"
                min={1}
                max={20}
                required
                value={filters.portions || ""}
                onChange={(event) => change("portions", Number(event.target.value))}
                className="h-11 min-w-0 bg-card md:h-10"
              />
            </Field>
            <Field label="Maximum minutes">
              <Input
                disabled={!ready || busy}
                type="number"
                min={1}
                max={2880}
                placeholder="Any time"
                value={filters.maxMinutes ?? ""}
                onChange={(event) =>
                  change("maxMinutes", event.target.value ? Number(event.target.value) : null)
                }
                className="h-11 min-w-0 bg-card md:h-10"
              />
            </Field>
            <Field label="Include an ingredient">
              <NativeSelect
                disabled={!ready || busy}
                value={filters.requiredIngredient ?? ""}
                onChange={(event) => change("requiredIngredient", event.target.value || null)}
                className="h-11 md:h-10"
              >
                <NativeSelectOption value="">Anything sounds good</NativeSelectOption>
                {entries.map((entry) => (
                  <NativeSelectOption key={entry.id} value={entry.id}>
                    {entry.ingredient.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="mt-2 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center [&>p]:mb-0 [&>p]:max-w-2xl [&>button]:w-full sm:[&>button]:w-auto">
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              Your exclusions always apply here, including recorded sauce components. Required
              ingredients must be a main, base, vegetable or fruit—not just a garnish.
            </p>
            <Button
              type="submit"
              className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
              disabled={!ready || busy}
              variant="default"
            >
              <Sparkles className="size-[17px]" aria-hidden="true" />
              {busy ? "Finding ideas…" : "Find meal ideas"}
            </Button>
          </div>
        </Card>
      </form>
      <ErrorBox message={error} />
      {error && (
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          onClick={() =>
            ready
              ? setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() })
              : window.location.reload()
          }
          variant="outline"
        >
          Retry discovery
        </Button>
      )}
      {(!ready && !error) || busy ? (
        <Loading label="Finding meal ideas…" />
      ) : result ? (
        <>
          <div className="mb-4 mt-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                Your tasting menu
              </span>
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                {result.items.length
                  ? "Start with something appealing."
                  : "Let’s try another direction."}
              </h2>
            </div>
            <span>
              {result.eligibleCount} matching {result.eligibleCount === 1 ? "recipe" : "recipes"}
            </span>
          </div>
          <div className="mb-6 mt-4 flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal break-words text-xs font-normal"
            >
              {result.constraints.portions} portions
            </Badge>
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal break-words text-xs font-normal"
            >
              {result.constraints.maxMinutes
                ? `Up to ${result.constraints.maxMinutes} minutes`
                : "Any cooking time"}
            </Badge>
            {result.constraints.requiredIngredient && (
              <span>Includes {name(result.constraints.requiredIngredient)}</span>
            )}
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal break-words text-xs font-normal"
            >
              {result.excludedIngredientIds.length
                ? `Excluding: ${result.excludedIngredientIds.map(name).join(", ")}`
                : "No saved exclusions"}
            </Badge>
          </div>
          {result.items.length === 0 ? (
            <Card className="rounded-xl border-dashed bg-card/70 py-14 text-center [&>p]:mx-auto [&>p]:max-w-lg">
              <h3 className="mb-1 break-words text-base font-semibold">
                No recipes match all your choices.
              </h3>
              <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                Try another portion size, time limit or required ingredient. Exclusions have not
                been relaxed.
              </p>
              <Button
                type="button"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                onClick={() => go("all")}
                variant="outline"
              >
                Open all recipes to edit your catalogue
              </Button>
            </Card>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {result.items.map(({ snapshot, liked, repeated }) => {
                const serving = snapshot.recipe.servings.find(
                  (profile) => profile.portions === result.constraints.portions,
                );
                return (
                  <RecipeCard
                    key={snapshot.id}
                    recipe={snapshot.recipe}
                    serving={serving}
                    onOpen={() => open(snapshot.id)}
                    eyebrow={`${flavorName(snapshot.recipe.flavor, flavors.entries)} · ${label(snapshot.recipe.method)}`}
                    actionLabel="Explore this dish"
                    reason={`${liked.length ? `Includes ingredients you like: ${liked.map(name).join(", ")}.` : "A match for your current choices."}${repeated ? " Shown recently." : ""}`}
                  />
                );
              })}
            </div>
          )}
          {(result.invalidCount > 0 || result.counts["incomplete-ingredients"]) && (
            <Notice>
              Some recipes have incomplete definitions and were not suggested. Review them in All
              recipes.
            </Notice>
          )}
          {result.items.length > 0 && (
            <div className="my-8 text-center [&>p]:mx-auto [&>p]:mt-3 [&>p]:max-w-xl">
              <Button
                type="button"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                disabled={busy}
                onClick={() =>
                  setSelection({ ...filters, seen: seen.current, seed: crypto.randomUUID() })
                }
                variant="outline"
              >
                <RefreshCw className="size-[16px]" aria-hidden="true" />
                Show other ideas
              </Button>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                {result.repeatedCount
                  ? "Some familiar dishes returned because the matching selection is small."
                  : "Previously shown dishes move behind alternatives when alternatives exist."}{" "}
                No recipes are generated or changed.
              </p>
            </div>
          )}
        </>
      ) : (
        ready &&
        !error && (
          <Notice>Your choices changed. Select Find meal ideas to update your suggestions.</Notice>
        )
      )}
    </>
  );
}
