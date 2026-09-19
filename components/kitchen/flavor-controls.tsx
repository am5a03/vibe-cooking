"use client";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, ClientError, errorText } from "../../lib/kitchen/client";
import {
  APPLICATIONS,
  BREAKFAST_FORMATS,
  FLAVOR_STYLES,
  TECHNIQUES,
  blankFlavor,
  flavorName,
  friendlyLabel,
  matchesFlavor,
  validateFlavor,
  type FlavorEntry,
  type FlavorProfile,
  type FlavorStyle,
} from "../../lib/kitchen/flavors";
import { ErrorBox, Field, useKitchen } from "./shared";
import { useFlavors } from "./flavor-context";
import { useConfirm } from "./confirmation";

export function FlavorPreview({ entry }: { entry: FlavorEntry }) {
  const p = entry.profile;
  return (
    <div className="min-w-0 space-y-3 break-words" data-kitchen-flavor-preview>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {entry.origin === "builtin" ? "Built-in inspiration" : "My combination"}
        </Badge>
        {p.styles.map((style) => (
          <Badge key={style} variant="outline">
            {FLAVOR_STYLES[style]}
          </Badge>
        ))}
      </div>
      <h3 className="font-serif text-2xl font-normal">{p.name}</h3>
      {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
      <div className="flex flex-wrap gap-2">
        {p.tasteTags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
      <p className="text-sm">
        <strong>Key ingredients: </strong>
        {p.keyIngredients.length
          ? p.keyIngredients.map((item) => item.name).join(", ")
          : "Your own combination; no reference ingredients recorded."}
      </p>
      <p className="text-sm">
        <strong>Use as: </strong>
        {p.applications.length ? p.applications.map(friendlyLabel).join(" · ") : "See the recipe"}
      </p>
      {p.usage && <p className="text-sm leading-relaxed text-muted-foreground">{p.usage}</p>}
    </div>
  );
}
export function FlavorFilters({
  query,
  style,
  onQuery,
  onStyle,
  disabled = false,
}: {
  query: string;
  style: string;
  onQuery: (value: string) => void;
  onStyle: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-x-5 sm:grid-cols-2">
      <Field label="Cuisine or style">
        <NativeSelect
          value={style}
          disabled={disabled}
          onChange={(e) => onStyle(e.target.value)}
          className="h-11"
        >
          <NativeSelectOption value="">All styles</NativeSelectOption>
          {Object.entries(FLAVOR_STYLES).map(([key, name]) => (
            <NativeSelectOption key={key} value={key}>
              {name}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="mine">My combinations</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="Search flavour combinations">
        <Input
          type="search"
          value={query}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Try ginger, lemon, herby…"
          className="h-11"
        />
      </Field>
    </div>
  );
}

// Not a form: it is also embedded inside the recipe form. Every action uses type=button.
export function FlavorForm({
  initial,
  id,
  existing = false,
  onSaved,
  onCancel,
  onDirty,
  disabled = false,
}: {
  initial: FlavorProfile;
  id?: string;
  existing?: boolean;
  onSaved: (entry: FlavorEntry) => void;
  onCancel: () => void;
  onDirty: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { entries: ingredients } = useKitchen();
  const { upsert } = useFlavors();
  const confirm = useConfirm();
  const scope = useId();
  const [draft, setDraft] = useState<FlavorProfile>(initial);
  const [original, setOriginal] = useState(JSON.stringify(initial));
  const [tasteText, setTasteText] = useState(initial.tasteTags.join(", "));
  const [otherText, setOtherText] = useState(
    initial.keyIngredients
      .filter((item) => !item.ingredientId)
      .map((item) => item.name)
      .join(", "),
  );
  const [refs, setRefs] = useState(initial.keyIngredients.filter((item) => item.ingredientId));
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A stable generated ID makes retry-after-response-loss create-only, not duplicate creation.
  const [newId] = useState(() => id ?? `custom-${crypto.randomUUID()}`);
  const split = (text: string) =>
    text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const value: FlavorProfile = {
    ...draft,
    tasteTags: split(tasteText),
    keyIngredients: [...refs, ...split(otherText).map((name) => ({ name, ingredientId: null }))],
  };
  const dirty = JSON.stringify(value) !== original;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!existing || !id) return;
    const abort = new AbortController();
    api<FlavorEntry>(`/flavor-profiles/${id}`, { signal: abort.signal })
      .then((result) => {
        if (!abort.signal.aborted) {
          // Never pair an old form value with a newer ETag.
          if (JSON.stringify(result.data.profile) !== JSON.stringify(initial))
            setError("This combination changed. Reload its latest version before editing.");
          else setTag(result.tag);
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(errorText(cause));
      });
    return () => abort.abort();
  }, [id, existing, initial]);
  const change = <K extends keyof FlavorProfile>(key: K, next: FlavorProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));
  async function save() {
    if (busy || disabled || (existing && !tag)) return;
    setBusy(true);
    setError("");
    try {
      const profile = validateFlavor(value);
      let result: { data: FlavorEntry };
      try {
        result = await api<FlavorEntry>(
          existing ? `/flavor-profiles/${id}` : "/flavor-profiles",
          existing
            ? { method: "PUT", value: profile, tag }
            : { method: "POST", value: { id: newId, profile } },
        );
      } catch (cause) {
        // A lost create response may have committed already. Recover only an exact match;
        // never overwrite a different draft or silently reconcile a stale edit.
        if (existing || !(cause instanceof ClientError) || cause.status !== 409) throw cause;
        const stored = await api<FlavorEntry>(`/flavor-profiles/${newId}`);
        if (
          stored.data.origin !== "custom" ||
          JSON.stringify(stored.data.profile) !== JSON.stringify(profile)
        )
          throw cause;
        result = stored;
      }
      upsert(result.data);
      setOriginal(JSON.stringify(result.data.profile));
      onDirty(false);
      onSaved(result.data);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (
      dirty &&
      !(await confirm({
        title: "Discard this flavour draft?",
        description:
          "Discard the unsaved flavour details? Your recipe ingredients and instructions will stay unchanged.",
        confirmLabel: "Discard flavour draft",
        cancelLabel: "Keep editing",
        destructive: true,
      }))
    )
      return;
    onDirty(false);
    onCancel();
  }
  async function reload() {
    if (
      !existing ||
      !id ||
      !(await confirm({
        title: "Reload flavour details?",
        description: "Replace the unsaved flavour details with the latest saved version.",
        confirmLabel: "Reload latest",
        cancelLabel: "Keep editing",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const result = await api<FlavorEntry>(`/flavor-profiles/${id}`);
      setDraft(result.data.profile);
      setTasteText(result.data.profile.tasteTags.join(", "));
      setOtherText(
        result.data.profile.keyIngredients
          .filter((item) => !item.ingredientId)
          .map((item) => item.name)
          .join(", "),
      );
      setRefs(result.data.profile.keyIngredients.filter((item) => item.ingredientId));
      setOriginal(JSON.stringify(result.data.profile));
      setTag(result.tag);
      upsert(result.data);
      setError("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      disabled={busy || disabled}
      className="min-w-0 space-y-4 rounded-xl border bg-secondary/20 p-4 sm:p-5"
      data-kitchen-flavor-form
    >
      <legend className="px-2 font-serif text-xl">
        {existing ? "Edit my combination" : "Create a flavour combination"}
      </legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Names and reference ingredients are guidance only. Saving here does not change any recipe’s
        ingredients, quantities, steps or approved remixes. Use a new combination for a different
        flavour identity.
      </p>
      <ErrorBox message={error} />
      {existing && error && (
        <Button type="button" variant="outline" onClick={reload} disabled={busy}>
          Reload latest combination
        </Button>
      )}
      <Field label="Combination name">
        <Input
          value={draft.name}
          maxLength={120}
          onChange={(e) => change("name", e.target.value)}
          placeholder="My lemon–dill dressing"
          className="h-11"
        />
      </Field>
      <Field label="Flavour description">
        <Textarea
          rows={2}
          maxLength={800}
          value={draft.description}
          onChange={(e) => change("description", e.target.value)}
          className="resize-y field-sizing-fixed"
        />
      </Field>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-xs font-semibold">
          Styles (optional, choose more than one)
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(FLAVOR_STYLES).map(([key, name]) => (
            <Label key={key} htmlFor={`${scope}-${key}`} className="flex items-start gap-2 text-sm">
              <Checkbox
                id={`${scope}-${key}`}
                disabled={busy || disabled}
                checked={draft.styles.includes(key as FlavorStyle)}
                onCheckedChange={(checked) =>
                  change(
                    "styles",
                    checked === true
                      ? [...draft.styles, key as FlavorStyle]
                      : draft.styles.filter((style) => style !== key),
                  )
                }
              />
              {name}
            </Label>
          ))}
        </div>
      </fieldset>
      <Field label="Taste tags (comma-separated)">
        <Input
          value={tasteText}
          maxLength={480}
          onChange={(e) => setTasteText(e.target.value)}
          placeholder="citrusy, herby"
          className="h-11"
        />
      </Field>
      <Field label="Key ingredients from your catalogue">
        <NativeSelect
          multiple
          size={5}
          value={refs.flatMap((item) => (item.ingredientId ? [item.ingredientId] : []))}
          disabled={busy || disabled}
          onChange={(e) =>
            setRefs(
              Array.from(e.target.selectedOptions, (option) => ({
                ingredientId: option.value,
                name: option.text,
              })),
            )
          }
        >
          {refs
            .filter((item) => !ingredients.some((entry) => entry.id === item.ingredientId))
            .map((item) => (
              <NativeSelectOption key={item.ingredientId} value={item.ingredientId ?? ""}>
                {item.name}
              </NativeSelectOption>
            ))}
          {[...ingredients]
            .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
            .map((entry) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                {entry.ingredient.name}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </Field>
      <Field label="Other seasoning names (comma-separated)">
        <Input
          value={otherText}
          maxLength={2000}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="A seasoning not in your catalogue"
          className="h-11"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Other names are descriptive only; they do not create catalogue ingredients or affect
        exclusions. Leave these blank to use only the ingredients selected above.
      </p>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-xs font-semibold">Applications</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {APPLICATIONS.map((item) => (
            <Label
              key={item}
              htmlFor={`${scope}-${item}`}
              className="flex items-start gap-2 text-sm"
            >
              <Checkbox
                id={`${scope}-${item}`}
                disabled={busy || disabled}
                checked={draft.applications.includes(item)}
                onCheckedChange={(checked) =>
                  change(
                    "applications",
                    checked === true
                      ? [...draft.applications, item]
                      : draft.applications.filter((app) => app !== item),
                  )
                }
              />
              {friendlyLabel(item)}
            </Label>
          ))}
        </div>
      </fieldset>
      <Field label="Application notes">
        <Textarea
          rows={3}
          maxLength={1600}
          value={draft.usage}
          onChange={(e) => change("usage", e.target.value)}
          className="resize-y field-sizing-fixed"
          placeholder="How do you use this combination? Quantities belong in the recipe."
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy || disabled || (existing && !tag) || !draft.name.trim()}
          onClick={save}
        >
          {busy ? "Saving combination…" : "Save combination"}
        </Button>
        <Button type="button" variant="outline" disabled={busy || disabled} onClick={cancel}>
          Cancel combination
        </Button>
      </div>
    </fieldset>
  );
}

export function FlavorPicker({
  value,
  onChange,
  disabled,
  onDraftDirty,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onDraftDirty: (value: boolean) => void;
}) {
  const library = useFlavors();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [creating, setCreating] = useState<{ initial: FlavorProfile; id?: string } | null>(null);
  const [message, setMessage] = useState("");
  const selected = library.entries.find((entry) => entry.id === value);
  const options = library.entries
    .filter((entry) => matchesFlavor(entry, query, style))
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  return (
    <section
      aria-label="Choose your flavour"
      className="col-span-full min-w-0 rounded-xl border p-4 sm:p-5"
    >
      <h3 className="mb-3 font-serif text-2xl">Choose your flavour.</h3>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Browse by style, then choose a specific combination. This describes your recipe; it never
        changes ingredients or creates a remix automatically.
      </p>
      <ErrorBox message={library.error} />
      {library.error && (
        <Button type="button" variant="outline" onClick={library.reload} disabled={disabled}>
          Retry flavour library
        </Button>
      )}
      {library.loading && (
        <output className="block text-sm text-muted-foreground">
          Loading flavour combinations…
        </output>
      )}
      <FlavorFilters
        query={query}
        style={style}
        onQuery={setQuery}
        onStyle={setStyle}
        disabled={disabled || !!creating}
      />
      <Field label="Flavour profile">
        <NativeSelect
          required
          value={value}
          disabled={disabled || !!creating}
          onChange={(e) => {
            onChange(e.target.value);
            setMessage("Profile selected. Ingredients and instructions are unchanged.");
          }}
          className="h-11"
        >
          <NativeSelectOption value="">Choose a combination</NativeSelectOption>
          {value && !options.some((entry) => entry.id === value) && (
            <NativeSelectOption value={value}>
              {selected
                ? `${selected.profile.name} (current selection)`
                : `${flavorName(value, library.entries)} (custom or imported)`}
            </NativeSelectOption>
          )}
          {options.map((entry) => (
            <NativeSelectOption key={entry.id} value={entry.id}>
              {entry.profile.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {!library.loading && !library.error && !options.length && (
        <p className="mb-4 text-sm text-muted-foreground">
          No combinations match these filters. Your current selection is unchanged.
        </p>
      )}
      {selected ? (
        <FlavorPreview entry={selected} />
      ) : (
        value && (
          <p className="text-sm text-muted-foreground">
            Custom or imported profile: {flavorName(value, library.entries)}. The original reference
            is preserved; adding a library description is optional.
          </p>
        )
      )}
      <output className="my-3 block text-xs text-primary">{message}</output>
      {!creating && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || library.loading || !!library.error}
            onClick={() => setCreating({ initial: blankFlavor() })}
          >
            Create my combination
          </Button>
          {value && !selected && !library.loading && !library.error && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                setCreating({
                  initial: { ...blankFlavor(), name: friendlyLabel(value) },
                  id: value,
                })
              }
            >
              Describe this imported profile
            </Button>
          )}
        </div>
      )}
      {creating && (
        <FlavorForm
          initial={creating.initial}
          id={creating.id}
          disabled={disabled}
          onDirty={onDraftDirty}
          onCancel={() => setCreating(null)}
          onSaved={(entry) => {
            onChange(entry.id);
            setCreating(null);
            setMessage(
              "Combination saved and selected. Recipe ingredients and instructions are unchanged.",
            );
          }}
        />
      )}
    </section>
  );
}
export function MethodPicker({
  mode,
  value,
  onChange,
  disabled,
}: {
  mode: "breakfast" | "dinner";
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const options = mode === "breakfast" ? BREAKFAST_FORMATS : TECHNIQUES;
  return (
    <Field label={mode === "breakfast" ? "Breakfast format" : "Cooking technique"}>
      <NativeSelect
        required
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11"
      >
        <NativeSelectOption value="">
          Choose {mode === "breakfast" ? "a format" : "a technique"}
        </NativeSelectOption>
        {value && !Object.hasOwn(options, value) && (
          <NativeSelectOption value={value}>
            {friendlyLabel(value)} (custom or imported)
          </NativeSelectOption>
        )}
        {Object.entries(options).map(([key, name]) => (
          <NativeSelectOption key={key} value={key}>
            {name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
