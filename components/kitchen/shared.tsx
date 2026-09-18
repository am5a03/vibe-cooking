'use client';
import { cloneElement, createContext, useContext, useEffect, useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert, Leaf, Soup, Fish, EggFried, Bean, Wheat } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiscoveryConstraints } from '../../lib/kitchen/exploration-client';
import { label, type IngredientEntry, type RecipeDocument } from '../../lib/kitchen/client';

export const KitchenContext = createContext<{
  entries: IngredientEntry[];
  refreshIngredients: () => Promise<void>;
  go: (route: string) => void;
  setDirty: (dirty: boolean) => void;
  discovery: DiscoveryConstraints | null;
  setDiscovery: (value: DiscoveryConstraints | null) => void;
}>({ entries: [], refreshIngredients: async () => {}, go: () => {}, setDirty: () => {}, discovery: null, setDiscovery: () => {} });
export const useKitchen = () => useContext(KitchenContext);
export function useDirty(dirty: boolean) {
  const { setDirty } = useKitchen();
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
}
export function Field({ label: title, children, wide = false }: { label: string; children: ReactElement<{ id?: string }>; wide?: boolean }) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  // Transitional adapter: migrate only the label. Keeping the wrapper without
  // data-slot preserves the existing native control/layout styles until Phase 3.
  // The label remains a sibling so select options never become part of its name.
  return <div className={`field${wide ? ' wide' : ''}`}><Label htmlFor={id} className="text-xs font-semibold">{title}</Label>{cloneElement(children, { id })}</div>;
}
export function ErrorBox({ message, id }: { message: string; id?: string }) {
  return message ? (
    <Alert id={id} variant="destructive" className="my-4 border-destructive/25 bg-destructive/5 text-destructive">
      <CircleAlert className="size-4" aria-hidden="true" />
      <AlertDescription className="break-words whitespace-pre-wrap text-[13px] leading-relaxed text-destructive">{message}</AlertDescription>
    </Alert>
  ) : null;
}
export function Loading({ label: message = 'Opening your kitchen…' }: { label?: string } = {}) {
  return (
    <div className="block px-6 py-16 text-center text-sm text-muted-foreground">
      <div aria-hidden="true" className="mx-auto mb-5 flex max-w-xs flex-col items-center gap-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <output aria-live="polite" aria-atomic="true">{message}</output>
    </div>
  );
}
export function DishArt({ recipe }: { recipe: RecipeDocument }) {
  const Icon = recipe.main === 'salmon' ? Fish : recipe.main === 'eggs' ? EggFried : recipe.main === 'lentils' ? Bean : recipe.main === 'oats' ? Wheat : Soup;
  return <div className={`dish-art art-${recipe.mode}`} aria-hidden="true"><span className="art-caption">{label(recipe.method)}</span><div className="plate"><Icon size={78} strokeWidth={1.1}/><Leaf className="plate-leaf" size={34} strokeWidth={1.3}/></div><span className="art-bottom">{label(recipe.flavor)}</span></div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><Leaf size={32}/><h2>{title}</h2><div>{children}</div></div>;
}
