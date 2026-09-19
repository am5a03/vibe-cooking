"use client";
import { useConfirm } from "./confirmation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  errorText,
  label,
  type RecipeDocument,
  type Snapshot,
} from "../../lib/kitchen/client";
import {
  EDIT_KEY,
  editable,
  editableServing,
  emptyRecipe,
  keyed,
  type EditorDocument,
  type EditorServing,
} from "../../lib/kitchen/editor-model";
import type { IngredientLine } from "../../lib/kitchen/types";
import { recipe as validateRecipe } from "../../lib/kitchen/validation";
import { FlavorPicker, MethodPicker } from "./flavor-controls";
import { Notice } from "./notice";
import { ErrorBox, Field, Loading, useDirty, useKitchen } from "./shared";

export function RecipeEditor({ mode, id }: { mode: "new" | "edit" | "duplicate"; id: string }) {
  const requestConfirmation = useConfirm();
  const { entries, refreshIngredients, go, setDirty } = useKitchen();
  const [doc, setDoc] = useState<EditorDocument | null>(() =>
    mode === "new" ? emptyRecipe() : null,
  );
  const [original, setOriginal] = useState(() =>
    mode === "new" ? JSON.stringify(emptyRecipe()) : "",
  );
  const [newRecipeId] = useState(() => crypto.randomUUID());
  const [tag, setTag] = useState<string | null>(null);
  const [profileIndex, setProfileIndex] = useState(0);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const [flavorDirty, setFlavorDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newComponents, setNewComponents] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [ingredientBusy, setIngredientBusy] = useState(false);
  const dirty = flavorDirty || (doc !== null && JSON.stringify(doc) !== original);
  const request = useMemo(() => ({ mode, id, attempt: retry }), [mode, id, retry]);
  useDirty(dirty);
  useEffect(() => {
    if (request.mode === "new") return;
    const abort = new AbortController();
    api<Snapshot>(`/recipes/${request.id}`, { signal: abort.signal })
      .then((result) => {
        if (abort.signal.aborted) return;
        const recipe =
          request.mode === "duplicate"
            ? {
                ...result.data.recipe,
                title: `${result.data.recipe.title.slice(0, 170)} (copy)`,
                status: "active" as const,
                source:
                  `Personal variation of ${request.id}, revision ${result.data.revision}. ${result.data.recipe.source}`.slice(
                    0,
                    1000,
                  ),
              }
            : result.data.recipe;
        setDoc(editable(recipe));
        setOriginal(JSON.stringify(recipe));
        setTag(result.tag);
        setProfileIndex(0);
        setError("");
        setReviewNeeded(false);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      });
    return () => abort.abort();
  }, [request]);
  function update<K extends keyof EditorDocument>(key: K, value: EditorDocument[K]) {
    setDoc((current) => (current ? { ...current, [key]: value } : current));
  }
  function updateServing<K extends keyof EditorServing>(key: K, value: EditorServing[K]) {
    setDoc((current) =>
      current
        ? {
            ...current,
            servings: current.servings.map((serving, index) =>
              index === profileIndex ? { ...serving, [key]: value } : serving,
            ),
          }
        : current,
    );
  }
  function ingredientRow(index: number, change: Partial<IngredientLine>) {
    const selected = doc?.servings[profileIndex];
    if (selected)
      updateServing(
        "ingredients",
        selected.ingredients.map((line, i) => (i === index ? { ...line, ...change } : line)),
      );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!doc || reviewNeeded || busy || ingredientBusy || flavorDirty) return;
    setBusy(true);
    setError("");
    try {
      const validated = validateRecipe({
        ...doc,
        safetyNotes: doc.safetyNotes.map((line) => line.trim()).filter(Boolean),
        servings: doc.servings.map((serving) => ({
          ...serving,
          equipment: serving.equipment.map((item) => item.trim()).filter(Boolean),
        })),
      });
      const result = await api<Snapshot>(
        mode === "edit" ? `/recipes/${id}` : "/recipes",
        mode === "edit"
          ? { method: "PUT", value: validated, tag }
          : { method: "POST", value: { id: newRecipeId, recipe: validated } },
      );
      setOriginal(JSON.stringify(result.data.recipe));
      setDoc(editable(result.data.recipe));
      setDirty(false);
      go(`recipe/${result.data.id}`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function addIngredient() {
    setIngredientBusy(true);
    setError("");
    setNotice("");
    try {
      const idValue = newId.trim();
      await api("/ingredients", {
        method: "POST",
        value: {
          id: idValue,
          ingredient: { name: newName.trim(), aliases: [], components: newComponents },
        },
      });
      await refreshIngredients();
      setNotice(`Added ${newName}. Select it in the ingredient rows below.`);
      setNewName("");
      setNewId("");
      setNewComponents([]);
      setDoc((current) =>
        current && !current.main
          ? {
              ...current,
              main: idValue,
              servings: current.servings.map((serving) => ({
                ...serving,
                ingredients: serving.ingredients.map((line) =>
                  line.ingredientId ? line : { ...line, ingredientId: idValue },
                ),
              })),
            }
          : current,
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setIngredientBusy(false);
    }
  }
  async function reload() {
    if (dirty && !(await requestConfirmation({"title": "Discard unsaved edits?", "description": "Discard unsaved edits and reload the current recipe?", "confirmLabel": "Discard and reload", "destructive": true}))) return;
    setDirty(false);
    setRetry((n) => n + 1);
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      setNotice("Draft JSON copied. Keep it privately before reloading.");
    } catch {
      setError(
        "Clipboard access failed. Your edits are still in this form. Do not reload until you have copied the text you need.",
      );
    }
  }
  const selected = doc?.servings[profileIndex];
  return (
    <div className="mx-auto max-w-[860px]">
      <Button
        type="button"
        className="mb-6 h-auto min-h-9 justify-start gap-2 p-0 text-xs text-muted-foreground"
        onClick={() => go(mode === "edit" ? `recipe/${id}` : "discover")}
        variant="ghost"
      >
        <ArrowLeft className="size-[16px]" aria-hidden="true" />
        Back
      </Button>
      <div className="mb-7 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
            {mode === "edit"
              ? "A small change, a new revision"
              : mode === "duplicate"
                ? "A familiar anchor, your own experiment"
                : "A fresh page in your cookbook"}
          </span>
          <h1 className="mb-4 mt-3 break-words font-serif text-[clamp(34px,4vw,53px)] font-normal leading-[1.15] tracking-[-.035em]">
            {mode === "edit" ? "Make it " : "Something "}
            <em className="font-normal text-[#6f805b]">
              {mode === "edit" ? "yours." : "worth keeping."}
            </em>
          </h1>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            {mode === "duplicate"
              ? "This becomes a separate recipe. The original will stay unchanged."
              : "Ingredients, instructions, and your own finishing touches."}
          </p>
        </div>
      </div>
      {mode === "edit" && (
        <Notice>
          <strong>Related variations</strong>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            Link reviewed recipes that change one flavour, main ingredient or cooking method. Save
            recipe edits first.
          </p>
          <Button
            type="button"
            className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
            disabled={dirty || busy}
            onClick={() => go(`variations/${id}`)}
            variant="outline"
          >
            Manage variations
          </Button>
        </Notice>
      )}
      <ErrorBox message={error} />
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
            onClick={copyDraft}
            variant="outline"
          >
            <Copy className="size-[15px]" aria-hidden="true" />
            Copy unsaved draft
          </Button>
          {mode !== "new" && (
            <Button
              type="button"
              className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
              onClick={reload}
              variant="outline"
            >
              Reload latest recipe
            </Button>
          )}
        </div>
      )}
      <output className="my-3 block text-sm text-primary empty:hidden" style={{ display: "block" }}>
        {notice}
      </output>
      {!doc || !selected ? (
        !error && <Loading label="Loading your recipe draft…" />
      ) : (
        <form onSubmit={save}>
          {flavorDirty && <Notice>Save or cancel the flavour-combination draft before saving this recipe.</Notice>}
          <fieldset disabled={busy || ingredientBusy} className="m-0 min-w-0 border-0 p-0">
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
              <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                01 / The idea
              </span>
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Give it a name.
              </h2>
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field label="Recipe title" wide>
                  <Input
                    required
                    maxLength={180}
                    value={doc.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="Your next favourite dish"
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Description" wide>
                  <Textarea
                    rows={2}
                    maxLength={1000}
                    value={doc.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="What makes this one special?"
                    className="min-w-0 resize-y bg-card field-sizing-fixed"
                  />
                </Field>
                <Field label="Meal type">
                  <NativeSelect
                    value={doc.mode}
                    onChange={(e) => update("mode", e.target.value as RecipeDocument["mode"])}
                    className="h-11 md:h-10"
                  >
                    <NativeSelectOption value="dinner">Lunch & dinner</NativeSelectOption>
                    <NativeSelectOption value="breakfast">Breakfast</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="Main ingredient">
                  <NativeSelect
                    required
                    value={doc.main}
                    onChange={(e) => update("main", e.target.value)}
                    className="h-11 md:h-10"
                  >
                    <NativeSelectOption value="">Choose an ingredient</NativeSelectOption>
                    {entries.map((entry) => (
                      <NativeSelectOption key={entry.id} value={entry.id}>
                        {entry.ingredient.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <MethodPicker mode={doc.mode} value={doc.method} onChange={value => update("method", value)} disabled={busy || ingredientBusy}/>
                <FlavorPicker value={doc.flavor} onChange={value => update("flavor", value)} disabled={busy || ingredientBusy} onDraftDirty={setFlavorDirty}/>

              </div>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                Choose readable names for flavour and cooking style. These describe the recipe;
                ingredients, quantities and steps change only when you edit them.
              </p>
            </Card>
            <Collapsible
              className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7"
              defaultOpen={entries.length === 0}
              disabled={busy || ingredientBusy}
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal p-0 text-left text-base font-semibold"
                >
                  Add an ingredient to your catalogue
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                  Create it once, then use it in any recipe. Definitions are immutable in this first
                  version.
                </p>
                <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                  <Field label="New ingredient name">
                    <Input
                      value={newName}
                      maxLength={120}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setNewId(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "")
                            .slice(0, 80),
                        );
                      }}
                      className="h-11 min-w-0 bg-card md:h-10"
                    />
                  </Field>
                  <Field label="New ingredient ID">
                    <Input
                      value={newId}
                      maxLength={80}
                      onChange={(e) => setNewId(e.target.value)}
                      className="h-11 min-w-0 bg-card md:h-10"
                    />
                  </Field>
                  <Field label="Contains these catalogue ingredients (optional)" wide>
                    <NativeSelect
                      multiple
                      value={newComponents}
                      onChange={(e) =>
                        setNewComponents(
                          Array.from(e.target.selectedOptions, (option) => option.value),
                        )
                      }
                      className="h-auto min-h-28"
                    >
                      {entries.map((entry) => (
                        <NativeSelectOption key={entry.id} value={entry.id}>
                          {entry.ingredient.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
                <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                  For a compound ingredient, record known components—for example, sesame in tahini.
                  This is not an allergy certification.
                </p>
                <Button
                  type="button"
                  className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                  disabled={
                    ingredientBusy ||
                    !newName.trim() ||
                    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(newId)
                  }
                  onClick={addIngredient}
                  variant="outline"
                >
                  <Plus className="size-[16px]" aria-hidden="true" />
                  {ingredientBusy ? "Adding…" : "Create ingredient"}
                </Button>
              </CollapsibleContent>
            </Collapsible>
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
              <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                02 / Quantities & method
              </span>
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Write the recipe you’ll cook.
              </h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {doc.servings.map((serving, index) => (
                  <Button
                    type="button"
                    className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
                    aria-pressed={index === profileIndex}
                    key={serving[EDIT_KEY]}
                    onClick={() => setProfileIndex(index)}
                    variant={index === profileIndex ? "default" : "outline"}
                  >
                    {serving.portions} portions
                  </Button>
                ))}
                <Button
                  type="button"
                  className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
                  disabled={doc.servings.length >= 12}
                  onClick={() => {
                    const number = Array.from({ length: 20 }, (_, i) => i + 1).find(
                      (n) => !doc.servings.some((s) => s.portions === n),
                    );
                    if (number === undefined) return;
                    update("servings", [
                      ...doc.servings,
                      editableServing({ ...selected, portions: number }),
                    ]);
                    setProfileIndex(doc.servings.length);
                    setReviewNeeded(true);
                  }}
                  variant="outline"
                >
                  <Plus className="size-[14px]" aria-hidden="true" />
                  Add portion size
                </Button>
              </div>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                Each portion size has its own quantities, timings, and instructions. Adding a size
                copies the current values unchanged—review them rather than scaling cooking time
                automatically.
              </p>
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-3">
                <Field label="Number of portions">
                  <Input
                    required
                    type="number"
                    min={1}
                    max={20}
                    value={selected.portions || ""}
                    onChange={(e) => {
                      updateServing("portions", Number(e.target.value));
                      setReviewNeeded(true);
                    }}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Active minutes">
                  <Input
                    required
                    type="number"
                    min={0}
                    max={2880}
                    value={selected.activeMinutes}
                    onChange={(e) => updateServing("activeMinutes", Number(e.target.value))}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Total minutes">
                  <Input
                    required
                    type="number"
                    min={1}
                    max={2880}
                    value={selected.totalMinutes || ""}
                    onChange={(e) => updateServing("totalMinutes", Number(e.target.value))}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Equipment (comma-separated)" wide>
                  <Input
                    required
                    value={selected.equipment.join(", ")}
                    onChange={(e) =>
                      updateServing(
                        "equipment",
                        e.target.value.split(",").map((s) => s.trim()),
                      )
                    }
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Pan capacity / batch guidance" wide>
                  <Input
                    required
                    maxLength={800}
                    value={selected.capacity}
                    onChange={(e) => updateServing("capacity", e.target.value)}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Batches">
                  <Input
                    required
                    type="number"
                    min={1}
                    max={20}
                    value={selected.batches || ""}
                    onChange={(e) => updateServing("batches", Number(e.target.value))}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Oven trays">
                  <Input
                    required
                    type="number"
                    min={0}
                    max={20}
                    value={selected.trays}
                    onChange={(e) => updateServing("trays", Number(e.target.value))}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
              </div>
              <h3 className="mb-4 mt-8 font-serif text-2xl font-normal">
                Ingredients for {selected.portions} portions
              </h3>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                Every portion profile must contain the same ingredient IDs and roles. Include the
                selected main ingredient with the Main role.
              </p>
              <div className="min-w-0">
                {selected.ingredients.map((line, index) => (
                  <div
                    className="my-3 grid min-w-0 grid-cols-1 gap-x-3 rounded-xl border bg-secondary/25 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
                    key={line[EDIT_KEY]}
                  >
                    <Field label={`Ingredient ${index + 1}`}>
                      <NativeSelect
                        required
                        value={line.ingredientId}
                        onChange={(e) => ingredientRow(index, { ingredientId: e.target.value })}
                        className="h-11 md:h-10"
                      >
                        <NativeSelectOption value="">Choose ingredient</NativeSelectOption>
                        {entries.map((entry) => (
                          <NativeSelectOption key={entry.id} value={entry.id}>
                            {entry.ingredient.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Quantity">
                      <Input
                        required
                        aria-label={`Quantity ${index + 1}`}
                        type="number"
                        min={0.001}
                        step="any"
                        max={100000}
                        value={line.quantity || ""}
                        onChange={(e) => ingredientRow(index, { quantity: Number(e.target.value) })}
                        className="h-11 min-w-0 bg-card md:h-10"
                      />
                    </Field>
                    <Field label="Unit">
                      <Input
                        required
                        aria-label={`Unit ${index + 1}`}
                        maxLength={40}
                        value={line.unit}
                        onChange={(e) => ingredientRow(index, { unit: e.target.value })}
                        className="h-11 min-w-0 bg-card md:h-10"
                      />
                    </Field>
                    <Field label="Role">
                      <NativeSelect
                        aria-label={`Role ${index + 1}`}
                        value={line.role}
                        onChange={(e) =>
                          ingredientRow(index, { role: e.target.value as IngredientLine["role"] })
                        }
                        className="h-11 md:h-10"
                      >
                        {["main", "base", "vegetables", "fruit", "sauce", "finish"].map((role) => (
                          <NativeSelectOption key={role} value={role}>
                            {label(role)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Preparation / state" wide>
                      <Input
                        aria-label={`Preparation ${index + 1}`}
                        maxLength={600}
                        placeholder="e.g. dry weight, drained, sliced"
                        value={line.preparation}
                        onChange={(e) => ingredientRow(index, { preparation: e.target.value })}
                        className="h-11 min-w-0 bg-card md:h-10"
                      />
                    </Field>
                    <Button
                      type="button"
                      className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs justify-self-end sm:col-start-2 lg:col-start-4"
                      aria-label={`Remove ingredient ${index + 1}`}
                      disabled={selected.ingredients.length === 1}
                      onClick={() =>
                        updateServing(
                          "ingredients",
                          selected.ingredients.filter((_, i) => i !== index),
                        )
                      }
                      variant="outline"
                    >
                      <Trash2 className="size-[15px]" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                disabled={selected.ingredients.length >= 60}
                onClick={() =>
                  updateServing("ingredients", [
                    ...selected.ingredients,
                    keyed({
                      ingredientId: "",
                      quantity: 1,
                      unit: "g",
                      role: "vegetables" as const,
                      preparation: "",
                    }),
                  ])
                }
                variant="outline"
              >
                <Plus className="size-[16px]" aria-hidden="true" />
                Add ingredient row
              </Button>
              <h3 className="mb-4 mt-8 font-serif text-2xl font-normal">Cooking steps</h3>
              {selected.steps.map((step, index) => (
                <div
                  className="my-5 flex items-start gap-3 [&>div]:min-w-0 [&>div]:flex-1"
                  key={step[EDIT_KEY]}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-serif text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <Field label={`Step ${index + 1} title`}>
                      <Input
                        required
                        maxLength={180}
                        value={step.title}
                        onChange={(e) =>
                          updateServing(
                            "steps",
                            selected.steps.map((s, i) =>
                              i === index ? { ...s, title: e.target.value } : s,
                            ),
                          )
                        }
                        className="h-11 min-w-0 bg-card md:h-10"
                      />
                    </Field>
                    <Field label={`Step ${index + 1} instructions`}>
                      <Textarea
                        required
                        rows={3}
                        maxLength={5000}
                        value={step.instruction}
                        onChange={(e) =>
                          updateServing(
                            "steps",
                            selected.steps.map((s, i) =>
                              i === index ? { ...s, instruction: e.target.value } : s,
                            ),
                          )
                        }
                        className="min-w-0 resize-y bg-card field-sizing-fixed"
                      />
                    </Field>
                    <Button
                      type="button"
                      className="h-auto min-h-9 max-w-full whitespace-normal gap-2 px-3 text-xs"
                      disabled={selected.steps.length === 1}
                      onClick={() =>
                        updateServing(
                          "steps",
                          selected.steps.filter((_, i) => i !== index),
                        )
                      }
                      variant="outline"
                    >
                      Remove step {index + 1}
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                disabled={selected.steps.length >= 30}
                onClick={() =>
                  updateServing("steps", [...selected.steps, keyed({ title: "", instruction: "" })])
                }
                variant="outline"
              >
                <Plus className="size-[16px]" aria-hidden="true" />
                Add cooking step
              </Button>
              {doc.servings.length > 1 && (
                <Button
                  type="button"
                  className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                  onClick={async () => {
                    if ((await requestConfirmation({"title": "Remove this portion size?", "description": "Remove this portion profile?", "confirmLabel": "Remove portion size", "destructive": true}))) {
                      update(
                        "servings",
                        doc.servings.filter((_, i) => i !== profileIndex),
                      );
                      setProfileIndex(0);
                    }
                  }}
                  variant="ghost"
                >
                  Remove this portion size
                </Button>
              )}
            </Card>
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
              <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
                03 / The finishing touches
              </span>
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Make the next time easier.
              </h2>
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field label="Meal-prep suitability">
                  <NativeSelect
                    value={doc.prep}
                    onChange={(e) => update("prep", e.target.value as RecipeDocument["prep"])}
                    className="h-11 md:h-10"
                  >
                    <NativeSelectOption value="good">Good for meal prep</NativeSelectOption>
                    <NativeSelectOption value="assemble-later">Assemble later</NativeSelectOption>
                    <NativeSelectOption value="eat-fresh">Best cooked fresh</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="Recipe status">
                  <NativeSelect
                    value={doc.status}
                    onChange={(e) => update("status", e.target.value as RecipeDocument["status"])}
                    className="h-11 md:h-10"
                  >
                    <NativeSelectOption value="active">Active</NativeSelectOption>
                    <NativeSelectOption value="archived">Archived</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="Why the combination works" wide>
                  <Textarea
                    rows={2}
                    maxLength={2500}
                    value={doc.rationale}
                    onChange={(e) => update("rationale", e.target.value)}
                    className="min-w-0 resize-y bg-card field-sizing-fixed"
                  />
                </Field>
                <Field label="Preparation notes" wide>
                  <Textarea
                    rows={2}
                    maxLength={2500}
                    value={doc.prepNote}
                    onChange={(e) => update("prepNote", e.target.value)}
                    className="min-w-0 resize-y bg-card field-sizing-fixed"
                  />
                </Field>
                <Field label="Storage and reheating notes" wide>
                  <Textarea
                    rows={2}
                    maxLength={2500}
                    value={doc.storageNote}
                    onChange={(e) => update("storageNote", e.target.value)}
                    className="min-w-0 resize-y bg-card field-sizing-fixed"
                  />
                </Field>
                <Field label="Safety notes (one per line)" wide>
                  <Textarea
                    rows={2}
                    value={doc.safetyNotes.join("\n")}
                    onChange={(e) => update("safetyNotes", e.target.value.split("\n"))}
                    className="min-w-0 resize-y bg-card field-sizing-fixed"
                  />
                </Field>
                <Field label="Source / attribution" wide>
                  <Input
                    maxLength={1000}
                    value={doc.source}
                    onChange={(e) => update("source", e.target.value)}
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
              </div>
              <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                Recipes are saved as drafts, not certified or kitchen-tested. Review food-safety
                instructions before cooking.
              </p>
            </Card>
            {reviewNeeded && (
              <Label className="my-4 rounded-lg border bg-secondary/60 p-4 my-4 flex items-start gap-3 py-2 text-sm font-normal leading-relaxed [&>button]:mt-1">
                <Checkbox
                  onCheckedChange={(e) => {
                    if (e === true) setReviewNeeded(false);
                  }}
                  disabled={busy || ingredientBusy}
                  className="mt-0.5 size-[18px] shrink-0"
                />
                I have reviewed the quantities, timings, and steps for every new or changed portion
                size.
              </Label>
            )}
            <div className="sticky bottom-2 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-4 shadow-md backdrop-blur-sm sm:bottom-4 [&>span]:text-xs [&>span]:text-muted-foreground">
              <Button
                type="submit"
                className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
                disabled={
                  busy || ingredientBusy || reviewNeeded || flavorDirty || (mode === "edit" && (!dirty || !tag))
                }
                variant="default"
              >
                <Check className="size-[17px]" aria-hidden="true" />
                {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Save new recipe"}
              </Button>
              <span>
                {dirty
                  ? "Unsaved changes · Your draft stays here if saving fails."
                  : "No changes yet."}
              </span>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
