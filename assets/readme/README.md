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
2. **Background art**: vector art, or a background picture.
3. **Scrim**: a dark gradient over the background art, on the text side, so text stays readable on any picture.
4. **Screenshot frame**: the window frame and the placeholder for a screenshot.
5. **Heading**: the accent bar, the small label and the title.
6. **Body text**: the short description.

The hero also has a **Logo** layer and a character-art slot in place of the screenshot. The community section's body text is its description.

## Swap a placeholder

Every replaceable picture is a group whose id starts with `slot-` (open **Edit, XML Editor** to see ids). Each one is labelled with its size.

- **Background art** (`slot-<section>-background`): 1280 pixels wide, as tall as its section (630 for the hero, 372 for a section, 288 for the community). Each slot holds original vector art made of plain shapes and gradients, so you can edit it in Inkscape. To use a picture instead, import it into the **Background art** layer at the exact size and position (X 0, Y at the top of the section), then delete the art group. The picture sits under the scrim, so no other layer moves. Radial gradients must use `gradientUnits="userSpaceOnUse"`: Skia draws bounding-box radial gradients as solid black.
- **Screenshot** (`slot-<section>-screenshot`): 552x300 in the sections, 424x228 in the community. Every section now holds an embedded picture with this id, at X and Y of the slot. To swap one, prepare a PNG of exactly that size with 10-pixel rounded corners already in the picture (the renderer does not apply clip paths), then select the picture in Inkscape and use **Image Properties** to embed the new file. Fill any space around a small screenshot with its own background colour.
- **Hero character art** (`slot-hero-art`): a PNG with transparency, in **Hero: Screenshot frame (character art)**. The group is scaled so the art fills the right of the hero from top to bottom.
- The social card crops x 40 to 1240 of the hero, so keep the hero's key content inside that.

Embed a picture (**Embed** in the import dialog) so the SVG stays one file. Do not move text layers to make room: the layout is a fixed column on purpose.

## Export again

After editing the SVG:

```bash
pnpm readme:banner
```

This runs `scripts/render-readme-banner.ts`. It draws the SVG with `@napi-rs/canvas` (already a dependency of the project), using the Karla files in `fonts/`, and writes `feature-banner.png`, `social-card.png` and `feature-banner.ora` here. The output is deterministic: the same SVG gives the same bytes. Options: `--svg <file>` to render another file and `--out <folder>` to write somewhere else.

The renderer is Skia's SVG engine, so keep the SVG simple: shapes, gradients, strokes and text. Filters, masks and `<foreignObject>` are not drawn. Skia does not draw `<image>` either, so the script draws embedded pictures itself, in their layer, with their transforms and `preserveAspectRatio`, but without clip paths or masks. A linked (not embedded) picture stops the script with an error. To keep the text the same in Inkscape, install the three Karla files from `fonts/`.

Each leaf layer becomes one layer of the `.ora`, cropped to what it draws and placed with x and y in `stack.xml`. A layer that draws nothing is skipped, and the script says so. A layer you hide in Inkscape is exported as hidden.

## Rights

Where each part comes from and under what rights:

| Asset                                 | Source and rights                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout, shapes, colours, the "R" logo | Original work for this project. The "R" mark follows the site favicon (`website/static/img/favicon.svg`).                                                               |
| Karla fonts in `fonts/`               | The Karla Project Authors, SIL Open Font License 1.1 (`fonts/OFL.txt`). From the official repository, `fonts/ttf/` in <https://github.com/googlefonts/karla>.           |
| Text                                  | Written for this project.                                                                                                                                               |
| Background art                        | Original vector art drawn for this project: sakura petals (hero), sound waves and notes (music), cards (Waifu TCG), a node network and chat bubbles (AI chat), coins, shields and a chart (moderation and economy), app windows (web dashboard), circuits and server racks (self-hosting), avatars and hearts (community). |
| Screenshots (seven sections)          | Screenshots of Ririko 2.0 (Discord messages, the dashboard, the setup wizard and the support server invite), taken and supplied by the maintainer. Member names in the moderation screenshot are blurred. The invite screenshot shows Discord's invite page with the server's own banner art. |
| Hero character art                    | Ririko character art, supplied by the maintainer for this banner.                                                                                                       |

