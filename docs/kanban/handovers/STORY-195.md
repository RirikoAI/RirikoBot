# STORY-195 · Ririko Brand Identity and a Redesigned ririko.ai Home Page

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-18T09:30:00Z · claude-opus-5-5 (coordinator) · brand system and art direction

**Maintainer request (2026-10-18)**
- Corporate identity for the website, the docs, the installers (the `ririko setup` wizard), the dashboard and the README design.
- Main font: Sour Gummy. Secondary font: Libre Franklin (both Google Fonts, SIL OFL 1.1).
- Official pink: `#DF6E7E`. Keep the rest of the sakura theme.
- Redesign the Docusaurus home page: distinctive, character-led, section-based, with a vertical dot navigator. Keep the interactive Discord demo working and unchanged inside.

**Split**
- TASK-1951: fonts and colour tokens on the site, docs, dashboard and wizard. Everything else builds on it.
- TASK-1952: README banner and social card (SVG, renderer, PNG/ORA export).
- TASK-1953: home page part 1 (hero, Meet Ririko, section navigator, scroll snapping).
- TASK-1954: home page part 2 (abilities, open source, get started and FAQ, final responsive and accessibility pass).

Work happens on branch `feat/STORY-195-brand`, cut from `feat/STORY-190-readme` (the README banner of STORY-190 is not merged yet). Workers never commit.

### 1. Brand tokens (one set of names everywhere)

| Token | Value | Use |
|---|---|---|
| `pink` | `#DF6E7E` | The official pink. Wordmark, accents, active states, focus rings, text on ink (5.9:1 on `#0f0d17`). Never white text on it (3.2:1). |
| `pink-deep` | `#B8475A` | Buttons with white text (5.1:1), links on white or cream (4.8:1 on `#FFF6F1`), Docusaurus light-mode primary. |
| `pink-hover` | `#C24F63` | Hover of a `pink-deep` button that keeps white text (4.6:1). |
| `pink-tint` | `#F6C3CA` | Soft accents on ink: rules, quiet highlights, scallop edges. |
| `pink-wash` | `#FBE5E8` | Very light pink fills on cream. |
| `paper` | `#FFF6F1` | Cream "day" sections of the home page (warm, from the bed sheets of the hero art). |
| `ink` | `#0f0d17` | Unchanged sakura value. "Night" sections, text on paper. |
| `panel` | `#1a1726` | Unchanged. |
| `edge` | `#2c2840` | Unchanged. |
| `text` | `#e7e5f0` | Unchanged. |
| `muted` | `#a29fb5` | Unchanged (on ink only; on paper use ink at 70 % alpha, which is 6:1+). |
| ok, warn, error | unchanged | |

The dashboard and the wizard keep their token names (`--color-sakura`, `--color-sakura-strong`): `sakura` becomes `#DF6E7E`, `sakura-strong` becomes `#B8475A`, and a new `sakura-hover` is `#C24F63`.

### 2. Typography

