"use client";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { RecipeDocument, RecipeImage } from '@/lib/kitchen/types';
import covers from '@/lib/kitchen/seed-covers.json';
import { DishArt } from './dish-art';
import { Field } from './shared';

/** Controlled editor fields inherit the existing dirty-state and save/conflict lifecycle. */
export function CoverPicker({ recipe, onChange, disabled }: {
  recipe: RecipeDocument; onChange: (image: RecipeImage | undefined) => void; disabled: boolean;
}) {
  const current = recipe.image;
  const bundled = covers.some((cover) => cover.image.src === current?.src);
  function update(patch: Partial<RecipeImage>) {
    if (current) onChange({ ...current, ...patch });
  }
  return (
    <Card className="mb-6 min-w-0 gap-4 rounded-xl p-5 sm:p-7">
      <h2 className="font-serif text-2xl font-normal">Recipe cover</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">Optional. These image files are public. Choose a serving illustration or use your own file in public/images/recipes. Selecting a cover does not change the ingredients.</p>
      <Field label="Choose a cover">
        <NativeSelect disabled={disabled} value={!current ? "" : bundled ? current.src : "custom"}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) onChange(undefined);
            else if (value === "custom") onChange({ src: '', alt: recipe.title, width: 1200, height: 900, kind: 'photo', credit: '' });
            else {
              const found = covers.find((cover) => cover.image.src === value);
              if (found) onChange({ ...found.image, kind: 'illustration' });
            }
          }}>
          <NativeSelectOption value="">Use default artwork</NativeSelectOption>
          {covers.map(cover => <NativeSelectOption key={cover.image.src} value={cover.image.src}>{cover.title}</NativeSelectOption>)}
          <NativeSelectOption value="custom">My public image file</NativeSelectOption>
        </NativeSelect>
      </Field>
      {current && <>
        <div className="grid min-w-0 grid-cols-1 gap-x-5 sm:grid-cols-2">
          <Field label="Public image path" wide><Input required maxLength={240} disabled={disabled} value={current.src}
            placeholder="/images/recipes/my-dish.webp" onChange={e => update({ src: e.target.value })}/></Field>
          <Field label="Image description" wide><Input required maxLength={300} disabled={disabled} value={current.alt} onChange={e => update({ alt: e.target.value })}/></Field>
          <Field label="Image width"><Input required type="number" min={1} max={8192} disabled={disabled} value={current.width} onChange={e => update({ width: Number(e.target.value) })}/></Field>
          <Field label="Image height"><Input required type="number" min={1} max={8192} disabled={disabled} value={current.height} onChange={e => update({ height: Number(e.target.value) })}/></Field>
          <Field label="Image type"><NativeSelect disabled={disabled} value={current.kind} onChange={e => update({ kind: e.target.value as RecipeImage['kind'] })}>
            <NativeSelectOption value="photo">Photograph</NativeSelectOption><NativeSelectOption value="illustration">Serving illustration</NativeSelectOption>
          </NativeSelect></Field>
          <Field label="Image credit"><Input maxLength={300} disabled={disabled} value={current.credit} onChange={e => update({ credit: e.target.value })}/></Field>
        </div>
        <div className="max-w-sm overflow-hidden rounded-xl border"><DishArt recipe={recipe}/></div>
        <p className="text-xs text-muted-foreground">Missing or invalid files show the default artwork. Add your file to the repository and deploy it before using its path on the live app.</p>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(undefined)}>Remove cover</Button>
      </>}
    </Card>
  );
}
