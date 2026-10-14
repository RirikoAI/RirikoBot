import { BOT_INVITE_PERMISSIONS } from '@ririko/discord';
import { maskSecret } from '../utils/env-editor.js';
import type { CheckResult, CheckStatus, GuideStepRef } from './checks.js';
import {
  DASHBOARD_URL_PLACEHOLDER,
  getGuide,
  type Guide,
  type GuideId,
  type GuideStep,
} from './guides.js';
import {
  PAGES,
  activeFields,
  answerValue,
  effectiveSwitches,
  fieldApplies,
  type Answers,
  type CheckId,
  type Condition,
  type Field,
  type Page,
  type PageId,
  type Profile,
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

/**
 * The CSS that shows a conditional field while its switch is on and its select has the value.
 * Without JavaScript the browser can still hide and show fields; the server decides what is
 * required. Generated from the page model so the two cannot drift apart.
 */
export function conditionalCss(): string {
  const rules: string[] = ['[data-cond] { display: none; }'];
  for (const page of PAGES) {
    for (const field of page.fields) {
      if (!field.switch && !field.appliesWhen) continue;
      const base = field.switch ? switchSelector(field.switch) : '';
      const selectors =
        field.appliesWhen && field.appliesWhen.length > 0
          ? field.appliesWhen.map((condition) => `.wizard${base}${valueSelector(condition)}`)
          : [`.wizard${base}`];
      const list = selectors.map((selector) => `${selector} [data-field="${field.name}"]`);
      rules.push(`${list.join(',\n')} { display: block; }`);
    }
  }
  rules.push('@supports not selector(:has(*)) {\n  [data-cond] { display: block; }\n}');
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

function guideStepRefLink(ref: GuideStepRef): string {
  const guide = getGuide(ref.guide);
  return `<a class="guide-link" href="#guide-${ref.guide}-step-${ref.step}">Read step ${ref.step} of the ${escapeHtml(guide.title)} guide</a>`;
}

function renderGuideStep(
  guide: Guide,
  step: GuideStep,
  number: number,
  images: { count: number; boxes: string[] },
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
  return `<section class="guide-step" id="guide-${guide.id}-step-${number}">${parts.join('')}</section>`;
}

function renderGuides(view: StepView, images: { count: number; boxes: string[] }): string {
  const page = view.page;
  if (page.guides.length === 0) return '';
  const dashboardUrl = answerValue(view.answers, 'DASHBOARD_URL');
  const referenced = new Set<GuideId>();
  for (const issue of view.issues.values()) {
    if (issue.guideStep) referenced.add(issue.guideStep.guide);
  }
  return page.guides
    .map((id) => {
      const guide = getGuide(id);
      const summary =
        page.guides.length === 1
          ? 'Click here to show/hide the guide'
          : `Click here to show/hide the guide: ${guide.title}`;
      const steps = guide.steps
        .map((step, index) => renderGuideStep(guide, step, index + 1, images, dashboardUrl))
        .join('');
      return `<details class="guide" id="guide-${id}"${referenced.has(id) ? ' open' : ''}><summary>${escapeHtml(summary)}</summary><div class="guide-body"><h4>${escapeHtml(guide.title)}</h4>${steps}</div></details>`;
    })
    .join('\n');
}

function renderSwitch(view: StepView, page: Page): string {
  return page.switches
    .map((def) => {
      const always = def.alwaysOn?.includes(view.profile) === true;
      const on = effectiveSwitches(view.profile, view.answers.switches)[def.id];
      if (def.profiles && !def.profiles.includes(view.profile)) return '';
      if (always) {
        return `<input class="audible" type="checkbox" name="switch_${def.id}" value="on" checked tabindex="-1" aria-hidden="true">`;
      }
      return `<div class="feature"><label class="switch"><input type="checkbox" name="switch_${def.id}" value="on"${on ? ' checked' : ''}><span class="slider" aria-hidden="true"></span><span class="switch-label">${escapeHtml(def.label)}</span></label><p class="hint">${escapeHtml(def.description)}</p></div>`;
    })
    .join('\n');
}

function fieldId(name: string): string {
  return `f-${name}`;
}

function renderField(view: StepView, field: Field): string {
  const issue = view.issues.get(field.name);
  const stored = view.answers.values[field.name] ?? '';
  const id = fieldId(field.name);
  const hasKeepNote = field.kind === 'secret' && stored.trim() !== '';
  const describedBy = [issue ? `${id}-error` : '', hasKeepNote ? `${id}-keep` : '']
    .filter(Boolean)
    .join(' ');
  const aria = ` aria-invalid="${issue ? 'true' : 'false'}"${describedBy ? ` aria-describedby="${describedBy}"` : ''}`;
  const name = escapeHtml(field.name);
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
  const labelHtml = field.kind === 'checkbox' ? '' : `<label for="${id}">${label}</label>`;
  const keep = hasKeepNote
    ? `<p class="hint" id="${id}-keep">A value is already saved. Leave this empty to keep the current value.</p>`
    : '';
  const error = issue
    ? `<p class="field-error" id="${id}-error" role="alert">${escapeHtml(issue.message)}${issue.guideStep ? ` ${guideStepRefLink(issue.guideStep)}` : ''}</p>`
    : '';
  const cond = field.switch || field.appliesWhen ? ' data-cond' : '';
  return `<div class="field${issue ? ' has-error' : ''}" data-field="${name}"${cond}>${labelHtml}${control}${keep}${error}</div>`;
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

function renderNote(page: Page): string {
  if (page.note.length === 0) return '';
  const items = page.note.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `<div class="note"><strong>Note</strong><ol>${items}</ol></div>`;
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
  return `${errors}<h4>Your settings</h4><table class="summary"><tbody>${rows}</tbody></table>${invite}<h4>Terms</h4>${accept}`;
}

/** The whole HTML page for one step. */
export function renderStepPage(view: StepView): string {
  const page = view.page;
  const images = { count: 0, boxes: [] as string[] };
  const isInstall = page.id === 'install';
  const isWelcome = page.id === 'welcome';
  const first = PAGES[0]?.id === page.id;
  const switches = renderSwitch(view, page);
  const fields = page.fields
    .filter((field) => !field.profiles || field.profiles.includes(view.profile))
    .filter((field) => !isInstall || field.kind !== 'checkbox')
    // The page lists every field of its switches; the stylesheet hides the ones that do not apply.
    .map((field) => renderField(view, field))
    .join('\n');
  const hasIssues = view.issues.size > 0;
  const banner = hasIssues
    ? '<div class="banner error" role="alert">Some answers need your attention. Fix the highlighted fields to continue.</div>'
    : '';
  const intro = page.intro.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const guides = renderGuides(view, images);
  const verify =
    page.checks.length > 0
      ? '<button class="button secondary" type="submit" name="action" value="verify">Test the connection</button>'
      : '';
  const body = isInstall && view.install ? renderInstallBody(view, view.install) : '';
  const actions = isInstall
    ? `<li><button class="button secondary" type="submit" name="action" value="back">Previous</button></li><li><button class="button secondary" type="submit" name="action" value="download" formaction="/download">Download the file</button></li><li><button class="button primary" type="submit" name="action" value="finish" formaction="/finish">Finish</button></li>`
    : `${first ? '' : '<li><button class="button secondary" type="submit" name="action" value="back">Previous</button></li>'}<li><button class="button primary" type="submit" name="action" value="next">Next</button></li>`;
  const defaultAction = isInstall ? 'finish' : 'next';
  const defaultFormaction = isInstall ? ' formaction="/finish"' : '';
  const html = `<main class="wizard">
<header class="brand"><h1>Ririko Setup</h1></header>
${tabs(view)}
<form class="content" method="post" action="/step/${page.id}" novalidate>
<input type="hidden" name="_csrf" value="${escapeHtml(view.csrf)}">
<button class="audible" type="submit" name="action" value="${defaultAction}"${defaultFormaction} tabindex="-1" aria-hidden="true">${defaultAction === 'finish' ? 'Finish' : 'Next'}</button>
<div class="content-wrapper">
<h2 class="section-heading">${escapeHtml(page.heading)}</h2>
${banner}
${intro}
${isWelcome ? renderWelcomeFacts(view) : ''}
${renderNote(page)}
${guides}
${switches}
${fields ? `<div class="fields">${fields}</div>` : ''}
${renderChecks(view)}
${verify}
${body}
</div>
<div class="actions"><ul>${actions}</ul></div>
</form>
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

const COMPOSE = 'docker compose -f docker-compose.production.yml --env-file .env.production';

/**
 * The commands to run after the file is written, from SETUP.md sections 5 to 8 (source) and
 * docs/deployment.md sections 2.5 to 2.8 (docker), in that order. `pnpm db:reset` deletes the
 * data, so an existing settings file (update mode) leaves it out.
 */
export function nextCommands(
  profile: Profile,
  options: { update: boolean; dashboard: boolean },
): NextCommand[] {
  if (profile === 'docker') {
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
    { title: 'Install Lavalink (music)', command: 'pnpm lavalink:install' },
    {
      title: 'Start Lavalink in a new terminal window',
      command: 'pnpm lavalink:start',
      note: 'Wait for "Lavalink is ready to accept connections".',
    },
    { title: 'Start the bot', command: 'pnpm dev:bot' },
  );
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
    ? `<h4>Add the bot to your server</h4><p class="invite"><a href="${escapeHtml(result.inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.inviteUrl)}</a></p>`
    : '';
  const commands = result.commands
    .map(
      (command, index) =>
        `<li><strong>${index + 1}. ${escapeHtml(command.title)}</strong><pre><code>${escapeHtml(command.command)}</code></pre>${command.note ? `<p class="hint">${escapeHtml(command.note)}</p>` : ''}</li>`,
    )
    .join('');
  return layout(
    'Done',
    `<main class="wizard"><header class="brand"><h1>Ririko Setup</h1></header><div class="content"><div class="content-wrapper"><h2 class="section-heading">The settings are written</h2><div class="banner ok" role="status">The file <code>${escapeHtml(result.file)}</code> was ${result.created ? 'created' : 'updated'}.</div>${backup}${generated}${invite}<h4>Next, run these commands</h4><ol class="commands">${commands}</ol><p class="hint">This setup page has stopped. You can close this tab.</p></div></div></main>`,
  );
}

// -- helpers shared with the server -----------------------------------------------------------

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
        value: value === '' ? '(not set)' : field.kind === 'secret' ? maskSecret(value) : value,
      });
    }
  }
  return rows;
}