- **Sour Gummy** is Ririko's voice: wordmark, page titles, h1 and h2, section numbers ("01"), big numerals and the navbar title. Weights 600 to 800 for display. Rounded and playful: it carries the character.
- **Libre Franklin** is the product: body text, UI, navigation, buttons, forms, tables, h3 to h6. Weights 400 (body), 600 (UI), 700 (buttons). Sturdy and plain: it carries the trust.
- Self-hosted woff2 only, never the Google Fonts CDN (the privacy notice of STORY-193 and the wizard's "no other host" test). Get the files from the Google Fonts CSS API with a modern browser user agent (it answers with variable woff2 per subset): `https://fonts.googleapis.com/css2?family=Sour+Gummy:wght@400..800&family=Libre+Franklin:wght@400..800&display=swap`. Use the `latin` and `latin-ext` subsets and copy their `unicode-range` lines. Licences: `https://raw.githubusercontent.com/google/fonts/main/ofl/sourgummy/OFL.txt` and `.../ofl/librefranklin/OFL.txt`.
- Static TTF (for the README renderer, TASK-1952): the same CSS API without a browser user agent (plain `curl`) answers with static `.ttf` per requested weight, for example `css2?family=Sour+Gummy:wght@800`. Checked during grooming: `@napi-rs/canvas` ignores the weight axis of the variable TTF, but static instances registered under one family pick the right weight.

### 3. Home page art direction: "Ririko by day, your server by night"

The README banner already sets the pattern: a light, pink-and-cream hero with a big pink wordmark, then dark sections. The site follows it, so the README, the social card and ririko.ai read as one brand.

- **Rhythm**: hero (paper, day) → Meet Ririko (ink, night) → abilities (ink to panel) → open source "Yours to run" (paper, day) → get started and FAQ (ink, night) → footer (ink). The home page uses these fixed colours in both Docusaurus colour modes, like the README banner.
- **Signature motif, the gummy edge**: where a paper section meets an ink one, the edge is a row of soft rounded scallops (CSS `mask` with a repeating radial gradient, or one small inline SVG), about 24 px tall. It echoes the round letterforms of Sour Gummy. Use it only at day/night boundaries, nowhere else.
- **Section numbers**: each section after the hero has a small Sour Gummy number in pink ("01 Meet Ririko", "02 What Ririko can do", ...), the same labels as the section navigator. No pill badges above headings.
- **Buttons**: Libre Franklin 700, 12 to 14 px radius, min-height 48 px. Primary: `pink-deep` fill, white text, a 3 px darker bottom edge (a pressed sticker), lifts 2 px on hover. Secondary: ink outline on paper, white outline on ink.
- **Surfaces**: rules and whitespace before boxes. No glassmorphism, no blurred gradient blobs, no neon glow, no identical card grid. The only framed things are screenshots, the demo and the card art.
- **Motion**: CSS first. Hero entrance (fade and 12 px rise, 80 ms stagger, art settles from scale 1.03 over 1.2 s); hovers 150 to 200 ms; section reveal with `animation-timeline: view()` inside `@supports`. Everything off under `prefers-reduced-motion: reduce`, and everything visible if animations or JavaScript do not run.

**Hero (desktop)**. Paper background. `ririko-hero.webp` (1672x940; her face is at about 28 % x, 35 % y; the bunny is lower left) is an `<img>` in the left 60 % of the hero, full height, `object-fit: cover`, `object-position: 28% 35%`, with a `mask-image` gradient that dissolves its right edge into the paper. No dark scrim: the bright art is the point. The content column sits on the right on paper:
1. `h1`: "Ririko AI". "Ririko" in Sour Gummy 800, `pink`, about `clamp(4.5rem, 9vw, 9rem)`, line-height 0.9; "AI" smaller, in ink.
2. Tagline in Sour Gummy 600, ink, about `clamp(1.5rem, 2.4vw, 2.25rem)`: "The Discord bot for music, cards, AI chat and your whole server." (the README banner tagline).
3. One line in Libre Franklin, ink at 75 %: open source under MIT, run it yourself with Docker.
4. CTAs: primary "Run your own Ririko" → `/docs/deployment`; secondary "Join the support server" → the configured support server link; a text link "Browse all N commands" → `/commands`. **There is no public invite link** (the FAQ says it opens when 2.0 launches). Do not invent one.
5. Cover lines (magazine style, not badges): three items split by thin vertical rules, each a big Sour Gummy value in `pink-deep` over a small Libre Franklin label: command count ("slash and prefix"), category count ("categories"), "MIT" ("open source, self-hosted"). Counts come from `commands.json`.
6. Scroll cue at the bottom centre: a small "Meet Ririko" link with a down arrow, to `#meet`. It does not bob.

**Hero (below 997 px)**. The art goes on top, about 55svh tall, cropped on her face and the bunny, fading into paper at the bottom; content below, left-aligned; CTAs full width; cover lines in one compact row.

**Meet Ririko (#meet)**. Ink, gummy edge at the top. Header left-aligned in the container: "01", h2 "Meet Ririko", the current intro text, and one line "Try:" with the commands the demo really answers (read the demo script). The demo gets the full container width (about 1240 px). The section background is two-tone: ink above, `panel` from the middle of the demo down, so the window sits on a "desk". Do not edit anything in `website/src/components/DiscordDemo/`.

**Abilities (#abilities)**. "02 What Ririko can do". Editorial, unequal weights: Waifu TCG is the lead (the three demo cards `card-r/sr/ur.webp` fanned at -8, 0 and 8 degrees, spreading a little on hover), Music second (`docs/img/music-now-playing.webp` in a frame), AI chat and images as a typographic block ("Gemini, OpenAI or Ollama" in Sour Gummy). Then Economy and levels, Moderation, and Mini-games and fun as a ruled three-column list. Then a typographic wall of every command category with its count from `commands.json`, linking to `/commands`.

**Open source (#open-source)**. "03 Yours to run", paper, gummy edges. The facts (MIT, Docker, SQLite or PostgreSQL, the setup wizard, the 1.4 migration, the dashboard with Discord or passkey sign-in) as a ruled definition list; `docs/img/dashboard-overview.webp` in a simple frame; a dark code block with the README quick-start commands of steps 1 to 3, copied exactly, no output. Links: GitHub, `/docs/deployment`, `/docs/upgrading-from-1.4`.

**Get started (#get-started)**. "04 Get started", ink, natural height (no snap). Three large typographic rows: run your own, join the support server, browse the commands. The true note about the invite link. The FAQ (current content) in two columns on desktop: a sticky heading on the left, the `details` list on the right with a CSS plus/minus marker and a visible focus ring.

**Section navigator**. Fixed at the right edge, vertically centred, from 997 px up. Five anchors (Ririko, Meet, Abilities, Open source, Get started). Each is an 8 px dot that must show on both paper and ink (an ink fill with a light ring); the active one becomes a 28 px tall `pink` pill. The label appears to the left on hover and focus. IntersectionObserver picks the active section. Plain anchors still work without JavaScript.

**Scroll**. Home page only, via a class on `html` (`<Head><html className="..." /></Head>`): `scroll-snap-type: y proximity` and `scroll-padding-top: var(--ifm-navbar-height)` from 997 px up; `scroll-behavior: smooth` only without reduced motion. Hero, meet, abilities and open source snap to start; get started does not. No wheel or touch hijacking.

**Docusaurus rules**. Docusaurus bundles all CSS modules into every page, so home styles stay in `index.module.css` / component modules (hashed class names). The only global selector allowed is `:global(html.<home class>)`. Never style bare `html`, `body`, `main` or `.navbar` from the home page.

**Pitfalls**
- `pink` on `paper` is 2.95:1. That is fine for the "Ririko" wordmark (WCAG exempts logotypes) but not for any other text on paper: use `pink-deep` there.
- `onBrokenLinks` and `onBrokenAnchors` throw: every new link and `#anchor` must exist.
- `pnpm docs:build` runs `docs:commands` first; `commands.json` is generated, never hand-edited.
- Images from `docs/img/` can be imported into the page from `../../../docs/img/...` (webpack hashes them), so they are not copied twice.
- The maintainer may have a Next.js dev server on port 3000 running from this checkout (the dashboard). Do not stop it.
- The README banner claims 141 commands; `commands.json` lists 117 top-level commands. The site uses `commands.json`. TASK-1952 does not change the banner text.

**Out of scope**
- Discord embed colours of the bot (only the dashboard notifier constant changes here).
- Any change inside `website/src/components/DiscordDemo/`.
- Docs page content.

---

## REVIEW · 2026-10-18T12:47:00Z · claude-opus-5-5 (coordinator) · DONE

- TASK-1951 to TASK-1954 are DONE, each reviewed with `verify_cmd` rerun and the home page checked in the browser pane at desktop and phone widths.
- Story `verify_cmd`: the parts were run per task (installer and banner tests, `pnpm docs:build`, `format:check`, `lint --quiet`); all pass on the final tree.
- Not committed: waiting for the maintainer (protocol section 8.2). Branch `feat/STORY-195-brand`, cut from `feat/STORY-190-readme`.
- Open: Firefox and Safari not checked; the bot's own Discord embed colours still use the old pinks (out of scope).
- Correction: the story `verify_cmd` ran every test under `scripts/`, which pulled in `scripts/deploy-host.test.ts`. That file is untouched by this story and fails 5 tests on this Windows machine (bash timing and path checks; CHORE-2002 covers Windows test runs). The `verify_cmd` now names `scripts/render-readme-banner.test.ts`, the only script test this story changes; installer and banner tests pass (243).

---

## REVIEW · 2026-10-18T14:06:00Z · claude-opus-5-5 (coordinator) · DONE (with TASK-1955)

- TASK-1955 added after the maintainer's phone review: new hero copy and the demo chat column fix. DONE.
- Still not committed; waiting for the maintainer.
