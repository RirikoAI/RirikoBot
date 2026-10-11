# Waifu TCG Visual Card Synthesis & Holographic Foil Engine Specification

## 1. Executive Summary
This document specifies the architecture, visual composition layer stack, holographic foiling system, and CLI builder tooling for the **Ririko AI 2.0.0 Waifu TCG Visual Card Synthesis Engine**.

The engine transforms raw character images into complete, premium, collectible physical-style TCG cards rendered at **800 × 1200 px** using `@napi-rs/canvas`.

---

## 2. Card Visual Anatomy & Layer Stack

Each card is rendered sequentially in 8 discrete layers:

```text
┌────────────────────────────────────────────────────────┐
│  [Layer 7] Top-Left Element Icon & Elemental Badge     │
│  [Layer 6] Rarity Stars (Centered, Above Footer)       │
│  [Layer 5] Character Name Banner & Title Ribbon (Top)  │
│  [Layer 4] Holographic Foil Overlay (Blend: Overlay)   │
│  [Layer 3] Card Frame & Metallic Borders               │
│  [Layer 2] Stat Footer & Skill Box (Bottom Overlay)    │
│  [Layer 1] Character Artwork (Centered Art Window)     │
│  [Layer 0] Background Canvas / Elemental Aura          │
└────────────────────────────────────────────────────────┘
```

### Layer Breakdown
1. **Layer 0 — Elemental Aura & Canvas Base**:
   - Solid dark canvas with a radial elemental gradient originating from the center.
   - Fire: `#ff4500` / `#2a0800`
   - Ice: `#00bfff` / `#001a33`
   - Water: `#1e90ff` / `#051329`
   - Earth: `#22c55e` / `#08240f`
   - Lightning: `#eab308` / `#261d02`
   - Light: `#f8fafc` / `#334155`
   - Shadow: `#a855f7` / `#1e0836`
2. **Layer 1 — Character Artwork**:
   - Drawn from the local artwork cache (`data/tcg/images/`), a local path or a direct URL. Artwork comes from Danbooru (safe-rated, solo, portrait) with AniList portraits as fallback; see §5.2.
   - Fitted with aspect-ratio preservation (`cover`), anchored near the top so faces stay in frame, with 16px corner radius clipping.
3. **Layer 2 — Glassmorphic Stat & Skill Footer**:
   - Translucent dark container (`rgba(15, 23, 42, 0.85)`) with a 1px border.
   - Displays 4 core stats (HP, ATK, DEF, SPD) as large centered values under small labels.
   - Displays the Active Tactical Skill name with an MP badge and the Passive Perk, each with a description of up to two lines.
   - Sized for Discord previews: see §5.6.
4. **Layer 3 — Card Frame**:
   - Rarity-themed border frame.
   - Common/Uncommon: Slate / Bronze metallic frame.
   - Rare: Polished Silver frame with filigree accents.
   - Super Rare: Gilded 24k Gold filigree frame.
   - Ultra Rare: Platinum / Obsidian frame with glowing runes.
   - Secret Rare / SIR / Mythic: Full-art extension frame with ornate corner crests.
5. **Layer 4 — Holographic Foil Overlay**:
   - Blended onto the card using canvas composite operations (`overlay`, `color-dodge`, `hard-light`).
   - Renders holographic rainbow glints, prismatic cross-hatches, or cosmic star glitter.
6. **Layer 5 — Top Nameplate & Series Ribbon**:
   - Top-anchored banner with character name in bold modern typography.
   - Sub-caption indicating anime title or character subtitle.
   - Drop shadow and subtle stroke for legibility over bright art.
7. **Layer 6 — Rarity Stars**:
   - Centered row of 1 to 8 stars on a dark pill, just above the footer.
   - Gold for Common through Super Rare; Prismatic/Holo for Ultra Rare through Mythic.
8. **Layer 7 — Top-Left Element Emblem**:
   - 96×96 px circular jewel emblem positioned at `(24, 24)` on the top-left.
   - Contains the element icon (Flame, Frost, Wave, Gaia, Bolt, Solar, Void) surrounded by an elemental glow ring.

