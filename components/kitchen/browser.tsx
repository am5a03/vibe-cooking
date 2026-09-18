"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  errorText,
  label,
  type Favourite,
  type Page,
  type Snapshot,
} from "../../lib/kitchen/client";
import { RecipeCard } from "./recipe-card";
import { Empty, ErrorBox, Loading, useKitchen } from "./shared";

export function RecipeBrowser({ saved }: { saved: boolean }) {
  const { entries, go } = useKitchen();
  const [mode, setMode] = useState("");
  const [main, setMain] = useState("");
  const [status, setStatus] = useState("active");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<(Snapshot | Favourite)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  function endpoint(cursor = "") {
    if (saved) return `/favourites?limit=24&after=${encodeURIComponent(cursor)}`;
    const query = new URLSearchParams({ limit: "24", status, after: cursor });
    if (mode) query.set("mode", mode);
    if (main) query.set("main", main);
    if (q) query.set("q", q);
    return `/recipes?${query}`;
  }
  const path = endpoint();
  // A retry starts a new request identity even when its URL is unchanged.
  const request = useMemo(() => ({ path, attempt: retry }), [path, retry]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    setItems([]);
    setNext(null);
    api<Page<Snapshot | Favourite>>(request.path, { signal: abort.signal })
      .then(({ data }) => {
        if (!abort.signal.aborted) {
          setItems(data.items);
          setNext(data.nextAfter);
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [request]);
  async function more() {
    if (!next || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api<Page<Snapshot | Favourite>>(endpoint(next));
      setItems((current) => [...current, ...data.items]);
      setNext(data.nextAfter);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (!busy) setQ(input.trim());
  }
  return (
    <>
      {!saved && (
        <div className="mb-7 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card p-4 [&>[data-slot=native-select-wrapper]]:min-w-0 [&>[data-slot=native-select-wrapper]]:basis-40 [&>[data-slot=native-select-wrapper]]:flex-1">
          <form
            className="flex min-w-0 basis-full items-center gap-2 xl:flex-1 [&>input]:min-w-0 [&>input]:flex-1"
            onSubmit={search}
          >
            <Search className="size-[17px]" aria-hidden="true" />
            <Input
              aria-label="Search recipe titles"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Find a recipe…"
              maxLength={160}
              className="h-11 min-w-0 bg-card md:h-10"
            />
            <Button
              type="submit"
              className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
              disabled={busy}
              variant="outline"
            >
              Search
            </Button>
          </form>
          <NativeSelect
            aria-label="Meal type"
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value)}
            className="h-11 md:h-10"
          >
            <NativeSelectOption value="">All meals</NativeSelectOption>
            <NativeSelectOption value="breakfast">Breakfast</NativeSelectOption>
            <NativeSelectOption value="dinner">Lunch & dinner</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Main ingredient filter"
            value={main}
            disabled={busy}
            onChange={(e) => setMain(e.target.value)}
            className="h-11 md:h-10"
          >
            <NativeSelectOption value="">Any main ingredient</NativeSelectOption>
            {entries.map((entry) => (
              <NativeSelectOption value={entry.id} key={entry.id}>
                {entry.ingredient.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Recipe status"
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 md:h-10"
          >
            <NativeSelectOption value="active">Active recipes</NativeSelectOption>
            <NativeSelectOption value="archived">Archived recipes</NativeSelectOption>
            <NativeSelectOption value="all">All recipes</NativeSelectOption>
          </NativeSelect>
        </div>
      )}
      <ErrorBox message={error} />
      {error && (
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          onClick={() => setRetry((n) => n + 1)}
          variant="outline"
        >
          Retry loading recipes
        </Button>
      )}
      {busy && items.length === 0 ? (
        <Loading label="Loading recipes…" />
      ) : !error && items.length === 0 ? (
        <Empty
          title={saved ? "Save something you look forward to." : "A fresh page in your cookbook."}
        >
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            {saved
              ? "Open a recipe and choose Save this version. It will be waiting here."
              : q || mode || main || status !== "active"
                ? "No recipes match these filters. Try another search or clear the filters."
                : "Your database is connected. Add your first recipe, or import the starter catalogue from the README."}
          </p>
          <Button
            type="button"
            className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
            onClick={() => go(saved ? "discover" : "new")}
            variant="default"
          >
            {saved ? "Explore recipes" : "Add your first recipe"}
            <ArrowRight className="size-[16px]" aria-hidden="true" />
          </Button>
        </Empty>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const isFavourite = "recipeId" in item;
            const id = isFavourite ? item.recipeId : item.id;
            const recipe = item.recipe;
            const portion = isFavourite
              ? recipe.servings.find((s) => s.portions === item.portions)
              : recipe.servings[0];
            const open = () => go(`${isFavourite ? "favourite" : "recipe"}/${id}`);
            return (
              <RecipeCard
                key={id}
                recipe={recipe}
                serving={portion}
                saved={isFavourite}
                onOpen={open}
                eyebrow={
                  isFavourite
                    ? "Saved version"
                    : recipe.mode === "breakfast"
                      ? "A different kind of morning"
                      : "Lunch & dinner"
                }
                mainLabel={label(recipe.main)}
                actionLabel={isFavourite ? "Open saved version" : "Let’s cook"}
              />
            );
          })}
        </div>
      )}
      {next && (
        <div className="mt-8 text-center">
          <Button
            type="button"
            className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
            disabled={busy}
            onClick={more}
            variant="outline"
          >
            {busy ? "Loading…" : "Load more recipes"}
          </Button>
        </div>
      )}
    </>
  );
}
