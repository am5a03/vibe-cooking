'use client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Leaf, Soup, Fish, EggFried, Bean, Wheat } from 'lucide-react';
import { label, type IngredientEntry, type RecipeDocument } from '../../lib/kitchen/client';

export const KitchenContext = createContext<{
  entries: IngredientEntry[];
  refreshIngredients: () => Promise<void>;
  go: (route: string) => void;
  setDirty: (dirty: boolean) => void;
}>({ entries: [], refreshIngredients: async () => {}, go: () => {}, setDirty: () => {} });
export const useKitchen = () => useContext(KitchenContext);
export function useDirty(dirty: boolean) {
  const { setDirty } = useKitchen();
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
}
export function Field({ label: title, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? ' wide' : ''}`}><span>{title}</span>{children}</label>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? <div className="notice error" role="alert">{message}</div> : null;
}
export function Loading() { return <div className="loading" role="status">Opening your kitchen…</div>; }
export function DishArt({ recipe }: { recipe: RecipeDocument }) {
  const Icon = recipe.main === 'salmon' ? Fish : recipe.main === 'eggs' ? EggFried : recipe.main === 'lentils' ? Bean : recipe.main === 'oats' ? Wheat : Soup;
  return <div className={`dish-art art-${recipe.mode}`} aria-hidden="true"><span className="art-caption">{label(recipe.method)}</span><div className="plate"><Icon size={78} strokeWidth={1.1}/><Leaf className="plate-leaf" size={34} strokeWidth={1.3}/></div><span className="art-bottom">{label(recipe.flavor)}</span></div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><Leaf size={32}/><h2>{title}</h2><div>{children}</div></div>;
}
