import { BOT_INVITE_PERMISSIONS } from '@ririko/discord';
import { maskSecret } from '../utils/env-editor.js';
import type { CheckResult, CheckStatus, GuideStepRef } from './checks.js';
import { DASHBOARD_URL_PLACEHOLDER, getGuide, type GuideId, type GuideStep } from './guides.js';
import {
  PAGES,
  activeFields,
  answerValue,
  effectiveSwitches,
  activePlacement,
  fieldApplies,
  usesRemoteLavalink,
  type Answers,
  type CheckId,
  type Condition,
  type Field,
  type FieldPlacement,
  type GuideButton,
  type NoteBlock,
  type Page,
  type PageId,
  type Profile,
  type SwitchDef,
  type SwitchId,
} from './steps.js';

/**
 * HTML of the setup wizard: pure functions from the step model and the answers to strings. No
 * I/O and no client-side script. Every value that reaches the HTML goes through `escapeHtml`.
 */

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

// -- icons ------------------------------------------------------------------------------------

const ICONS: Readonly<Record<string, string>> = {
  'hand-wave':
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2"/><circle cx="9" cy="10" r=".7"/><circle cx="15" cy="10" r=".7"/>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z"/>',
  'robot-excited':
    '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4.5V8"/><circle cx="12" cy="3.6" r="1"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/><path d="M9.5 16.5h5"/>',
  twitch: '<path d="M4 3h16v11l-4 4h-4l-3 3v-3H4z"/><path d="M12 7v5M16 7v5"/>',
  'database-check':
    '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  'view-dashboard':
    '<rect x="3" y="3" width="8" height="10" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="13" y="11" width="8" height="10" rx="1"/><rect x="3" y="15" width="8" height="6" rx="1"/>',
  'play-circle-outline': '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>',
};

