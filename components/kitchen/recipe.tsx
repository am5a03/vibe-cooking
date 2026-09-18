"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Archive, ArrowLeft, Bookmark, Check, Clock3, Copy, Pencil, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  ClientError,
  errorText,
  label,
  type Favourite,
  type Note,
  type Page,
  type Snapshot,
} from "../../lib/kitchen/client";
import { Notice } from "./notice";
import { RemixPanel } from "./remixes";
import { DishArt, ErrorBox, Field, Loading, useDirty, useKitchen } from "./shared";

async function savedRecipe(id: string, signal: AbortSignal): Promise<Favourite> {
  let cursor = "";
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(cursor)) throw new Error("The server repeated a saved-recipe cursor.");
    visited.add(cursor);
    const { data } = await api<Page<Favourite>>(
      `/favourites?limit=50&after=${encodeURIComponent(cursor)}`,
      { signal },
    );
    const match = data.items.find((item) => item.recipeId === id);
    if (match) return match;
    if (!data.nextAfter)
      throw new ClientError("This saved recipe was removed. Return to My kitchen.", 404);
    cursor = data.nextAfter;
  }
}
export function RecipeDetail({ id, saved }: { id: string; saved: boolean }) {
  const { go, entries, setDirty, discovery } = useKitchen();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [portions, setPortions] = useState(0);
  const [note, setNote] = useState<Note>({ text: "", verdict: "untried" });
  const [initialNote, setInitialNote] = useState("");
  const [noteTag, setNoteTag] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const dirty = initialNote !== "" && JSON.stringify(note) !== initialNote;
  const preferredPortions = discovery?.portions;
  const request = useMemo(
    () => ({ id, saved, attempt: retry, preferredPortions }),
    [id, saved, retry, preferredPortions],
  );
  useDirty(dirty);
  useEffect(() => {
    const abort = new AbortController();
    setSnapshot(null);
    setError("");
    setNotice("");
    setChecked(new Set());
    setNoteTag(null);
    async function load() {
      if (request.saved) {
        const item = await savedRecipe(request.id, abort.signal);
        if (abort.signal.aborted) return;
        setSnapshot({
          id: request.id,
          recipe: item.recipe,
          revision: item.recipeRevision,
          createdAt: item.createdAt,
          updatedAt: item.createdAt,
        });
        setPortions(item.portions);
      } else {
        const result = await api<Snapshot>(`/recipes/${request.id}`, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setSnapshot(result.data);
        setTag(result.tag);
        setPortions(
          result.data.recipe.servings.some(
            (profile) => profile.portions === request.preferredPortions,
          )
            ? (request.preferredPortions ?? 0)
            : (result.data.recipe.servings[0]?.portions ?? 0),
        );
      }
      const result = await api<{ note: Note; revision: number }>(`/recipes/${request.id}/note`, {
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      setNote(result.data.note);
      setInitialNote(JSON.stringify(result.data.note));
      setNoteTag(result.tag);
    }
    load().catch((cause) => {
      if (!abort.signal.aborted) setError(errorText(cause));
    });
    return () => abort.abort();
  }, [request]);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  function reload() {
    if (dirty && !window.confirm("Discard this unsaved note and reload the latest data?")) return;
    setDirty(false);
    setInitialNote("");
    setRetry((n) => n + 1);
  }
  if (!snapshot)
    return (
      <>
        <Button
          type="button"
          className="mb-6 h-auto min-h-9 justify-start gap-2 p-0 text-xs text-muted-foreground"
          onClick={() => go(saved ? "saved" : "discover")}
          variant="ghost"
        >
          <ArrowLeft className="size-[16px]" aria-hidden="true" />
          Back to recipes
        </Button>
        <ErrorBox message={error} />
        {error ? (
          <Button
            type="button"
            className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
            onClick={reload}
            variant="outline"
          >
            Retry
          </Button>
        ) : (
          <Loading label="Loading your recipe…" />
        )}
      </>
    );
  const recipe = snapshot.recipe;
  const serving = recipe.servings.find((profile) => profile.portions === portions);
  const name = (ingredientId: string) =>
    entries.find((entry) => entry.id === ingredientId)?.ingredient.name ?? label(ingredientId);
  async function saveNote() {
    const result = await api<{ note: Note }>(`/recipes/${id}/note`, {
      method: "PUT",
      value: note,
      tag: noteTag,
    });
    setNote(result.data.note);
    setNoteTag(result.tag);
    setInitialNote(JSON.stringify(result.data.note));
    setDirty(false);
    setNotice("Cooking note saved.");
  }
  async function toggleArchive() {
    if (!snapshot) return;
    const result = await api<Snapshot>(
      `/recipes/${id}`,
      recipe.status === "active"
        ? { method: "DELETE", tag }
        : { method: "PUT", tag, value: { ...recipe, status: "active" } },
    );
    setSnapshot(result.data);
    setTag(result.tag);
    setNotice(recipe.status === "active" ? "Recipe archived." : "Recipe restored.");
  }
  return (
    <>
      <Button
        type="button"
        className="mb-6 h-auto min-h-9 justify-start gap-2 p-0 text-xs text-muted-foreground"
        onClick={() => go(saved ? "saved" : "discover")}
        variant="ghost"
      >
        <ArrowLeft className="size-[16px]" aria-hidden="true" />
        {saved ? "Back to My kitchen" : "Back to recipes"}
      </Button>
      <div className="mb-6 max-w-4xl">
        <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
          {saved
            ? "Your saved version"
            : recipe.mode === "breakfast"
              ? "Breakfast"
              : "Lunch & dinner"}{" "}
          · Revision {snapshot.revision} · Draft
        </span>
        <h1 className="mb-4 mt-3 break-words font-serif text-[clamp(34px,4vw,53px)] font-normal leading-[1.15] tracking-[-.035em]">
          {recipe.title}
        </h1>
        <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
          {recipe.description}
        </p>
      </div>
      <ErrorBox message={error} />
      {error && (
        <Button
          type="button"
          className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
          onClick={reload}
          variant="outline"
        >
          Reload latest data
        </Button>
      )}
      <output className="my-3 block text-sm text-primary empty:hidden" style={{ display: "block" }}>
        {notice}
      </output>
      {saved && (
        <Notice>
          You’re viewing the exact version you saved.{" "}
          <Button
            type="button"
            className="h-auto whitespace-normal p-0 text-left text-sm underline"
            onClick={() => go(`recipe/${id}`)}
            variant="link"
          >
            Open the current recipe
          </Button>
        </Notice>
      )}
      {!saved && recipe.status === "active" && (
        <RemixPanel
          key={`${snapshot.id}-${snapshot.revision}-${portions}`}
          source={snapshot}
          portions={portions}
        />
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.12fr] [&>div]:min-w-0">
        <div>
          <DishArt recipe={recipe} large />
          <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7 rounded-t-none border-t-0">
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
              <span>
                <Clock3 className="size-[16px]" aria-hidden="true" />~{serving?.totalMinutes} min
                total
              </span>
              <span>{serving?.activeMinutes} min active</span>
              <span>
                <Users className="size-[16px]" aria-hidden="true" />
                {portions} portions
              </span>
            </div>
            <Field label="Portions">
              <NativeSelect
                value={portions}
                onChange={(e) => {
                  setPortions(Number(e.target.value));
                  setChecked(new Set());
                }}
                className="h-11 md:h-10"
              >
                {recipe.servings.map((s) => (
                  <NativeSelectOption value={s.portions} key={s.portions}>
                    {s.portions} portions
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              Only authored portion sizes are offered; cooking times are not automatically
              multiplied.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!saved && recipe.status === "active" && (
                <Button
                  type="button"
                  className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const result = await api<{ alreadySaved: boolean }>(`/favourites/${id}`, {
                        method: "PUT",
                        value: { recipeRevision: snapshot.revision, portions },
                      });
                      setNotice(
                        result.data.alreadySaved
                          ? "Already saved. The previously saved version and portions were kept."
                          : "Saved this exact version and portion size to My kitchen.",
                      );
                    })
                  }
                  variant="default"
                >
                  <Bookmark className="size-[17px]" aria-hidden="true" />
                  Save this version
                </Button>
              )}
              {saved && (
                <Button
                  type="button"
                  className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Remove this bookmark? The recipe and notes will stay."))
                      action(async () => {
                        await api(`/favourites/${id}`, { method: "DELETE" });
                        go("saved");
                      });
                  }}
                  variant="outline"
                >
                  Remove bookmark
                </Button>
              )}
              {!saved && (
                <>
                  <Button
                    type="button"
                    className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                    disabled={busy}
                    onClick={() => go(`edit/${id}`)}
                    variant="outline"
                  >
                    <Pencil className="size-[16px]" aria-hidden="true" />
                    Edit recipe
                  </Button>
                  <Button
                    type="button"
                    className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                    disabled={busy}
                    onClick={() => go(`duplicate/${id}`)}
                    variant="outline"
                  >
                    <Copy className="size-[16px]" aria-hidden="true" />
                    Make a copy
                  </Button>
                </>
              )}
            </div>
          </Card>
          {recipe.rationale && (
            <section className="my-8 border-l-2 border-primary/30 pl-5">
              <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                Why this combination works
              </span>
              <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                {recipe.rationale}
              </p>
            </section>
          )}
          <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
              Make a note for next time.
            </h2>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              Your cooking note belongs to this recipe, across all its versions.
            </p>
            <Field label="Your cooking note">
              <Textarea
                disabled={busy || !noteTag}
                rows={4}
                maxLength={12000}
                value={note.text}
                onChange={(e) => setNote({ ...note, text: e.target.value })}
                placeholder="A little more ginger. A crispier finish…"
                className="min-w-0 resize-y bg-card field-sizing-fixed"
              />
            </Field>
            <Field label="Would you cook it again?">
              <NativeSelect
                disabled={busy || !noteTag}
                value={note.verdict}
                onChange={(e) => setNote({ ...note, verdict: e.target.value as Note["verdict"] })}
                className="h-11 md:h-10"
              >
                <NativeSelectOption value="untried">Not cooked yet</NativeSelectOption>
                <NativeSelectOption value="repeat">Definitely repeat</NativeSelectOption>
                <NativeSelectOption value="adjust">Try with adjustments</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button
              type="button"
              className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
              disabled={busy || !noteTag || !dirty}
              onClick={() => action(saveNote)}
              variant="default"
            >
              <Check className="size-[16px]" aria-hidden="true" />
              Save note
            </Button>
            {dirty && <span className="ml-3 text-xs text-destructive">Unsaved changes</span>}
          </Card>
        </div>
        <div>
          {serving && (
            <>
              <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
                <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                  Everything in its place
                </span>
                <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                  Ingredients
                </h2>
                <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                  For {portions} portions. Ticks are a temporary cooking checklist.
                </p>
                {serving.ingredients.map((line, index) => (
                  <Label
                    className={cn(
                      "ingredient-check flex w-full items-start gap-3 border-b py-3 text-sm font-normal leading-relaxed last:border-0 [&>span:first-of-type]:min-w-0 [&>span:first-of-type]:flex-1 [&_small]:block",
                      checked.has(index) && "[&>span]:text-muted-foreground [&>span]:line-through",
                    )}
                    key={`${index}-${line.ingredientId}`}
                  >
                    <Checkbox
                      checked={checked.has(index)}
                      onCheckedChange={() =>
                        setChecked((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                      className="mt-0.5 size-[18px] shrink-0"
                    />
                    <span>
                      <strong>{name(line.ingredientId)}</strong>
                      {line.preparation && (
                        <small className="text-xs text-muted-foreground">{line.preparation}</small>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums">
                      {line.quantity} {line.unit}
                    </span>
                  </Label>
                ))}
              </Card>
              <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
                <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                  One step at a time
                </span>
                <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                  Let’s cook.
                </h2>
                <p className="mb-5 rounded-lg bg-secondary p-4 text-xs">
                  {serving.equipment.map(label).join(" · ")}
                  <br />
                  {serving.capacity}
                </p>
                <ol className="my-6 flex list-none flex-col gap-6 p-0 [&>li]:flex [&>li]:items-start [&>li]:gap-4 [&>li>div]:min-w-0 [&_p]:mb-0 [&_p]:whitespace-pre-line [&_p]:leading-relaxed">
                  {serving.steps.map((step, index) => (
                    <li key={`${index}-${step.title}`}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-serif text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="mb-1 break-words text-base font-semibold">{step.title}</h3>
                        <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                          {step.instruction}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          )}
          {(recipe.prepNote || recipe.storageNote || recipe.safetyNotes.length > 0) && (
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7 bg-secondary/50">
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Plan ahead.
              </h2>
              {recipe.prepNote && (
                <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                  {recipe.prepNote}
                </p>
              )}
              {recipe.storageNote && (
                <>
                  <h3 className="mb-1 break-words text-base font-semibold">Storage & reheating</h3>
                  <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                    {recipe.storageNote}
                  </p>
                </>
              )}
              {recipe.safetyNotes.map((text) => (
                <p
                  key={text}
                  className="mb-5 break-words text-sm leading-relaxed text-muted-foreground"
                >
                  {text}
                </p>
              ))}
            </Card>
          )}
          <div className="break-words px-1 pb-5 text-xs text-muted-foreground [&>strong]:text-[10px] [&>strong]:uppercase [&>strong]:tracking-wider [&>p]:mt-2">
            <strong>Recipe draft · Not kitchen-tested</strong>
            <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
              {recipe.source ||
                "Personal recipe. Review ingredients and cooking instructions before using."}
            </p>
          </div>
          {!saved && (
            <Button
              type="button"
              className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
              disabled={busy || !tag}
              onClick={() => {
                if (
                  window.confirm(
                    recipe.status === "active"
                      ? "Archive this recipe? It will leave the active list; history and bookmarks stay."
                      : "Restore this recipe to the active list?",
                  )
                )
                  action(toggleArchive);
              }}
              variant="ghost"
            >
              <Archive className="size-[16px]" aria-hidden="true" />
              {recipe.status === "active" ? "Archive recipe" : "Restore recipe"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
