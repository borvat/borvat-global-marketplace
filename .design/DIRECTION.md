# DIRECTION.md — three directions, one chosen

## A. "Ateliermarkt" — editorial paper commerce  ← CHOSEN

Promise: objects presented like a well-printed catalogue, not a marketplace feed.
Type: display serif (system: Iowan Old Style / Palatino / Georgia) + Inter for UI, small caps for labels, tabular numerals for prices.
Palette: paper `#FAF8F5`, ink `#17161A`, muted `#6B6660`, hairline `#E3DED7`, one oxblood accent `#8C2F39` reserved for action and price emphasis.
Layout: asymmetric two-column hero (type left, 4:5 image right), hairline rules instead of cards, 12-column grid with generous gutters, image-first listings 4:5.
Motion: 200ms opacity/translate only on hover; nothing loops, nothing parallaxes; `prefers-reduced-motion` respected.
Risk: needs good photography; with weak imagery the calm layout can read as empty. Mitigation: image-led blocks with captions and consistent 4:5 crops, never a wall of identical cards.

## B. "Zwitsers schap" — Swiss product grid

Promise: maximum clarity, catalogue density, industrial sans only.
Rejected: it is the register the current build already drifts toward (bold weights, cards, yellow accents). Choosing it would not fix the owner's complaint, and density without strong photography reads cheap.

## C. "Avondwinkel" — cinematic dark scroll

Promise: large type on near-black, layered depth, scroll-driven reveals.
Rejected: a lifestyle shop must be trustworthy and legible for comparing prices; dark cinema fights price legibility, invites decorative animation, and the brief explicitly bans decoration without purpose. Also worse for the demo banner and long Dutch product names.

## What is borrowed, and from where

| Reference | Borrowed principle | Explicitly not |
|---|---|---|
| Aesop storefront (public site) | paper ground, hairline rules, type doing the work, no card chrome | their copy, layout, photography |
| Kinfolk / Cereal print spreads | editorial serif display, generous margins, caption discipline | page templates, imagery |
| Skagerak / ferm LIVING (furniture D2C) | 4:5 product crops, muted palette, sticky buy box | their components, assets |
| Dutch book trade catalogues | small caps labels, tabular prices, quiet density | anything literal |

No assets were copied. Photography comes from whatever the application already returns for a product; where an image is missing, the existing generated placeholder is kept and labelled by alt text — never replaced with a stock photo that misrepresents the object.
