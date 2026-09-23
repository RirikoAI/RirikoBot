export interface MemeTextBox {
  /** Center X position for the text box. */
  x: number;
  /** Top Y position for the text box baseline / anchor. */
  y: number;
  /** Maximum width in pixels. Text wider than this wraps or shrinks. */
  width: number;
  /** Maximum number of lines permitted (default: 4). */
  maxLines?: number | undefined;
  /** Preferred base font size in pixels (default: 36). */
  fontSize?: number | undefined;
  /** Horizontal alignment (default: 'center'). */
  align?: 'left' | 'center' | 'right' | undefined;
}

export interface MemeTemplateConfig {
  /** Unique primary identifier (e.g. '0days', 'american-chopper'). */
  id: string;
  /** Primary canonical name. */
  name: string;
  /** Human-readable display title. */
  title: string;
  /** Description for autocomplete and help menus. */
  description: string;
  /** Filename within the assets/memes directory. */
  fileName: string;
  /** Alternative names or legacy aliases (e.g. 'alwaysbeen'). */
  aliases: string[];
  /** Configured text placement boxes. */
  textBoxes: MemeTextBox[];
}

export const MEME_TEMPLATES: Record<string, MemeTemplateConfig> = {
  '0days': {
    id: '0days',
    name: '0days',
    title: '0 Days Without Accidents',
    description: 'The Simpsons Lenny "0 Days Without Accidents" sign',
    fileName: '0_days_without__lenny__simpsons_.jpg',
    aliases: ['zerodays'],
    textBoxes: [
      { x: 430, y: 140, width: 300 },
      { x: 270, y: 340, width: 500 },
    ],
  },
  'allmyhomies': {
    id: 'allmyhomies',
    name: 'allmyhomies',
    title: 'All My Homies Hate X',
    description: '"Fuck X, all my homies use/hate Y" banner meme',
    fileName: 'all_my_homies_hate.jpg',
    aliases: ['all-my-homies', 'homies'],
    textBoxes: [
      { x: 340, y: 50, width: 550 },
      { x: 340, y: 550, width: 550 },
    ],
  },
  'always-been': {
    id: 'always-been',
    name: 'always-been',
    title: 'Always Has Been',
    description: '"Wait, it\'s all X? Always has been" two astronauts in space',
    fileName: 'always_has_been.jpg',
    aliases: ['alwaysbeen'],
    textBoxes: [
      { x: 480, y: 50, width: 550 },
      { x: 540, y: 490, width: 550 },
    ],
  },
  'american-chopper': {
    id: 'american-chopper',
    name: 'american-chopper',
    title: 'American Chopper Argument',
    description: '5-panel escalating father/son argument from American Chopper',
    fileName: 'american_chopper_argument.jpg',
    aliases: ['americanchopper', 'chopper'],
    textBoxes: [
      { x: 320, y: 300, width: 550 },
      { x: 320, y: 690, width: 550 },
      { x: 320, y: 990, width: 550 },
      { x: 320, y: 1380, width: 550 },
      { x: 320, y: 1750, width: 550 },
    ],
  },
  'chad': {
    id: 'chad',
    name: 'chad',
    title: 'GigaChad vs Virgin',
    description: 'Average Fan vs Average Enjoyer / GigaChad comparison',
    fileName: 'chad-meme.jpg',
    aliases: ['gigachad'],
    textBoxes: [
      { x: 350, y: 850, width: 500 },
      { x: 1150, y: 850, width: 500 },
    ],
  },
  'everywhere': {
    id: 'everywhere',
    name: 'everywhere',
    title: 'X, X Everywhere',
    description: 'Buzz Lightyear showing Woody "X, X Everywhere"',
    fileName: 'x__x_everywhere.jpg',
    aliases: ['buzz'],
    textBoxes: [
      { x: 400, y: 50, width: 500 },
      { x: 400, y: 500, width: 500 },
    ],
  },
  'getting-paid': {
    id: 'getting-paid',
    name: 'getting-paid',
    title: 'You Guys Are Getting Paid?',
    description: 'We\'re the Millers "You guys are getting paid?" four-panel',
    fileName: 'you_guys_are_getting_paid.jpg',
    aliases: ['gettingpaid'],
    textBoxes: [
      { x: 270, y: 50, width: 500 },
      { x: 270, y: 330, width: 500 },
    ],
  },
  'got-any-more': {
    id: 'got-any-more',
    name: 'got-any-more',
    title: "Y'all Got Any More",
    description: 'Dave Chappelle scratching neck "Y\'all got any more of that X"',
    fileName: 'y_all_got_any_more_of_that.jpg',
    aliases: ['gotanymore', 'chappelle'],
    textBoxes: [
      { x: 300, y: 50, width: 500 },
      { x: 300, y: 450, width: 500 },
    ],
  },
  'train-bus': {
    id: 'train-bus',
    name: 'train-bus',
    title: 'Train Hitting School Bus',
    description: 'Locomotive smashing into a yellow school bus at a crossing',
    fileName: 'a_train_hitting_a_school_bus.jpg',
    aliases: ['trainbus'],
    textBoxes: [
      { x: 200, y: 340, width: 300 },
      { x: 750, y: 140, width: 300 },
    ],
  },
  'undertaker': {
    id: 'undertaker',
    name: 'undertaker',
    title: 'AJ Styles & Undertaker',
    description: 'AJ Styles smiling unaware that The Undertaker is behind him',
    fileName: 'aj_styles___undertaker.jpg',
    aliases: ['ajstyles'],
    textBoxes: [
      { x: 200, y: 340, width: 300 },
      { x: 750, y: 140, width: 300 },
    ],
  },
  'woman-yelling-at-cat': {
    id: 'woman-yelling-at-cat',
    name: 'woman-yelling-at-cat',
    title: 'Woman Yelling at Cat',
    description: 'Taylor Armstrong yelling and pointing at Smudge the cat',
    fileName: 'woman_yelling_at_cat.jpg',
    aliases: ['womancat', 'woman-cat'],
    textBoxes: [
      { x: 300, y: 70, width: 400 },
      { x: 850, y: 70, width: 400 },
    ],
  },
};