/** An inline SVG for a Material Design Icons name (drawn here as plain shapes, no icon font). */
export function iconSvg(name: string): string {
  const shapes = ICONS[name] ?? ICONS['hand-wave'];
  return `<svg class="icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
}

// -- the conditional-fields stylesheet --------------------------------------------------------

const CHECK_LABELS: Readonly<Record<CheckId, string>> = {
  'discord-bot': 'Discord bot',
  'ai-provider': 'AI chatbot',
  'image-provider': 'Image generation',
  postgres: 'PostgreSQL',
  lavalink: 'Lavalink',
  twitch: 'Twitch',
  youtube: 'YouTube',
  spotify: 'Spotify',
  'dashboard-oauth': 'Dashboard sign-in',
};

function switchSelector(id: SwitchId): string {
  return `:has(input[name="switch_${id}"]:checked)`;
}

function valueSelector(condition: Condition): string {
  const parts: string[] = [];
  if (condition.switch) parts.push(switchSelector(condition.switch));
  if (condition.field !== undefined) {
    parts.push(
      `:has(select[name="${condition.field}"] option[value="${condition.equals ?? ''}"]:checked)`,
    );
  }
  return parts.join('');
}

/** The `data-gate` key of a Note block. */
export function blockGate(page: Page, index: number): string {
  return `${page.id}-note-${index}`;
}

/** The `data-gate` key of one guide button of a Note block. */
export function guideGate(page: Page, index: number, guide: number): string {
  return `${page.id}-note-${index}-guide-${guide}`;
}

/**
 * The CSS that shows a conditional field, a Note block or a guide button while its switch is on
 * and its select has the value. Without JavaScript the browser can still hide and show them; the
 * server decides what is required. Generated from the page model so the two cannot drift apart.
 */
export function conditionalCss(): string {
  const rules: string[] = ['[data-cond],\n[data-gate] { display: none; }'];
  for (const page of PAGES) {
    for (const field of page.fields) {
      for (const placement of field.placements ?? []) {
        const hidden =
          placement.unless && placement.unless.length > 0
            ? `:not(${placement.unless.map((condition) => valueSelector(condition)).join(', ')})`
            : '';
        const list = placement.when.map(
          (condition) =>
            `.wizard${valueSelector(condition)}${hidden} [data-field="${placement.form}"]`,
        );
        rules.push(`${list.join(',\n')} { display: block; }`);
      }
      if (field.placements) continue;
      if (!field.switch && !field.appliesWhen) continue;
      const base = field.switch ? switchSelector(field.switch) : '';
      const selectors =
        field.appliesWhen && field.appliesWhen.length > 0
          ? field.appliesWhen.map((condition) => `.wizard${base}${valueSelector(condition)}`)
          : [`.wizard${base}`];
      const list = selectors.map((selector) => `${selector} [data-field="${field.name}"]`);
      rules.push(`${list.join(',\n')} { display: block; }`);
    }
    page.blocks.forEach((block, index) => {
      const gates: { key: string; when: Condition[] }[] = [];
      if (block.when) gates.push({ key: blockGate(page, index), when: block.when });
      block.guides.forEach((button, guide) => {
        if (button.when) gates.push({ key: guideGate(page, index, guide), when: button.when });
      });
      for (const gate of gates) {
        const list = gate.when.map(
          (condition) => `.wizard${valueSelector(condition)} [data-gate="${gate.key}"]`,
        );
        rules.push(`${list.join(',\n')} { display: block; }`);
      }
    });
  }
  rules.push(
    '@supports not selector(:has(*)) {\n  [data-cond],\n  [data-gate] { display: block; }\n}',
  );
  return `${rules.join('\n')}\n`;
}

// -- markdown for the legal texts -------------------------------------------------------------

const LEGAL_LINKS: Readonly<Record<string, string>> = {
  'privacy.md': '/legal/privacy',
  'terms.md': '/legal/terms',
};

function renderInline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      const escaped = escapeHtml(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return escaped.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label: string, href: string) => {
          const local = LEGAL_LINKS[href];
          if (local) return `<a href="${local}">${label}</a>`;
          if (href.startsWith('https://')) {
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
          }
          return label;
        },
      );
    })
    .join('');
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Renders the small Markdown subset of the legal texts: headings, paragraphs, bullet lists,
 * tables, rules, `code`, **bold** and links. Anything else is shown as plain escaped text; only
 * https links and the two legal texts become links.
 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      html.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('|')) {
        rows.push(lines[index] ?? '');
        index += 1;
      }
      const [head, , ...body] = rows;
      const header = tableCells(head ?? '')
        .map((cell) => `<th>${renderInline(cell)}</th>`)
        .join('');
      const bodyRows = body
        .map(
          (row) =>
            `<tr>${tableCells(row)
              .map((cell) => `<td>${renderInline(cell)}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      html.push(
        `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table></div>`,
      );
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index] ?? '')) {
        items.push(`<li>${renderInline((lines[index] ?? '').replace(/^\s*-\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() !== '' &&
      !/^(#{1,6}\s|-{3,}\s*$|\s*-\s+|\s*\|)/.test(lines[index] ?? '')
    ) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }
  return html.join('\n');
}

// -- layout -----------------------------------------------------------------------------------

/** What the wizard shows in the browser tab and as the page title. */
const SITE_TITLE = 'Ririko Setup';

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="same-origin">
<title>${escapeHtml(title)} · ${SITE_TITLE}</title>
<link rel="stylesheet" href="/assets/wizard.css">
<link rel="stylesheet" href="/assets/conditions.css">
</head>
<body>
${body}
</body>
</html>
`;
}

/** The page shown for a refused or failed request. */
export function renderMessagePage(title: string, message: string): string {
  return layout(
    title,
    `<main class="message"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main>`,
  );
}

/** One of the legal texts, rendered from its Markdown. */
export function renderLegalPage(title: string, markdown: string): string {
  return layout(
    title,
    `<main class="legal"><p class="back"><a href="/step/install">Back to the setup</a></p>\n${renderMarkdown(markdown)}\n<p class="back"><a href="/step/install">Back to the setup</a></p></main>`,
  );
}

// -- the step pages ---------------------------------------------------------------------------

/** A problem shown next to a field. */
export interface FieldIssue {
  message: string;
  /** The guide step that explains how to fix it. */
  guideStep?: GuideStepRef;
}

/** The result of a check, as shown on its page. */
export interface CheckLine {
  id: CheckId;
  status: CheckStatus;
  message: string;
  guideStep?: GuideStepRef;
}

export interface SummaryRow {
  label: string;
  value: string;
}

export interface InstallView {
  summary: SummaryRow[];
  inviteUrl: string | null;
  /** Reasons the file was not written. */
  writeErrors: string[];
}

export interface StepView {
  profile: Profile;
  page: Page;
  answers: Answers;
  csrf: string;
  /** Pages the reader has completed (for the tab states). */
  completed: ReadonlySet<PageId>;
  issues: ReadonlyMap<string, FieldIssue>;
  checkLines: readonly CheckLine[];
  /** The settings file, shown on the first page. */
  targetFile: string;
  fileExists: boolean;
  install?: InstallView | undefined;
}

/** The Discord invite link for an application: the bot and slash commands, the 1.4.0 permissions. */
export function buildInviteUrl(applicationId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS.toString()}`;
}

function tabs(view: StepView): string {
  const currentIndex = PAGES.findIndex((page) => page.id === view.page.id);
  const items = PAGES.map((page, index) => {
    const state =
      index === currentIndex
        ? 'current'
        : view.completed.has(page.id) && index < currentIndex
          ? 'done'
          : '';
    const label = `<span class="step-icon">${iconSvg(page.icon)}</span><span class="step-text"><span class="step-title">${escapeHtml(page.title)}</span><span class="step-subtitle">${escapeHtml(page.subtitle)}</span></span>`;
    const inner =
      state === ''
        ? `<span class="step-link">${label}</span>`
        : `<a class="step-link" href="/step/${page.id}"${state === 'current' ? ' aria-current="step"' : ''}>${label}</a>`;
    return `<li class="${state}">${inner}</li>`;
  });
  return `<nav class="steps" aria-label="Setup steps"><ul>${items.join('')}</ul></nav>`;
}

/** What the page collects while it renders: guide images and how often a guide was placed. */
interface Images {
  count: number;
  boxes: string[];
  guides: Map<GuideId, number>;
}

function guideStepRefLink(ref: GuideStepRef): string {
  const guide = getGuide(ref.guide);
  return `<a class="guide-link" href="#guide-${ref.guide}-step-${ref.step}">Read step ${ref.step} of the ${escapeHtml(guide.title)} guide</a>`;
}

function renderGuideStep(
  domId: string,
  step: GuideStep,
  number: number,
  images: Images,
  dashboardUrl: string,
): string {
  const parts: string[] = [`<h5>${escapeHtml(step.heading)}</h5>`];
  for (const text of step.text) {
    const shown = dashboardUrl ? text.split(DASHBOARD_URL_PLACEHOLDER).join(dashboardUrl) : text;
    parts.push(`<p>${escapeHtml(shown)}</p>`);
  }
  if (step.links && step.links.length > 0) {
    const links = step.links
      .map(
        (link) =>
          `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a></li>`,
      )
      .join('');
    parts.push(`<ul class="guide-links">${links}</ul>`);
  }
  for (const image of step.images ?? []) {
    images.count += 1;
    const id = `img-${images.count}`;
    const src = `/assets/images/${encodeURIComponent(image.file)}`;
    parts.push(
      `<a class="guide-image" href="#${id}"><img src="${src}" alt="${escapeHtml(image.alt)}" loading="lazy"><span>Click to open full size</span></a>`,
    );
    images.boxes.push(
      `<div class="lightbox" id="${id}"><a class="lightbox-close" href="#">Close</a><figure><img src="${src}" alt="${escapeHtml(image.alt)}"><figcaption>${escapeHtml(image.caption)}</figcaption></figure></div>`,
    );
  }
  if (step.callout) {
    const code = step.callout.code ? `<code>${escapeHtml(step.callout.code)}</code>` : '';
    parts.push(
      `<div class="callout ${step.callout.kind}"><p>${escapeHtml(step.callout.text)}</p>${code}</div>`,
    );
  }
  return `<section class="guide-step" id="${domId}-step-${number}">${parts.join('')}</section>`;
}

function renderGuide(
  view: StepView,
  button: GuideButton,
  titled: boolean,
  gate: string | null,
  images: Images,
): string {
  const guide = getGuide(button.guide);
  const dashboardUrl = answerValue(view.answers, 'DASHBOARD_URL');
  const referenced = new Set<GuideId>();
  for (const issue of view.issues.values()) {
    if (issue.guideStep) referenced.add(issue.guideStep.guide);
  }
  // A guide shown for two features (the Gemini key) is on the page twice: the second copy gets
  // its own ids so the page keeps unique ids.
  const seen = images.guides.get(guide.id) ?? 0;
  images.guides.set(guide.id, seen + 1);
  const domId = seen === 0 ? `guide-${guide.id}` : `guide-${guide.id}-${seen + 1}`;
  const summary = titled
    ? `Click here to show/hide the guide: ${guide.title}`
    : 'Click here to show/hide the guide';
  const steps = guide.steps
    .map((step, index) => renderGuideStep(domId, step, index + 1, images, dashboardUrl))
    .join('');
  const html = `<details class="guide" id="${domId}"${referenced.has(guide.id) ? ' open' : ''}><summary>${escapeHtml(summary)}</summary><div class="guide-body">${steps}</div></details>`;
  return gate ? `<div data-gate="${gate}">${html}</div>` : html;
}

/** One Note block: the numbered points, then the guide buttons, each guide opening below its button. */
function renderBlock(view: StepView, block: NoteBlock, index: number, images: Images): string {
  const page = view.page;
  const points = block.points.map((line, i) => `${i + 1}. ${escapeHtml(line)}`).join('<br>');
  const titled = block.guides.length > 1;
  const guides = block.guides
    .map((button, i) =>
      renderGuide(view, button, titled, button.when ? guideGate(page, index, i) : null, images),
    )
    .join('');
  const html = `<div class="note${block.when ? ' switched' : ''}"><p class="note-text"><b>Note:</b><br>${points}</p>${guides}</div>`;
  return block.when ? `<div data-gate="${blockGate(page, index)}">${html}</div>` : html;
}

function renderSwitch(view: StepView, def: SwitchDef): string {
  if (def.profiles && !def.profiles.includes(view.profile)) return '';
  if (def.alwaysOn?.includes(view.profile) === true) {
    return `<input class="audible" type="checkbox" name="switch_${def.id}" value="on" checked tabindex="-1" aria-hidden="true">`;
  }
  const on = effectiveSwitches(view.profile, view.answers.switches)[def.id];
  return `<div class="form-group"><label class="switch"><input type="checkbox" name="switch_${def.id}" value="on"${on ? ' checked' : ''}><span class="slider" aria-hidden="true"></span><span class="label-text">${escapeHtml(def.label)}</span></label></div>`;
}

function fieldId(name: string): string {
  return `f-${name}`;
}

function renderField(view: StepView, field: Field, placement?: FieldPlacement): string {
  // The answer and its error belong to the field; a copy only has its own form name and id.
  const formName = placement ? placement.form : field.name;
  // An error belongs to the copy the reader sees; the other copy of a shared field stays quiet.
  const shown = !placement || activePlacement(field, view.profile, view.answers)?.form === formName;
  const issue = shown ? view.issues.get(field.name) : undefined;
  const stored = view.answers.values[field.name] ?? '';
  const id = fieldId(formName);
  const hasKeepNote = field.kind === 'secret' && stored.trim() !== '';
  const describedBy = [issue ? `${id}-error` : '', hasKeepNote ? `${id}-keep` : '']
    .filter(Boolean)
    .join(' ');
  const aria = ` aria-invalid="${issue ? 'true' : 'false'}"${describedBy ? ` aria-describedby="${describedBy}"` : ''}`;
  const name = escapeHtml(formName);
  const label = escapeHtml(field.label);
  let control: string;
  switch (field.kind) {
    case 'select': {
      const options = (field.options ?? [])
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${option.value === stored ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
        )
        .join('');
      control = `<select id="${id}" name="${name}"${aria}>${options}</select>`;
      break;
    }
    case 'checkbox':
      control = `<label class="check-row"><input id="${id}" type="checkbox" name="${name}" value="true"${stored === 'true' ? ' checked' : ''}${aria}><span>${label}</span></label>`;
      break;
    case 'secret':
      // A saved secret is never put into the page.
      control = `<input id="${id}" type="password" name="${name}" value="" placeholder="${escapeHtml(hasKeepNote ? 'Keep the current value' : field.placeholder)}" autocomplete="new-password" spellcheck="false"${aria}>`;
      break;
    default:
      control = `<input id="${id}" type="text" name="${name}" value="${escapeHtml(stored)}" placeholder="${escapeHtml(field.placeholder)}" autocomplete="off" spellcheck="false"${field.kind === 'url' ? ' inputmode="url"' : ''}${aria}>`;
  }
  const labelHtml =
    field.kind === 'checkbox' ? '' : `<label class="text-sm" for="${id}">${label}:</label>`;
  const keep = hasKeepNote
    ? `<p class="hint" id="${id}-keep">A value is already saved. Leave this empty to keep the current value.</p>`
    : '';
  const error = issue
    ? `<p class="field-error" id="${id}-error" role="alert">${escapeHtml(issue.message)}${issue.guideStep ? ` ${guideStepRefLink(issue.guideStep)}` : ''}</p>`
    : '';
  const cond = field.switch || field.appliesWhen || placement ? ' data-cond' : '';
  return `<div class="form-group field${issue ? ' has-error' : ''}" data-field="${name}"${cond}>${labelHtml}${control}${keep}${error}</div>`;
}

function renderChecks(view: StepView): string {
  if (view.checkLines.length === 0) return '';
  const lines = view.checkLines
    .map(
      (line) =>
        `<li class="check ${line.status}"><strong>${escapeHtml(CHECK_LABELS[line.id])}</strong> ${escapeHtml(line.message)}${line.status === 'fail' && line.guideStep ? ` ${guideStepRefLink(line.guideStep)}` : ''}</li>`,
    )
    .join('');
  return `<ul class="checks" aria-label="Check results">${lines}</ul>`;
}

function renderWelcomeFacts(view: StepView): string {
  const profile = view.profile === 'docker' ? 'Docker' : 'From source';
  const mode = view.fileExists
    ? 'The file exists. Your answers start from its values, and the setup keeps a backup copy before it changes the file.'
    : 'The file does not exist yet. The setup creates it from the example file.';
  return `<dl class="facts"><dt>Install type</dt><dd>${escapeHtml(profile)}</dd><dt>Settings file</dt><dd><code>${escapeHtml(view.targetFile)}</code></dd><dt>State</dt><dd>${escapeHtml(mode)}</dd></dl>`;
}

function renderInstallBody(view: StepView, install: InstallView): string {
  const rows = install.summary
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`,
    )
    .join('');
  const errors =
    install.writeErrors.length > 0
      ? `<div class="banner error" role="alert"><strong>Nothing was written.</strong><ul>${install.writeErrors.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>`
      : '';
  const invite = install.inviteUrl
    ? `<p>After the settings are written, add the bot to your Discord server with this link:</p><p class="invite"><a href="${escapeHtml(install.inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(install.inviteUrl)}</a></p>`
    : '';
  const accept = activeFields(view.page, view.profile, view.answers)
    .filter((field) => field.kind === 'checkbox')
    .map((field) => {
      const link =
        field.name === 'accept_tos'
          ? '<a href="/legal/terms" target="_blank" rel="noopener">Read the Terms of Service</a>'
          : '<a href="/legal/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a>';
      return `${renderField(view, field)}<p class="legal-link">${link}</p>`;
    })
    .join('');
  const remote =
    view.profile === 'docker' && usesRemoteLavalink('docker', view.answers)
      ? `<p>You use a Lavalink server of your own, so start the stack with both compose files: <code>${escapeHtml(`${composeCommand(true)} up -d`)}</code></p>`
      : '';
  return `${errors}<h4 class="section-heading mb-5">Your settings</h4><table class="summary"><tbody>${rows}</tbody></table>${remote}${invite}<h4 class="section-heading mb-5">Terms</h4>${accept}`;
}

/**
 * The switches, fields and Note blocks of a page in the order of the 1.x installer: a switch, the
 * fields of its feature, then the note of that group with its guide buttons.
 */
function renderGroups(view: StepView, images: Images): string {
  const page = view.page;
  const isInstall = page.id === 'install';
  const shown = page.fields
    .filter((field) => !field.profiles || field.profiles.includes(view.profile))
    .filter((field) => !isInstall || field.kind !== 'checkbox');
  // A field with placements is drawn once per placement, each right after the field it follows.
  const visible: { field: Field; placement?: FieldPlacement }[] = shown
    .filter((field) => !field.placements)
    .map((field) => ({ field }));
  for (const field of shown) {
    for (const placement of field.placements ?? []) {
      const anchor = visible.findIndex(
        (item) => !item.placement && item.field.name === placement.after,
      );
      const slot = anchor >= 0 ? anchor + 1 : visible.length;
      let end = slot;
      while (visible[end]?.placement) end += 1;
      visible.splice(end, 0, { field, placement });
    }
  }
  const names = visible.map((item) => (item.placement ? item.placement.form : item.field.name));
  const parts: string[][] = [[], ...visible.map(() => [] as string[])];

  // A block comes after its anchor field, or after the nearest shown field before it.
  page.blocks.forEach((block, index) => {
    if (block.profiles && !block.profiles.includes(view.profile)) return;
    let slot = visible.length;
    if (block.after !== undefined) {
      slot = 0;
      for (let i = page.fields.findIndex((field) => field.name === block.after); i >= 0; i--) {
        const found = names.indexOf(page.fields[i]?.name ?? '');
        if (found >= 0) {
          slot = found + 1;
          break;
        }
      }
    }
    parts[slot]?.push(renderBlock(view, block, index, images));
  });

  // A switch comes just before the first field of its feature, after the note of the group before.
  for (const def of page.switches) {
    const first = visible.findIndex((item) => item.field.switch === def.id);
    parts[Math.max(first, 0)]?.push(renderSwitch(view, def));
  }
  const out: string[] = [...(parts[0] ?? [])];
  visible.forEach((item, i) => {
    out.push(renderField(view, item.field, item.placement), ...(parts[i + 1] ?? []));
  });
  return out.filter(Boolean).join('\n');
}

/** The whole HTML page for one step. */
export function renderStepPage(view: StepView): string {
  const page = view.page;
  const images: Images = { count: 0, boxes: [], guides: new Map() };
  const isInstall = page.id === 'install';
  const isWelcome = page.id === 'welcome';
  const first = PAGES[0]?.id === page.id;
  const body = renderGroups(view, images);
  const hasIssues = view.issues.size > 0;
  const banner = hasIssues
    ? '<div class="banner error" role="alert">Some answers need your attention. Fix the highlighted fields to continue.</div>'
    : '';
  const intro = page.intro.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const verify =
    page.checks.length > 0
      ? '<button class="button secondary" type="submit" name="action" value="verify">Test the connection</button>'
      : '';
  const install = isInstall && view.install ? renderInstallBody(view, view.install) : '';
  const actions = isInstall
    ? `<li><button class="button secondary" type="submit" name="action" value="back">Previous</button></li><li><button class="button secondary" type="submit" name="action" value="download" formaction="/download">Download the file</button></li><li><button class="button primary" type="submit" name="action" value="finish" formaction="/finish">Finish</button></li>`
    : `${first ? '' : '<li><button class="button secondary" type="submit" name="action" value="back">Previous</button></li>'}<li><button class="button primary" type="submit" name="action" value="next">Next</button></li>`;
  const defaultAction = isInstall ? 'finish' : 'next';
  const defaultFormaction = isInstall ? ' formaction="/finish"' : '';
  const html = `<main class="wizard">
<header class="brand"><h1>Ririko Setup</h1><p>Follow the instructions to set up Ririko Ai for your Discord server.</p></header>
<div class="layout">
${tabs(view)}
<form class="content" method="post" action="/step/${page.id}" novalidate>
<input type="hidden" name="_csrf" value="${escapeHtml(view.csrf)}">
<button class="audible" type="submit" name="action" value="${defaultAction}"${defaultFormaction} tabindex="-1" aria-hidden="true">${defaultAction === 'finish' ? 'Finish' : 'Next'}</button>
<div class="content-wrapper">
<h2 class="section-heading">${escapeHtml(page.heading)}</h2>
${banner}
${intro}
${isWelcome ? renderWelcomeFacts(view) : ''}
${body}
${renderChecks(view)}
${verify}
${install}
</div>
<div class="actions"><ul>${actions}</ul></div>
</form>
</div>
${images.boxes.join('\n')}
</main>`;
  return layout(page.title, html);
}

// -- the result page --------------------------------------------------------------------------

export interface NextCommand {
  title: string;
  command: string;
  note?: string;
}

const COMPOSE_BASE = 'docker compose -f docker-compose.production.yml';
const COMPOSE_ENV = '--env-file .env.production';

/** The compose command; a remote Lavalink node adds the override file that leaves the bundled one out. */
function composeCommand(remoteLavalink: boolean): string {
  return remoteLavalink
    ? `${COMPOSE_BASE} -f docker-compose.remote-lavalink.yml ${COMPOSE_ENV}`
    : `${COMPOSE_BASE} ${COMPOSE_ENV}`;
}

/**
 * The commands to run after the file is written, from SETUP.md sections 5 to 8 (source) and
 * docs/deployment.md sections 2.5 to 2.8 (docker), in that order. `pnpm db:reset` deletes the
 * data, so an existing settings file (update mode) leaves it out.
 */
export function nextCommands(
  profile: Profile,
  options: { update: boolean; dashboard: boolean; remoteLavalink?: boolean },
): NextCommand[] {
  const remoteLavalink = options.remoteLavalink === true;
  if (profile === 'docker') {
    const COMPOSE = composeCommand(remoteLavalink);
    return [
      { title: 'Start the stack', command: `${COMPOSE} up -d` },
      {
        title: 'Check the containers',
        command: `${COMPOSE} ps`,
        note: 'After about two minutes, postgres, bot and web show healthy.',
      },
      {
        title: 'Read the bot log',
        command: `${COMPOSE} logs bot`,
        note: 'You see "Logged in as" followed by your bot name.',
      },
      {
        title: 'Register the slash commands (once)',
        command: `${COMPOSE} exec bot ririko commands:sync --global --all-guilds`,
      },
    ];
  }
  const commands: NextCommand[] = [];
  if (!options.update) {
    commands.push({
      title: 'Build the database (new database only)',
      command: 'pnpm db:reset',
      note: 'This deletes all local data, including the progress of players.',
    });
  }
  commands.push(
    {
      title: 'Render the TCG cards',
      command: 'pnpm tcg:card-builder --rerender',
      note: 'The first run takes a long time.',
    },
    { title: 'Render the TCG bosses', command: 'pnpm tcg:boss-builder --all' },
  );
  if (!remoteLavalink) {
    commands.push(
      { title: 'Install Lavalink (music)', command: 'pnpm lavalink:install' },
      {
        title: 'Start Lavalink in a new terminal window',
        command: 'pnpm lavalink:start',
        note: 'Wait for "Lavalink is ready to accept connections".',
      },
    );
  }
  commands.push({ title: 'Start the bot', command: 'pnpm dev:bot' });
  if (options.dashboard) {
    commands.push({ title: 'Start the web dashboard', command: 'pnpm dev:web' });
  }
  return commands;
}

export interface ResultView {
  profile: Profile;
  file: string;
  backup: string | null;
  created: boolean;
  generatedKeys: readonly string[];
  inviteUrl: string | null;
  commands: readonly NextCommand[];
}

/** The page after Finish wrote the file. */
export function renderResultPage(result: ResultView): string {
  const backup = result.backup
    ? `<p>The previous file was copied to <code>${escapeHtml(result.backup)}</code>.</p>`
    : '';
  const generated =
    result.generatedKeys.length > 0
      ? `<p>These secrets were generated for you and written to the file: ${result.generatedKeys.map((key) => `<code>${escapeHtml(key)}</code>`).join(', ')}.</p>`
      : '';
  const invite = result.inviteUrl
    ? `<h4 class="section-heading">Add the bot to your server</h4><p class="invite"><a href="${escapeHtml(result.inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.inviteUrl)}</a></p>`
    : '';
  const commands = result.commands
    .map(
      (command, index) =>
        `<li><strong>${index + 1}. ${escapeHtml(command.title)}</strong><pre><code>${escapeHtml(command.command)}</code></pre>${command.note ? `<p class="hint">${escapeHtml(command.note)}</p>` : ''}</li>`,
    )
    .join('');
  return layout(
    'Done',
    `<main class="wizard"><header class="brand"><h1>Ririko Setup</h1></header><div class="content"><div class="content-wrapper"><h2 class="section-heading">The settings are written</h2><div class="banner ok" role="status">The file <code>${escapeHtml(result.file)}</code> was ${result.created ? 'created' : 'updated'}.</div>${backup}${generated}${invite}<h4 class="section-heading">Next, run these commands</h4><ol class="commands">${commands}</ol><p class="hint">This setup page has stopped. You can close this tab.</p></div></div></main>`,
  );
}

// -- helpers shared with the server -----------------------------------------------------------

/** What the summary shows for an answer: secrets masked, choices by their label. */
function summaryValue(field: Field, value: string): string {
  if (field.kind === 'secret') return maskSecret(value);
  if (field.kind === 'select') {
    return field.options?.find((option) => option.value === value)?.label ?? value;
  }
  return value;
}

/** The rows of the Install page's summary: the answers of every page, secrets masked. */
export function summaryRows(profile: Profile, answers: Answers): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const on = effectiveSwitches(profile, answers.switches);
  for (const page of PAGES) {
    for (const def of page.switches) {
      if (def.profiles && !def.profiles.includes(profile)) continue;
      rows.push({ label: def.label, value: on[def.id] ? 'On' : 'Off' });
    }
    for (const field of page.fields) {
      if (field.kind === 'checkbox' || !fieldApplies(field, profile, answers)) continue;
      const value = answerValue(answers, field.name);
      rows.push({
        label: field.label,
        value: value === '' ? '(not set)' : summaryValue(field, value),
      });
    }
  }
  return rows;
}
