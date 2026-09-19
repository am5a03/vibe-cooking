import { FlavorName } from './flavor-context';
import { label, type RecipeDocument } from "@/lib/kitchen/client";
import { cn } from "@/lib/utils";
import { Bean, EggFried, Fish, Leaf, Soup, Wheat } from "lucide-react";

/** Product illustration with self-contained, responsive utilities. */
export function DishArt({ recipe, large = false }: { recipe: RecipeDocument; large?: boolean }) {
  const Icon =
    recipe.main === "salmon"
      ? Fish
      : recipe.main === "eggs"
        ? EggFried
        : recipe.main === "lentils"
          ? Bean
          : recipe.main === "oats"
            ? Wheat
            : Soup;
  return (
    <div
      aria-hidden="true"
      data-kitchen-dish-art
      className={cn(
        "relative flex h-[210px] shrink-0 items-center justify-center overflow-hidden bg-[#e4ead8] sm:h-[205px]",
        "before:absolute before:-right-[78px] before:-top-[83px] before:size-[180px] before:rounded-full before:border before:border-white/50",
        "after:absolute after:-left-[120px] after:top-[140px] after:size-[180px] after:rounded-full after:border after:border-white/50",
        recipe.mode === "breakfast" && "bg-[#f0e4d0]",
        large && "h-[235px] rounded-t-xl sm:h-[280px]",
      )}
    >
      <span className="absolute left-[17px] top-[17px] rounded bg-[#fffef6ba] px-2 py-1 text-[10px] uppercase tracking-wider text-foreground">
        {label(recipe.method)}
      </span>
      <div
        className={cn(
          "relative grid size-[150px] -rotate-[10deg] place-items-center rounded-full border-[7px] border-[#fffdf5] bg-[#fcf8e9] text-[#738151] shadow-[7px_9px_0_#63754920] outline outline-[#ddd9c6]",
          large && "size-[196px]",
        )}
      >
        <Icon className={large ? "size-[99px]" : "size-[78px]"} strokeWidth={1.1} />
        <Leaf
          className="absolute bottom-4 right-1.5 size-[34px] rotate-40 text-[#476b42]"
          strokeWidth={1.3}
        />
      </div>
      <span className="absolute bottom-[13px] left-[18px] text-[10px] uppercase tracking-[.15em] text-[#627458]">
        {<FlavorName id={recipe.flavor}/>}
      </span>
    </div>
  );
}
