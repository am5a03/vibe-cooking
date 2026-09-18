Generated with shadcn@4.21.0 add button card field input alert skeleton badge --yes
Configuration: new-york, Tailwind 4, React 19, Radix-backed primitives.
Source: https://ui.shadcn.com/ ; MIT license: ./LICENSE.md

Local adjustments: use the existing @/lib/utils cn helper instead of an additional cn package; use unique error messages as FieldError keys rather than array indexes; apply repository formatting.

Phase 3 (2026-09-18): added New York/Radix `textarea`, `native-select`, `checkbox`
and `collapsible` using the shadcn CLI. Normalized generated `cn` imports to the
existing local utility without changing the theme or Radix version. NativeSelect
is adapted for fluid wrappers, 16px mobile text, native numeric row counts, and
multiple-selection listboxes without a misleading chevron. Other generated
primitive behavior is unchanged.

Phase 4 (2026-09-18): generated New York/Radix `alert-dialog` with
`shadcn@4.21.0 add alert-dialog --yes --overwrite` in an isolated branch preparation.
Restored the existing Button, theme, configuration and dependency lock afterward;
only the new primitive is retained. Its cn import uses @/lib/utils. Session and
confirmation lifecycle policy lives in components/kitchen, not this primitive.
