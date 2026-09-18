"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { FieldLabel, Field as UiField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CircleAlert, Leaf } from "lucide-react";
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { type IngredientEntry } from "../../lib/kitchen/client";
import type { DiscoveryConstraints } from "../../lib/kitchen/exploration-client";
export { DishArt } from "./dish-art";

export const KitchenContext = createContext<{
  entries: IngredientEntry[];
  refreshIngredients: () => Promise<void>;
  go: (route: string) => void;
  setDirty: (dirty: boolean) => void;
  discovery: DiscoveryConstraints | null;
  setDiscovery: (value: DiscoveryConstraints | null) => void;
}>({
  entries: [],
  refreshIngredients: async () => {},
  go: () => {},
  setDirty: () => {},
  discovery: null,
  setDiscovery: () => {},
});
export const useKitchen = () => useContext(KitchenContext);
export function useDirty(dirty: boolean) {
  const { setDirty } = useKitchen();
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
export function Field({
  label: title,
  children,
  wide = false,
}: { label: string; children: ReactElement<{ id?: string }>; wide?: boolean }) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  // Keep labels separate from controls so option text never becomes the label.
  return (
    <UiField className={cn("mb-4 min-w-0 gap-2", wide && "col-span-full")}>
      <FieldLabel htmlFor={id} className="text-xs font-semibold">
        {title}
      </FieldLabel>
      {cloneElement(children, { id })}
    </UiField>
  );
}
export function ErrorBox({ message, id }: { message: string; id?: string }) {
  return message ? (
    <Alert
      id={id}
      variant="destructive"
      className="my-4 border-destructive/25 bg-destructive/5 text-destructive"
    >
      <CircleAlert className="size-4" aria-hidden="true" />
      <AlertDescription className="break-words whitespace-pre-wrap text-[13px] leading-relaxed text-destructive">
        {message}
      </AlertDescription>
    </Alert>
  ) : null;
}
export function Loading({ label: message = "Opening your kitchen…" }: { label?: string } = {}) {
  return (
    <div className="block px-6 py-16 text-center text-sm text-muted-foreground">
      <div aria-hidden="true" className="mx-auto mb-5 flex max-w-xs flex-col items-center gap-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <output aria-live="polite" aria-atomic="true">
        {message}
      </output>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="items-center gap-5 border-dashed bg-card/70 px-5 py-14 text-center">
      <Leaf className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="max-w-xl font-serif text-3xl font-normal leading-tight tracking-tight">
        {title}
      </h2>
      <div className="max-w-xl [&>p]:mb-6 [&>p]:text-sm [&>p]:text-muted-foreground">
        {children}
      </div>
    </Card>
  );
}
