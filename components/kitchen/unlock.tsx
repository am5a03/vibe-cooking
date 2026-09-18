"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Leaf, LoaderCircle, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorText } from "@/lib/kitchen/client";
import { ErrorBox } from "./shared";

export function Unlock({ expired, onUnlock }: { expired: boolean; onUnlock: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();
  const headingId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (error && !busy) input.current?.focus();
  }, [error, busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guard repeated Enter/submission events before React paints the disabled state.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/session", { method: "POST", value: { key } });
      onUnlock();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setKey("");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <main className="unlock-layout">
      <div className="unlock-story">
        <span className="eyebrow">A kitchen of your own</span>
        <h1>
          Good food.
          <br />
          <em>Your way.</em>
        </h1>
        <p>
          Keep the recipes you love.
          <br />
          Make room for something new.
        </p>
        <div className="story-mark" aria-hidden="true">
          <Leaf size={118} strokeWidth={0.8} />
        </div>
      </div>
      <Card
        role="region"
        aria-labelledby={headingId}
        className="min-w-0 gap-0 rounded-[17px] p-[26px] shadow-[0_10px_40px_#1a2e1e06] min-[681px]:p-[38px]"
      >
        <CardHeader className="gap-0 p-0">
          <LockKeyhole className="mb-6 size-[26px] text-primary" aria-hidden="true" />
          <Badge
            variant="secondary"
            className="mb-3 max-w-full whitespace-normal rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide"
          >
            Vibe Cooking / Personal kitchen
          </Badge>
          <CardTitle className="mb-5 font-serif text-[37px] font-normal leading-[1.15] tracking-[-0.035em]">
            <h2 id={headingId}>{expired ? "Welcome back." : "Come on in."}</h2>
          </CardTitle>
          <CardDescription className="mb-5 text-[13px] leading-relaxed">
            {expired
              ? "Unlock again to continue. Unsaved changes are kept in this tab."
              : "Unlock your private recipe studio with the API_TOKEN you configured on the server."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={submit} aria-busy={busy}>
            <Field className="mb-[18px] gap-2" data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={fieldId} className="text-xs font-semibold">
                Private kitchen key
              </FieldLabel>
              <Input
                ref={input}
                id={fieldId}
                type="password"
                autoComplete="current-password"
                required
                minLength={32}
                maxLength={256}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder="Paste your private key"
                className="h-11 rounded-[7px] bg-card px-[11px] shadow-none md:text-[15px]"
              />
            </Field>
            <ErrorBox id={errorId} message={error} />
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full gap-2 text-[13px] font-semibold"
            >
              {busy ? "Unlocking…" : "Unlock my kitchen"}
              {busy ? (
                <LoaderCircle className="size-[17px] animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-[17px]" aria-hidden="true" />
              )}
            </Button>
          </form>
          <span role="status" aria-live="polite" className="sr-only">
            {busy ? "Unlocking your kitchen…" : ""}
          </span>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            No registration. The app does not save your key in browser storage. Your session lasts
            up to eight hours.
          </p>
          <details className="mt-6 border-t pt-[18px] text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              First time here?
            </summary>
            <p className="mt-4 leading-relaxed">
              Apply the new browser-session migration with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                npm run db:migrate:local
              </code>
              . Keep using your existing{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">API_TOKEN</code>; no
              second secret is required. For a remote instance, apply reviewed remote migrations
              instead.
            </p>
          </details>
        </CardContent>
      </Card>
    </main>
  );
}
