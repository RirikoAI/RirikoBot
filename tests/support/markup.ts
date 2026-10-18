import { createRequire } from 'node:module';

// react-dom is a dependency of apps/web only, so resolve it from there (the same copy of React
// the components import). The element type is left open because tests/ cannot resolve 'react'.
const requireFromWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { renderToStaticMarkup } = requireFromWeb('react-dom/server') as {
  renderToStaticMarkup(element: object): string;
};

/** Server-renders an element to static HTML, for tests that assert on what a form shows. */
export function render(element: object): string {
  return renderToStaticMarkup(element);
}

export function decodeEntities(text: string): string {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** Values of every `<input type="hidden" name="...">` in the markup, decoded. */
export function hiddenValues(markup: string, name: string): string[] {
  const values: string[] = [];
  for (const tag of markup.match(/<input[^>]*>/g) ?? []) {
    if (!/type="hidden"/.test(tag) || !tag.includes(`name="${name}"`)) continue;
    const value = /value="([^"]*)"/.exec(tag)?.[1];
    values.push(decodeEntities(value ?? ''));
  }
  return values;
}

/** The hidden input's value parsed as JSON; fails the test when it is missing. */
export function hiddenJson(markup: string, name: string): unknown {
  const [value] = hiddenValues(markup, name);
  if (value === undefined) throw new Error(`No hidden input named ${name}`);
  return JSON.parse(value);
}

/** Visible text of the markup (tags removed, entities decoded, whitespace collapsed). */
export function textOf(markup: string): string {
  const visible = markup.replace(/<script[\s\S]*?<\/script>/g, '');
  return decodeEntities(visible.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Attributes of one start tag; valueless attributes (`checked`) read as `true`. */
export type Attributes = Record<string, string | true>;

function attributesOf(tag: string): Attributes {
  const attributes: Attributes = {};
  let first = true;
  for (const match of tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    if (first) {
      first = false; // the tag name
      continue;
    }
    const [, name, value] = match;
    attributes[name!] = value === undefined ? true : decodeEntities(value);
  }
  return attributes;
}

/** Attributes of every start tag of `element` in the markup. */
export function elements(markup: string, element: string): Attributes[] {
  return (markup.match(new RegExp(`<${element}(?=[\\s/>])[^>]*>`, 'g')) ?? []).map(attributesOf);
}

/** Attributes of every input, select or textarea called `name`. */
export function fieldsNamed(markup: string, name: string): Attributes[] {
  return ['input', 'select', 'textarea']
    .flatMap((element) => elements(markup, element))
    .filter((attributes) => attributes['name'] === name);
}
