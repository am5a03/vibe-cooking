"use client";
import { useConfirm } from "./confirmation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorText, label } from "../../lib/kitchen/client";
import { compareServings } from "../../lib/kitchen/exploration";
import type {
  MealSnapshot,
  RemixResult,
  VariationCandidate,
  VariationConnection,
  VariationsResult,
} from "../../lib/kitchen/exploration-client";
import { Notice } from "./notice";
import { ErrorBox, Field, Loading, useKitchen } from "./shared";

function axisName(axis: string, breakfast = false) {
  return axis === "main"
    ? "Main ingredient"
    : axis === "flavor"
      ? "Flavour"
      : breakfast
        ? "Breakfast format"
        : "Technique";
}
export function Comparison({
  source,
  target,
  portions,
}: { source: MealSnapshot; target: MealSnapshot; portions: number }) {
  const { entries } = useKitchen();
  const before = source.recipe.servings.find((profile) => profile.portions === portions);
  const after = target.recipe.servings.find((profile) => profile.portions === portions);
  if (!before || !after)
    return <Notice>Both recipes need an authored profile for {portions} portions.</Notice>;
  const differences = compareServings(before, after);
  const name = (id: string) =>
    entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="min-w-0 gap-0 rounded-xl border-0 bg-secondary/35 p-5 shadow-none last:bg-secondary/70">
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            The familiar starting point
          </span>
          <h3 className="mb-1 break-words text-base font-semibold">{source.recipe.title}</h3>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            {portions} portions · ~{before.totalMinutes} min total · {before.activeMinutes} min
            active
          </p>
          <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
            {before.equipment.map(label).join(" · ")}
            <br />
            {before.capacity}
          </p>
        </Card>
        <Card className="min-w-0 gap-0 rounded-xl border-0 bg-secondary/35 p-5 shadow-none last:bg-secondary/70">
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            Something a little different
          </span>
          <h3 className="mb-1 break-words text-base font-semibold">{target.recipe.title}</h3>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            {portions} portions · ~{after.totalMinutes} min total · {after.activeMinutes} min active
          </p>
          <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
            {after.equipment.map(label).join(" · ")}
            <br />
            {after.capacity}
          </p>
        </Card>
      </div>
      <div className="my-6 grid grid-cols-1 gap-4 border-y py-5 sm:grid-cols-3 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-2 [&>div]:text-sm">
        {(["main", "flavor", "method"] as const).map((axis) => (
          <div key={axis}>
            <strong>{axisName(axis, source.recipe.mode === "breakfast")}</strong>
            <span>
              {label(source.recipe[axis])}
              {source.recipe[axis] === target.recipe[axis]
                ? " · kept"
                : ` → ${label(target.recipe[axis])}`}
            </span>
          </div>
        ))}
      </div>
      <h4 className="mb-3 text-sm font-semibold">Ingredients: what stays, what changes</h4>
      <ul className="mb-6 list-none p-0 [&>li]:flex [&>li]:items-start [&>li]:gap-3 [&>li]:border-b [&>li]:py-3 [&>li>div]:min-w-0 [&_p]:my-1 [&_p]:break-words [&_small]:ml-2">
        {differences.map((item) => (
          <li
            key={`${item.ingredientId}-${item.role}`}
            data-change={item.kind}
          >
            <Badge className="shrink-0 text-[10px] uppercase" variant="secondary">
              {label(item.kind)}
            </Badge>
            <div>
              <strong>{name(item.ingredientId)}</strong>
              <small className="text-xs text-muted-foreground">{label(item.role)}</small>
              <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                {item.before
                  .map(
                    (line) =>
                      `${line.quantity} ${line.unit}${line.preparation ? ` (${line.preparation})` : ""}`,
                  )
                  .join(" + ")}
                {item.kind !== "kept" && " → "}
                {item.kind !== "kept" &&
                  (item.after.length
                    ? item.after
                        .map(
                          (line) =>
                            `${line.quantity} ${line.unit}${line.preparation ? ` (${line.preparation})` : ""}`,
                        )
                        .join(" + ")
                    : "Not used")}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Collapsible className="my-6 rounded-xl border p-4">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal p-0 text-left text-base font-semibold"
          >
            Compare complete cooking steps
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[before, after].map((profile, index) => (
              <section
                className="min-w-0 rounded-lg bg-secondary/40 p-4"
                key={index === 0 ? "source" : "target"}
              >
                <h4 className="mb-3 text-sm font-semibold">
                  {index === 0 ? "Original" : "Alternative"}
                </h4>
                <ol className="list-decimal space-y-4 pl-5">
                  {profile.steps.map((step, order) => (
                    <li key={`${order}-${step.title}`}>
                      <strong>{step.title}</strong>
                      <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                        {step.instruction}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        The alternative has its own complete instructions. This comparison does not rewrite or
        automatically scale either recipe.
      </p>
    </div>
  );
}

export function RemixPanel({ source, portions }: { source: MealSnapshot; portions: number }) {
  const { go, discovery, setDiscovery, entries } = useKitchen();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RemixResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(
    () => ({
      open,
      sourceId: source.id,
      sourceRevision: source.revision,
      mode: source.recipe.mode,
      portions,
      discovery,
      attempt,
    }),
    [open, source.id, source.revision, source.recipe.mode, portions, discovery, attempt],
  );
  useEffect(() => {
    if (!request.open) return;
    const abort = new AbortController();
    setBusy(true);
    setResult(null);
    setSelected(null);
    setError("");
    api<RemixResult>(`/recipes/${request.sourceId}/remix-options`, {
      method: "POST",
      signal: abort.signal,
      value: {
        sourceRevision: request.sourceRevision,
        mode: request.mode,
        portions: request.portions,
        ...(request.discovery
          ? {
              maxMinutes: request.discovery.maxMinutes,
              requiredIngredient: request.discovery.requiredIngredient,
            }
          : {}),
      },
    })
      .then(({ data }) => {
        if (!abort.signal.aborted) setResult(data);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [request]);
  const current = result?.items.find((item) => item.connectionId === selected);
  const name = (id: string) =>
    entries.find((entry) => entry.id === id)?.ingredient.name ?? label(id);
  return (
    <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7 my-6">
      <div className="flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            Recipe remix
          </span>
          <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
            Keep the anchor. <em className="font-normal text-[#6f805b]">Change the experience.</em>
          </h2>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            Preview a reviewed variation before choosing it.
          </p>
        </div>
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          variant="default"
        >
          <Sparkles className="size-[17px]" aria-hidden="true" />
          {open ? "Close variations" : "Explore variations"}
        </Button>
      </div>
      {open && (
        <>
          <ErrorBox message={error} />
          {error && (
            <Button
              type="button"
              className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
              onClick={() => setAttempt((value) => value + 1)}
              variant="outline"
            >
              Retry variations
            </Button>
          )}
          {busy ? (
            <Loading label="Loading recipe variations…" />
          ) : (
            result && (
              <>
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
                {result.blockedSource ? (
                  <Notice>
                    This starting recipe does not meet your current discovery choices (
                    {label(result.blockedSource)}). It remains available to edit, but no
                    alternatives are recommended under these constraints.
                  </Notice>
                ) : result.items.length === 0 ? (
                  <Notice>
                    No reviewed variations match these choices yet. You can review and connect
                    recipes through Manage variations.
                  </Notice>
                ) : (
                  <div className="my-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {result.items.map((item) => (
                      <Button
                        type="button"
                        key={item.connectionId}
                        className="h-auto min-h-32 min-w-0 flex-col items-start justify-start gap-3 whitespace-normal rounded-xl p-5 text-left font-normal aria-pressed:border-primary aria-pressed:bg-secondary [&>strong]:font-serif [&>strong]:text-xl [&>span:last-child]:inline-flex [&>span:last-child]:items-center [&>span:last-child]:gap-2 [&>span:last-child]:text-xs"
                        aria-pressed={selected === item.connectionId}
                        onClick={() => setSelected(item.connectionId)}
                        variant="outline"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                          Change{" "}
                          {axisName(item.axis, source.recipe.mode === "breakfast").toLowerCase()}
                        </span>
                        <strong>{item.target.recipe.title}</strong>
                        <span>
                          Preview the difference
                          <ArrowRight className="size-[14px]" aria-hidden="true" />
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
                {current && (
                  <div className="mt-5 border-t pt-5">
                    <Comparison
                      source={result.source}
                      target={current.target}
                      portions={portions}
                    />
                    <Button
                      type="button"
                      className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                      onClick={() => {
                        setDiscovery(result.constraints);
                        go(`recipe/${current.target.id}`);
                      }}
                      variant="default"
                    >
                      Use this recipe
                      <ArrowRight className="size-[16px]" aria-hidden="true" />
                    </Button>
                    <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                      Opens the alternative. The original, your saved versions and notes stay
                      unchanged.
                    </p>
                  </div>
                )}
                {(result.staleCount > 0 || result.filteredCount > 0) && (
                  <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                    {result.staleCount} connections need review after edits. {result.filteredCount}{" "}
                    other connections do not meet your current choices. No exclusions were relaxed.
                  </p>
                )}
              </>
            )
          )}
          <Button
            type="button"
            className="h-auto whitespace-normal p-0 text-left text-sm underline"
            onClick={() => go(`variations/${source.id}`)}
            variant="link"
          >
            Manage variations
          </Button>
        </>
      )}
    </Card>
  );
}

export function VariationManager({ id }: { id: string }) {
  const requestConfirmation = useConfirm();
  const { go } = useKitchen();
  const [result, setResult] = useState<VariationsResult | null>(null);
  const [selection, setSelection] = useState<
    (VariationCandidate & { connection?: VariationConnection }) | null
  >(null);
  const [portions, setPortions] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const request = useMemo(() => ({ id, attempt }), [id, attempt]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    setSelection(null);
    setReviewed(false);
    api<VariationsResult>(`/recipes/${request.id}/variations`, { signal: abort.signal })
      .then(({ data }) => {
        if (!abort.signal.aborted) setResult(data);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [request]);
  function select(value: VariationCandidate & { connection?: VariationConnection }) {
    setSelection(value);
    setPortions(value.portions[0]);
    setReviewed(false);
    setNotice("");
  }
  async function confirm() {
    if (!selection || !result || !reviewed || busy) return;
    setBusy(true);
    setError("");
    try {
      const connection = selection.connection;
      await api(connection ? `/remixes/${connection.id}` : "/remixes", {
        method: connection ? "PUT" : "POST",
        tag: connection?.tag,
        value: {
          sourceId: result.source.id,
          sourceRevision: result.source.revision,
          targetId: selection.target.id,
          targetRevision: selection.target.revision,
          axis: selection.axis,
        },
      });
      setNotice(
        connection
          ? "Connection reconfirmed for the reviewed versions."
          : "Reviewed connection saved in both directions.",
      );
      setAttempt((value) => value + 1);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(connection: VariationConnection) {
    if (
      !(await requestConfirmation({"title": "Remove variation link?", "description": "Remove this variation link? Both recipes and their saved versions will stay.", "confirmLabel": "Remove connection", "destructive": true}))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/remixes/${connection.id}`, { method: "DELETE", tag: connection.tag });
      setNotice("Connection removed. Recipes were not deleted.");
      setAttempt((value) => value + 1);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        className="mb-6 h-auto min-h-9 justify-start gap-2 p-0 text-xs text-muted-foreground"
        onClick={() => go(`recipe/${id}`)}
        variant="ghost"
      >
        <ArrowLeft className="size-[16px]" aria-hidden="true" />
        Back to recipe
      </Button>
      <div className="mb-7 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            Your catalogue, thoughtfully connected
          </span>
          <h1 className="mb-4 mt-3 break-words font-serif text-[clamp(34px,4vw,53px)] font-normal leading-[1.15] tracking-[-.035em]">
            One change. <em className="font-normal text-[#6f805b]">More possibilities.</em>
          </h1>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            Review complete recipes, then connect the versions you trust as alternatives.
          </p>
        </div>
      </div>
      <ErrorBox message={error} />
      {error && (
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          onClick={() => setAttempt((value) => value + 1)}
          variant="outline"
        >
          <RefreshCw className="size-[16px]" aria-hidden="true" />
          Reload comparisons
        </Button>
      )}
      <output className="my-3 block text-sm text-primary empty:hidden">{notice}</output>
      {!result ? (
        busy && <Loading label="Loading recipe variations…" />
      ) : (
        <>
          <Notice>
            <strong>
              Managing variations for {result.source.recipe.title} · revision{" "}
              {result.source.revision}
            </strong>
            <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
              This is catalogue maintenance, not meal discovery: excluded ingredients can appear
              here. Discovery applies your exclusions before recommending anything.
            </p>
          </Notice>
          <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
              Reviewed connections
            </h2>
            {result.connections.length === 0 && (
              <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                No connections yet. Start by reviewing a candidate below.
              </p>
            )}
            <div className="min-w-0">
              {result.connections.map((connection) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-4 border-b py-4 [&>div]:min-w-0 [&>p]:w-full"
                  key={connection.id}
                >
                  <div>
                    <strong>{connection.target.recipe.title}</strong>
                    <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                      <Badge
                        className={cn(
                          "text-xs",
                          connection.stale && "bg-[#f7eddf] text-[#835127]",
                        )}
                        variant="secondary"
                      >
                        {connection.stale ? "Needs review" : "Reviewed"}
                      </Badge>{" "}
                      {axisName(connection.axis, result.source.recipe.mode === "breakfast")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
                      disabled={busy || !connection.currentAxis || !connection.portions.length}
                      onClick={() => {
                        if (connection.currentAxis)
                          select({
                            target: connection.target,
                            axis: connection.currentAxis,
                            portions: connection.portions,
                            connection,
                          });
                      }}
                      variant="outline"
                    >
                      {connection.stale ? "Review changes" : "Review connection"}
                    </Button>
                    <Button
                      type="button"
                      className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
                      disabled={busy}
                      onClick={() => remove(connection)}
                      aria-label={`Remove connection to ${connection.target.recipe.title}`}
                      variant="outline"
                    >
                      <Trash2 className="size-[15px]" aria-hidden="true" />
                    </Button>
                  </div>
                  {(!connection.currentAxis || !connection.portions.length) && (
                    <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                      This pair no longer differs by exactly one axis with a shared portion size.
                      Edit the recipes or remove the link.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
            <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
              Possible variations
            </h2>
            <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
              These recipes share the meal type and two of the three main choices. They are
              candidates, not automatically approved remixes.
            </p>
            <Field label="Search variation candidates">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by recipe title"
                className="h-11 min-w-0 bg-card md:h-10"
              />
            </Field>
            <div className="my-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {result.candidates
                .filter((item) =>
                  item.target.recipe.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((candidate) => (
                  <Button
                    type="button"
                    className="h-auto min-h-32 min-w-0 flex-col items-start justify-start gap-3 whitespace-normal rounded-xl p-5 text-left font-normal aria-pressed:border-primary aria-pressed:bg-secondary [&>strong]:font-serif [&>strong]:text-xl [&>span:last-child]:inline-flex [&>span:last-child]:items-center [&>span:last-child]:gap-2 [&>span:last-child]:text-xs"
                    key={candidate.target.id}
                    disabled={busy}
                    onClick={() => select(candidate)}
                    variant="outline"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                      Change{" "}
                      {axisName(
                        candidate.axis,
                        result.source.recipe.mode === "breakfast",
                      ).toLowerCase()}
                    </span>
                    <strong>{candidate.target.recipe.title}</strong>
                    <span>
                      Review this candidate
                      <ArrowRight className="size-[14px]" aria-hidden="true" />
                    </span>
                  </Button>
                ))}
            </div>
            {!result.candidates.length && (
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                Add another recipe with the same meal type, two matching axes, and a common portion
                profile. A copy alone is not a remix until one axis changes.
              </p>
            )}
          </Card>
          {selection && (
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7 review-panel">
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Review before connecting.
              </h2>
              <Field label="Compare portion size">
                <NativeSelect
                  disabled={busy}
                  value={portions}
                  onChange={(event) => {
                    setPortions(Number(event.target.value));
                    setReviewed(false);
                  }}
                  className="h-11 md:h-10"
                >
                  {selection.portions.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value} portions
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Comparison source={result.source} target={selection.target} portions={portions} />
              <Label className="my-4 flex items-start gap-3 py-2 text-sm font-normal leading-relaxed [&>button]:mt-1">
                <Checkbox
                  checked={reviewed}
                  onCheckedChange={(event) => setReviewed(event === true)}
                  disabled={busy}
                  className="mt-0.5 size-[18px] shrink-0"
                />
                I reviewed the ingredient changes and cooking instructions for these recipe
                versions.
              </Label>
              <Button
                type="button"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                disabled={busy || !reviewed}
                onClick={confirm}
                variant="default"
              >
                <Check className="size-[16px]" aria-hidden="true" />
                {selection.connection ? "Reconfirm connection" : "Confirm connection"}
              </Button>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                The connection covers their shared authored portion profiles. Review each one above
                before confirming. Editing either recipe requires reconfirmation.
              </p>
            </Card>
          )}
        </>
      )}
    </>
  );
}
