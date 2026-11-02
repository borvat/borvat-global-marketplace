# DESIGN.md — BORVAT "Ateliermarkt" tokens

## Type

| Role | Family | Size (clamp) | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| Display XL (hero) | serif | `clamp(2.5rem, 1.4rem + 3.2vw, 4.25rem)` | 400 | 1.02 | -0.02em |
| Display L (section) | serif | `clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)` | 400 | 1.1 | -0.015em |
| Title (product) | serif | `1.0625rem` | 400 | 1.35 | 0 |
| Body | Inter | `0.9375rem` | 400 | 1.65 | 0 |
| Small | Inter | `0.8125rem` | 400 | 1.55 | 0 |
| Label / eyebrow | Inter | `0.6875rem` | 600 | 1.2 | 0.14em, uppercase |
| Price | Inter tabular | `1rem` / `1.25rem` (PDP) | 500 | 1.2 | 0 |

Serif stack: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif` — system only, no CDN, survives the build's no-network guard.

## Palette (light; dark mode keeps structure, inverts ground)

| Token | Value | Role | Contrast on paper |
|---|---|---|---|
| `--background` | `#FAF8F5` | paper ground | — |
| `--foreground` | `#17161A` | ink text | 15.6:1 |
| `--muted-foreground` | `#6B6660` | secondary text | 5.3:1 |
| `--border` | `#E3DED7` | hairline rules | — |
| `--card` | `#FFFFFF` | only for the cart summary and modals | — |
| `--accent` | `#8C2F39` | primary action, price emphasis | 7.4:1 |
| `--accent-soft` | `#F3E7E8` | chip/tag ground | — |
| `--ink` | `#17161A` | dark bands (footer) | — |

Yellow (`--accent-yellow`) is retired from the storefront surface: it read as marketplace promotion. Kept in the token file for legacy screens that still reference it, but no storefront component uses it.

## Space and shape

Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px (`--space-*`).
Radius: `0` for images and rules, `2px` for inputs and buttons, `999px` only for the cart count bubble.
Elevation: one shadow, `0 1px 2px rgb(23 22 26 / 0.06)`, used only on the sticky cart summary.
Grid: container `max-width: 1240px`, gutters 20px mobile / 32px desktop. Listings: 2 columns <640, 3 <1024, 4 ≥1024, `gap: 28px 24px`.

## Imagery

4:5 portrait crops for listing cards, 1:1 inside PDP gallery, `object-fit: cover`. No overlays, no gradients on photography. Missing image keeps the existing generated placeholder. Alt text is the product title.

## Motion

Hover: `opacity` and `transform: scale(1.02)` on the image, 220ms `cubic-bezier(.2,.6,.2,1)`. Focus: 2px accent ring, offset 2px. No entrance animations, no parallax, no auto-rotation. Under `prefers-reduced-motion: reduce` all transforms drop to none.

## Components

| Component | States |
|---|---|
| Header | default / scrolled (hairline + solid paper) / mobile drawer |
| Search field | rest / focus (accent underline) / submitting |
| Product card | rest / hover (image scale, title underline) / missing image |
| Button primary | rest / hover (darken) / focus ring / disabled |
| Button quiet | rest / underline on hover |
| Filter chip | rest / selected (ink fill) |
| Cart line | rest / quantity editing / removed |
| Cart summary | sticky desktop / inline mobile |
| Demo ribbon | always visible, ink ground, small label |

## Accessibility floor

Body ≥ 4.5:1, large display ≥ 3:1, tap targets ≥ 44px, visible focus everywhere, one `h1` per page, heading order preserved, `dir`/language untouched (nl-NL), no letter-spacing on any Arabic text (the storefront ships Dutch only today; the rule applies if Arabic is added).
