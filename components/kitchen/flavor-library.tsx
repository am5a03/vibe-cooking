"use client";
import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, errorText } from "../../lib/kitchen/client";
import {
  blankFlavor,
  matchesFlavor,
  type FlavorEntry,
  type FlavorProfile,
} from "../../lib/kitchen/flavors";
import { Empty, ErrorBox, Loading, useDirty, useKitchen } from "./shared";
import { useFlavors } from "./flavor-context";
import { FlavorFilters, FlavorForm, FlavorPreview } from "./flavor-controls";

export function FlavorLibrary() {
  const { go, entries: ingredients } = useKitchen();
  const library = useFlavors();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [editing, setEditing] = useState<{
    initial: FlavorProfile;
    id?: string;
    existing?: boolean;
    key: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useDirty(dirty);
  const matches = library.entries
    .filter((entry) => matchesFlavor(entry, query, style))
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  function saved(entry: FlavorEntry) {
    setEditing(null);
    setDirty(false);
    setMessage(`Saved ${entry.profile.name}. Existing recipes and remix approvals are unchanged.`);
    setQuery("");
    setStyle("mine");
  }
  async function edit(entry: FlavorEntry) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api<FlavorEntry>(`/flavor-profiles/${entry.id}`);
      library.upsert(data);
      setEditing({
        initial: data.profile,
        id: data.id,
        existing: true,
        key: `${data.id}-${data.revision}`,
      });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }
  function duplicate(entry: FlavorEntry) {
    const initial = structuredClone(entry.profile);
    initial.name = `${initial.name.slice(0, 108)} (my version)`;
    initial.keyIngredients = initial.keyIngredients.map((item) => ({
      ...item,
      ingredientId: ingredients.some((ingredient) => ingredient.id === item.ingredientId)
        ? item.ingredientId
        : null,
    }));
    setEditing({ initial, key: crypto.randomUUID() });
    setMessage("");
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="mb-5 gap-2"
        onClick={() => go("preferences")}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to preferences
      </Button>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            A little inspiration, your own vocabulary
          </p>
          <h1 className="my-3 font-serif text-4xl font-normal tracking-tight sm:text-5xl">
            Your flavour library.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Browse styles and seasoning combinations, or name your own. These cards describe
            flavours—not complete recipes, fixed spice ratios or automatic substitutions.
          </p>
        </div>
        {!editing && (
          <Button
            type="button"
            className="gap-2"
            disabled={library.loading || !!library.error || loading}
            onClick={() => {
              setEditing({ initial: blankFlavor(), key: crypto.randomUUID() });
              setMessage("");
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create a combination
          </Button>
        )}
      </div>
      <output className="my-3 block text-sm text-primary">{message}</output>
      <ErrorBox message={library.error || error} />
      {library.error && (
        <Button type="button" variant="outline" onClick={library.reload}>
          Retry flavour library
        </Button>
      )}
      {editing ? (
        <FlavorForm
          key={editing.key}
          id={editing.id}
          existing={editing.existing}
          initial={editing.initial}
          onDirty={setDirty}
          onCancel={() => {
            setEditing(null);
            setDirty(false);
          }}
          onSaved={saved}
        />
      ) : (
        <>
          <FlavorFilters
            query={query}
            style={style}
            onQuery={setQuery}
            onStyle={setStyle}
            disabled={loading}
          />
          {library.loading ? (
            <Loading label="Loading flavour library…" />
          ) : (
            !library.error && (
              <>
                <p className="mb-5 text-xs text-muted-foreground">
                  {matches.length} {matches.length === 1 ? "combination" : "combinations"} · Style
                  tags are browsing aids, not claims of authenticity.
                </p>
                {!matches.length ? (
                  <Empty title="No combinations match.">
                    <p>Try another style or search term, or create your own combination.</p>
                  </Empty>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {matches.map((entry) => (
                      <Card
                        key={entry.id}
                        className="min-w-0 justify-between p-5 sm:p-6"
                        data-kitchen-flavor-card
                      >
                        <FlavorPreview entry={entry} />
                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.origin === "custom" && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={loading}
                              onClick={() => edit(entry)}
                            >
                              Edit combination
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={loading}
                            onClick={() => duplicate(entry)}
                          >
                            Make my own version
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </>
      )}
    </>
  );
}
