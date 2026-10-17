# README banner

The tall feature image for the README and the documentation site. It has eight sections from top to bottom: hero, music, Waifu TCG and adventure, AI chat, moderation and economy, web dashboard, self-hosting, community.

| File                  | What it is                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `feature-banner.svg`  | The master, 1280x3150. Edit this one.                                                                |
| `feature-banner.png`  | The whole banner. The README and the site use it.                                                    |
| `social-card.png`     | 1200x630 link-preview image: the hero, cropped at x 40 to 1240.                                      |
| `feature-banner.ora`  | OpenRaster, one PNG per layer. GIMP, Krita and MyPaint open it with its layers.                      |
| `fonts/`              | Karla (Regular, Bold, ExtraBold) with its licence, `OFL.txt`.                                        |

Never edit the PNG or the `.ora` by hand. They are generated from the SVG.

## Layers

Each section is an Inkscape layer. In Inkscape open **Layers and Objects** to see them. Inside a section the sublayers, from bottom to top, are:

1. **Base colour**: a solid rectangle. It keeps the text readable in GitHub light and dark mode, so nothing sits on a transparent background.
2. **Background art**: the placeholder for a background picture.
3. **Scrim**: a dark gradient over the background art, on the text side, so text stays readable on any picture.
4. **Screenshot frame**: the window frame and the placeholder for a screenshot.
5. **Heading**: the accent bar, the small label and the title.
6. **Body text**: the short description.

The hero also has a **Logo** layer and a character-art slot in place of the screenshot. The community section's body text is its description.

## Swap a placeholder

Every replaceable picture is a group whose id starts with `slot-` (open **Edit, XML Editor** to see ids). Each one is labelled with its size.

- **Background art** (`slot-<section>-background`): 1280 pixels wide, the height written on it (630 for the hero, 372 for a section, 288 for the community). Import the picture into the **Background art** layer, set it to the exact size and position (X 0, Y at the top of the section), then delete the dashed placeholder group. The picture sits under the scrim, so no other layer moves.
- **Screenshot** (`slot-<section>-screenshot`): the size written on it (552x300 in the sections, 424x228 in the community). Import the picture into the **Screenshot frame** layer, place it on the dashed rectangle, then delete the placeholder group. Clip it with a rounded rectangle (**Object, Clip, Set**) if you want rounded corners like the frame.
- **Hero character art** (`slot-hero-art`): 436x502, a PNG with transparency. Import it into **Hero: Screenshot frame (character art)**.
- The social card crops x 40 to 1240 of the hero, so keep the hero's key content inside that.

Embed a picture (**Embed** in the import dialog) so the SVG stays one file. Do not move text layers to make room: the layout is a fixed column on purpose.

## Export again

After editing the SVG:

```bash
pnpm readme:banner
```

This runs `scripts/render-readme-banner.ts`. It draws the SVG with `@napi-rs/canvas` (already a dependency of the project), using the Karla files in `fonts/`, and writes `feature-banner.png`, `social-card.png` and `feature-banner.ora` here. The output is deterministic: the same SVG gives the same bytes. Options: `--svg <file>` to render another file and `--out <folder>` to write somewhere else.

The renderer is Skia's SVG engine, so keep the SVG simple: shapes, gradients, strokes and text. Filters, masks and `<foreignObject>` are not drawn. To keep the text the same in Inkscape, install the three Karla files from `fonts/`.

Each leaf layer becomes one layer of the `.ora`, cropped to what it draws and placed with x and y in `stack.xml`. A layer that draws nothing is skipped, and the script says so. A layer you hide in Inkscape is exported as hidden.

## Rights

All of it is original or open-licensed.

| Asset                                 | Source and rights                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout, shapes, colours, the "R" logo | Original work for this project. The "R" mark follows the site favicon (`website/static/img/favicon.svg`).                                                               |
| Karla fonts in `fonts/`               | The Karla Project Authors, SIL Open Font License 1.1 (`fonts/OFL.txt`). From the official repository, `fonts/ttf/` in <https://github.com/googlefonts/karla>.           |
| Text                                  | Written for this project.                                                                                                                                               |
| Background, screenshot and art slots  | Placeholders only (rectangles and labels). Nothing else is embedded. Whoever fills a slot records the picture's source and rights in this table in the same change.     |

The Ririko character art on the website (`ririko-hero.webp`, `ririko-avatar.webp`) is not used here, because its rights are not recorded.