export const MEME_TEMPLATE_LIST: MemeTemplateConfig[] = Object.values(MEME_TEMPLATES);

export const MEME_TEMPLATE_NAMES: string[] = MEME_TEMPLATE_LIST.map((t) => t.name);

/** Lookup map index covering both canonical IDs and all registered aliases. */
const ALIAS_INDEX: Map<string, MemeTemplateConfig> = (() => {
  const index = new Map<string, MemeTemplateConfig>();
  for (const template of MEME_TEMPLATE_LIST) {
    index.set(template.id.toLowerCase(), template);
    index.set(template.name.toLowerCase(), template);
    for (const alias of template.aliases) {
      index.set(alias.toLowerCase(), template);
    }
  }
  return index;
})();

/**
 * Resolves a meme template by name, ID, or alias.
 */
export function getMemeTemplate(nameOrAlias: string): MemeTemplateConfig | undefined {
  if (!nameOrAlias) return undefined;
  return ALIAS_INDEX.get(nameOrAlias.trim().toLowerCase());
}

/**
 * Searches meme templates by query for slash command autocomplete.
 */
export function searchMemeTemplates(query: string, limit = 25): MemeTemplateConfig[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return MEME_TEMPLATE_LIST.slice(0, limit);
  }

  const results: { template: MemeTemplateConfig; score: number }[] = [];

  for (const template of MEME_TEMPLATE_LIST) {
    const id = template.id.toLowerCase();
    const name = template.name.toLowerCase();
    const title = template.title.toLowerCase();
    const desc = template.description.toLowerCase();

    let score = 0;
    if (id === q || name === q) score += 100;
    else if (id.startsWith(q) || name.startsWith(q)) score += 50;
    else if (id.includes(q) || name.includes(q)) score += 30;

    if (title.includes(q)) score += 20;
    if (desc.includes(q)) score += 10;
    for (const alias of template.aliases) {
      if (alias.toLowerCase() === q) score += 40;
      else if (alias.toLowerCase().includes(q)) score += 15;
    }

    if (score > 0) {
      results.push({ template, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.template);
}