---

## 3. Rarity Foiling Specifications

| Rarity | Tier | Stars | Foil Type | Blend Mode | Visual Treatment |
|---|---|---|---|---|---|
| **COMMON** | 1 | ⭐ | None | `source-over` | Clean matte finish, no metallic foil. |
| **UNCOMMON** | 2 | ⭐⭐ | Bronze Trim | `soft-light` | Subtle bronze metallic gloss on frame borders. |
| **RARE** | 3 | ⭐⭐⭐ | Silver Prismatic | `overlay` | Diagonal rainbow holographic sheen reflecting across art. |
| **SUPER_RARE** | 4 | ⭐⭐⭐⭐ | Gold Sparkle | `color-dodge` | Gold leaf border with floating starlight sparkle particles. |
| **ULTRA_RARE** | 5 | ⭐⭐⭐⭐⭐ | Spectral Holo | `hard-light` | Multi-angle spectral rainbow refraction across the portrait. |
| **SECRET_RARE** | 6 | ⭐⭐⭐⭐⭐⭐ | Cross-Hatch Laser | `color-dodge` | High-density diagonal cross-hatch laser foil. |
| **SIR** | 7 | ⭐⭐⭐⭐⭐⭐⭐ | Full-Art Pearlescent | `overlay` + `screen` | Frameless full-bleed art with iridescent pearlescent shimmer. |
| **MYTHIC** | 8 | ⭐⭐⭐⭐⭐⭐⭐⭐ | Cosmic Celestial | `color-dodge` | Deep nebula glow, golden starlight flares, celestial aura. |

> **Hybrid Engine Architecture**:
> If a PNG file exists at `assets/tcg/foils/<rarity>.png`, the engine uses it directly. If no PNG is found, the engine falls back to an ultra-crisp procedural canvas shader that mathematically draws the holographic gradient, so the cards look fully foiled out-of-the-box.

---

## 4. Modular Asset Directory Structure

All visual components reside under `assets/tcg/` to allow artists and operators to drop in or replace any PNG at any time:

```text
assets/tcg/
├── elements/                 # Element emblems (Top-Left 96x96 px)
│   ├── fire.png
│   ├── ice.png
│   ├── water.png
│   ├── earth.png
│   ├── lightning.png
│   ├── light.png
│   └── shadow.png
├── stars/                    # Star emblems (row above footer)
│   ├── star.png              # Base golden star icon
│   └── star_prismatic.png    # Prismatic star for UR/SEC/SIR/Mythic
├── foils/                    # Foil overlay textures (800x1200 px PNG with transparency)
│   ├── rare.png
│   ├── super_rare.png
│   ├── ultra_rare.png
│   ├── secret_rare.png
│   ├── sir.png
│   └── mythic.png
├── frames/                   # Card borders & frames (800x1200 px PNG)
│   ├── common.png
│   ├── rare.png
│   ├── super_rare.png
│   ├── ultra_rare.png
│   └── mythic.png
└── fonts/                    # Bundled typography
    └── Inter-Bold.ttf
```

---

## 5. Tooling: `tcg-card-builder` CLI & Script

Run via:
```bash
pnpm tcg:card-builder --help
```

### 5.1. Data Files

| Path | Purpose | In git |
|---|---|---|
| `assets/tcg/catalog/characters.json` | Character catalog: name, anime, element, tags. `--sync` fills `anilistId`, `favourites`, `danbooruTag` and `image` (URL, source, credit). Edit by hand to add characters or override a wrong `danbooruTag`/`image`. | Yes |
| `assets/tcg/catalog/manifest.json` | Every generated card: DB ids, rarity, stats, skill, passive, collection number, `isStarter`, `textScale`. The single source for re-rendering. | Yes |
| `data/tcg/images/<key>.<ext>` | Downloaded artwork cache. Rebuild with `--sync`. | No |
| `public/cards/<cardId>.png` | Rendered 800×1200 cards. | — |

