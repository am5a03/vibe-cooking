"use client";
import { useConfirm } from "./confirmation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorText, type Preferences } from "../../lib/kitchen/client";
import { Notice } from "./notice";
import { ErrorBox, Field, Loading, useDirty, useKitchen } from "./shared";

export function PreferencesPanel() {
  const requestConfirmation = useConfirm();
  const { entries, setDirty, go } = useKitchen();
  const [value, setValue] = useState<Preferences | null>(null);
  const [original, setOriginal] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty = value !== null && JSON.stringify(value) !== original;
  const request = useMemo(() => ({ path: "/preferences", attempt: retry }), [retry]);
  useDirty(dirty);
  useEffect(() => {
    const controller = new AbortController();
    api<{ preferences: Preferences }>(request.path, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setValue(result.data.preferences);
        setOriginal(JSON.stringify(result.data.preferences));
        setTag(result.tag);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorText(cause));
      });
    return () => controller.abort();
  }, [request]);
  async function reload() {
    if (dirty && !(await requestConfirmation({"title": "Discard unsaved preferences?", "description": "Discard unsaved preferences and load the latest?", "confirmLabel": "Discard and reload", "destructive": true}))) return;
    setRetry((n) => n + 1);
  }
  async function save() {
    if (!value) return;
    const submitted = value;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ preferences: Preferences }>("/preferences", {
        method: "PUT",
        value: submitted,
        tag,
      });
      setValue(result.data.preferences);
      setOriginal(JSON.stringify(result.data.preferences));
      setTag(result.tag);
      setDirty(false);
      setNotice("Preferences saved.");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-[860px]">
      <span className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">
        Your tastes, your kitchen
      </span>
      <h1 className="mb-4 mt-3 break-words font-serif text-[clamp(34px,4vw,53px)] font-normal leading-[1.15] tracking-[-.035em]">
        A little more <em className="font-normal text-[#6f805b]">you.</em>
      </h1>
      <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
        Keep track of the ingredients and portions you prefer.
      </p>
      <Button type="button" variant="outline" className="mb-5" onClick={() => go("flavours")}>Manage flavour combinations</Button>
      <Notice>
        Discover uses these exclusions and likes when suggesting meals. All recipes remains an
        unfiltered editing library. Recorded ingredient components are checked, but this is not an
        allergy-safety certification.
      </Notice>
      <ErrorBox message={error} />
      {error && (
        <Button
          type="button"
          className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
          onClick={reload}
          variant="outline"
        >
          Reload preferences
        </Button>
      )}
      {value ? (
        <>
          <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Everyday defaults
              </h2>
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field label="Breakfast portions">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={value.defaultBreakfastPortions || ""}
                    onChange={(e) =>
                      setValue({ ...value, defaultBreakfastPortions: Number(e.target.value) })
                    }
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Lunch & dinner portions">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={value.defaultDinnerPortions || ""}
                    onChange={(e) =>
                      setValue({ ...value, defaultDinnerPortions: Number(e.target.value) })
                    }
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
                <Field label="Preferred maximum minutes (optional)">
                  <Input
                    type="number"
                    min={1}
                    max={2880}
                    placeholder="No preference"
                    value={value.maxMinutes ?? ""}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        maxMinutes: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="h-11 min-w-0 bg-card md:h-10"
                  />
                </Field>
              </div>
            </Card>
            <Card className="mb-6 min-w-0 gap-0 rounded-xl bg-card p-5 shadow-sm sm:p-7">
              <h2 className="mb-5 mt-2 break-words font-serif text-[29px] font-normal leading-[1.15] tracking-[-.035em]">
                Ingredients you love—or leave out.
              </h2>
              {entries.length === 0 ? (
                <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
                  Add ingredients through the recipe editor to see them here.
                </p>
              ) : (
                <div className="max-h-[500px] overflow-y-auto pr-2">
                  {entries.map((entry) => (
                    <div
                      data-kitchen-taste-row className="flex flex-wrap items-center gap-4 border-b py-3 text-sm [&>span]:min-w-0 [&>span]:flex-1 [&>span]:basis-32 [&>label]:text-xs"
                      key={entry.id}
                    >
                      <span>{entry.ingredient.name}</span>
                      <Label className="flex items-center gap-2 text-sm font-normal leading-relaxed">
                        <Checkbox
                          aria-label={`Love ${entry.ingredient.name}`}
                          checked={value.likedIngredientIds.includes(entry.id)}
                          onCheckedChange={(e) =>
                            setValue({
                              ...value,
                              likedIngredientIds:
                                e === true
                                  ? [...value.likedIngredientIds, entry.id]
                                  : value.likedIngredientIds.filter((id) => id !== entry.id),
                              excludedIngredientIds:
                                e === true
                                  ? value.excludedIngredientIds.filter((id) => id !== entry.id)
                                  : value.excludedIngredientIds,
                            })
                          }
                          disabled={busy}
                          className="mt-0.5 size-[18px] shrink-0"
                        />
                        Love
                      </Label>
                      <Label className="flex items-center gap-2 text-sm font-normal leading-relaxed">
                        <Checkbox
                          aria-label={`Exclude ${entry.ingredient.name}`}
                          checked={value.excludedIngredientIds.includes(entry.id)}
                          onCheckedChange={(e) =>
                            setValue({
                              ...value,
                              excludedIngredientIds:
                                e === true
                                  ? [...value.excludedIngredientIds, entry.id]
                                  : value.excludedIngredientIds.filter((id) => id !== entry.id),
                              likedIngredientIds:
                                e === true
                                  ? value.likedIngredientIds.filter((id) => id !== entry.id)
                                  : value.likedIngredientIds,
                            })
                          }
                          disabled={busy}
                          className="mt-0.5 size-[18px] shrink-0"
                        />
                        Exclude
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Button
              type="button"
              className="h-auto min-h-11 max-w-full whitespace-normal gap-2 text-[13px] font-semibold"
              disabled={busy || !dirty || !tag}
              onClick={save}
              variant="default"
            >
              <Check className="size-[16px]" aria-hidden="true" />
              {busy ? "Saving…" : "Save preferences"}
            </Button>
            {dirty && <span className="ml-3 text-xs text-destructive">Unsaved changes</span>}
          </fieldset>
          <output
            className="my-3 block text-sm text-primary empty:hidden"
            style={{ display: "block" }}
          >
            {notice}
          </output>
        </>
      ) : (
        !error && <Loading label="Loading preferences…" />
      )}
    </div>
  );
}