### 5.2. Artwork Sources & Rate Limits

1. **AniList GraphQL** (no key): finds the character by name, matched against the anime title. Supplies the AniList id, the favourites count (used for rarity weighting) and a 230×345 fallback portrait. Limited to 1 request per 2.5 s (AniList allows 30–90/min).
2. **Danbooru** (anonymous): resolves the character tag (series qualifier and aliases, e.g. `soi_fon` → `sui-feng`) and picks the highest-scored `rating:g`, solo, portrait artwork. Credits the artist on the card. Limited to 1 request/s.
3. Image downloads: 1 request per 0.5 s.

All clients retry `429` (honouring `Retry-After`) and `5xx` with exponential backoff. A failed lookup becomes a warning; the character falls back to the AniList portrait, then to the silhouette.

### 5.3. Commands

```bash
# Resolve API data + download artwork for the whole catalog (resumable, skips done entries)
pnpm tcg:card-builder --sync
# Re-resolve specific characters
pnpm tcg:card-builder --sync --force --only=frieren__frieren_beyond_journey_s_end

# Generate by rarity (repeat --rarity/--count pairs, optional element filter)
pnpm tcg:card-builder --generate --rarity=COMMON --count=10
pnpm tcg:card-builder --generate --rarity=MYTHIC --count=2 --rarity=SIR --count=3 --element=ICE

# Starter pool: COMMON cards spread across elements, mid-roll stats
pnpm tcg:card-builder --starters --count=10

# Re-render from the manifest (same stats), optionally refetching art or resizing text
pnpm tcg:card-builder --rerender
pnpm tcg:card-builder --rerender --refetch-images --only=<cardId|characterKey>
pnpm tcg:card-builder --rerender --text-scale=1.1

# Adopt existing waifu_cards rows (e.g. from the old bulk generator) into the manifest:
# keeps ids, rarity, stats and collection numbers, maps each to a catalog character, re-renders
pnpm tcg:card-builder --import-db

# One custom card (adds the character to the catalog if new)
pnpm tcg:card-builder --create --name="Tohsaka Rin" --anime="Fate/stay night" --element=FIRE --rarity=ULTRA_RARE --image="https://example.com/rin.png"
```

`--dry-run` renders and updates the manifest but skips database writes. A later run without it (for example `--rerender`) upserts the rows by their manifest ids.

### 5.4. Character Selection

- Characters with no card at the requested rarity are picked first; repeats only happen once every candidate has one.
- Weighting uses AniList favourites: COMMON leans toward less popular characters, MYTHIC toward the most popular ones.
- Starter characters are reserved: a starter's character never appears at other rarities, so its asset maps to exactly one card.

### 5.5. Starter Pool

`--starters` tags each starter asset with `starter_pool`. `TutorialService.ensureStarterCard` grants a random active card from that pool (next serial number). With an empty pool it falls back to Flame Novice Aria.

### 5.6. Text Size

Discord shows cards at about half size (~400 px wide). The layout keeps body text at 22 px or more and headlines at 28 px or more, wraps skill and passive descriptions to two lines, and shrinks long text before truncating it. `--text-scale` (0.8–1.2) multiplies all text sizes and is saved per card in the manifest.

### 5.7. Bot Display

`/card claim` and `/card inspect` attach the full rendered card (`attachment://card.png`) via `CardImageService`:

- Uses the builder's `public/cards/<cardId>.png` when it exists.
- Otherwise renders once from the `waifu_cards` row and the asset's cached art, then caches the PNG there. These on-demand renders print the source attribution, not the per-artist credit.
- A taken-down asset (`isDeletedByRequest`) always renders as a silhouette, and the cached PNG with the removed art is deleted.
- If rendering fails, the text embed is still sent.

Paths such as `public/cards`, `assets/tcg` and `data/tcg/images` resolve against the workspace root (`resolveWorkspacePath` in `@ririko/core`), so they work when the bot runs from `apps/bot`.
