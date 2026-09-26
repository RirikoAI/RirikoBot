import { z } from 'zod';

/*
 * Reaction role panels: one bot message with role buttons or one role select menu. The
 * dashboard builds and publishes them; the bot answers clicks from the stored bindings. The
 * layout (labels, emojis, styles) lives in the Discord message, the role of each component in
 * `reaction_roles`.
 */

export const REACTION_ROLE_MODES = ['TOGGLE', 'GIVE_ONLY', 'REMOVE_ONLY', 'UNIQUE'] as const;
export type ReactionRoleModeName = (typeof REACTION_ROLE_MODES)[number];

export const PANEL_BUTTON_STYLES = ['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER'] as const;
export type PanelButtonStyle = (typeof PANEL_BUTTON_STYLES)[number];

export const PANEL_KINDS = ['BUTTONS', 'SELECT'] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

/** Discord allows 25 components or options per message: 5 rows of 5 buttons, or 25 options. */
export const MAX_PANEL_ITEMS = 25;
const BUTTONS_PER_ROW = 5;
const BUTTON_STYLE_CODES: Record<PanelButtonStyle, number> = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
};
export const DEFAULT_PANEL_COLOR = 0xe91e63;

const BUTTON_PREFIX = 'rr:btn:';
const SELECT_PREFIX = 'rr:select:group:';

export function panelButtonCustomId(bindingId: string): string {
  return `${BUTTON_PREFIX}${bindingId}`;
}

export function panelSelectCustomId(groupId: string): string {
  return `${SELECT_PREFIX}${groupId}`;
}

/** True for components the reaction role handlers own (`rr:` custom IDs). */
export function isReactionRoleComponent(customId: string | undefined): boolean {
  return customId?.startsWith('rr:') ?? false;
}

export interface PanelEmoji {
  /** Server emoji ID; null for a Unicode emoji. */
  id: string | null;
  /** Emoji name, or the Unicode emoji itself. */
  name: string;
  animated: boolean;
}

const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{17,20})>$/;
const UNICODE_EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|⃣)*$/u;

/** One emoji as typed (`🎮` or `<:name:id>`); null for none, undefined when it is not an emoji. */
export function parsePanelEmoji(text: string): PanelEmoji | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const custom = CUSTOM_EMOJI.exec(trimmed);
  if (custom) return { id: custom[3]!, name: custom[2]!, animated: custom[1] === 'a' };
  return trimmed.length <= 32 && UNICODE_EMOJI.test(trimmed)
    ? { id: null, name: trimmed, animated: false }
    : undefined;
}

/** An emoji as the builder shows it: the Unicode emoji, or `<:name:id>`. */
export function formatPanelEmoji(emoji: PanelEmoji | null | undefined): string {
  if (!emoji) return '';
  return emoji.id ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : emoji.name;
}

const SNOWFLAKE = /^\d{17,20}$/;

const EmojiSchema = z
  .string({ invalid_type_error: 'Use one emoji.' })
  .nullable()
  .default(null)
  .transform((text, ctx): PanelEmoji | null => {
    if (text === null) return null;
    const emoji = parsePanelEmoji(text);
    if (emoji === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use one emoji, such as 🎮, or a server emoji written as <:name:id>.',
      });
      return z.NEVER;
    }
    return emoji;
  });

const PanelItemSchema = z
  .object({
    roleId: z
      .string({ required_error: 'Choose a role.', invalid_type_error: 'Choose a role.' })
      .regex(SNOWFLAKE, 'Choose a role.'),
    label: z.string().trim().max(100, 'Labels can be at most 100 characters.').default(''),
    description: z
      .string()
      .trim()
      .max(100, 'Descriptions can be at most 100 characters.')
      .default(''),
    emoji: EmojiSchema,
    style: z
      .enum(PANEL_BUTTON_STYLES, { errorMap: () => ({ message: 'Choose a button colour.' }) })
      .default('PRIMARY'),
  })
  .strict();

const PanelEmbedSchema = z
  .object({
    title: z.string().trim().max(256, 'Embed titles can be at most 256 characters.').default(''),
    description: z
      .string()
      .trim()
      .max(4096, 'Embed descriptions can be at most 4096 characters.')
      .default(''),
    color: z
      .number({ invalid_type_error: 'Choose an embed colour.' })
      .int()
      .min(0)
      .max(0xffffff)
      .default(DEFAULT_PANEL_COLOR),
  })
  .strict();

/**
 * A panel as the dashboard submits it. `messageId` null posts a new message; otherwise that
 * message (which must be Ririko's) is edited and its buttons or menu replaced.
 */
export const ReactionRolePanelSchema = z
  .object({
    channelId: z
      .string({ required_error: 'Choose a channel.', invalid_type_error: 'Choose a channel.' })
      .regex(SNOWFLAKE, 'Choose a channel.'),
    messageId: z
      .string()
      .regex(SNOWFLAKE, 'Message must be a Discord ID.')
      .nullable()
      .default(null),
    content: z
      .string()
      .trim()
      .max(2000, 'Message text can be at most 2000 characters.')
      .default(''),
    embed: PanelEmbedSchema.nullable().default(null),
    kind: z.enum(PANEL_KINDS, { errorMap: () => ({ message: 'Choose buttons or a menu.' }) }),
    mode: z
      .enum(REACTION_ROLE_MODES, { errorMap: () => ({ message: 'Choose what a click does.' }) })
      .default('TOGGLE'),
    placeholder: z
      .string()
      .trim()
      .max(150, 'The menu placeholder can be at most 150 characters.')
      .default(''),
    maxValues: z
      .number({ invalid_type_error: 'Enter how many roles a member may pick.' })
      .int('Enter how many roles a member may pick.')
      .min(1, 'Members must be able to pick at least 1 role.')
      .max(MAX_PANEL_ITEMS)
      .default(1),
    items: z
      .array(PanelItemSchema, { invalid_type_error: 'Add at least one role.' })
      .min(1, 'Add at least one role.')
      .max(MAX_PANEL_ITEMS, `A panel can have at most ${MAX_PANEL_ITEMS} roles.`),
  })
  .strict()
  .superRefine((panel, ctx) => {
    const embedEmpty = !panel.embed || (!panel.embed.title && !panel.embed.description);
    if (panel.embed && embedEmpty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['embed'],
        message: 'An embed needs a title or a description.',
      });
    } else if (!panel.content && embedEmpty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Add message text or an embed.',
      });
    }
    const seen = new Set<string>();
    panel.items.forEach((item, index) => {
      if (seen.has(item.roleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'roleId'],
          message: 'This role is already in the panel.',
        });
      }
      seen.add(item.roleId);
      if (panel.kind === 'BUTTONS' && !item.label && !item.emoji) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'label'],
          message: 'A button needs a label or an emoji.',
        });
      }
      if (panel.kind === 'BUTTONS' && item.label.length > 80) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'label'],
          message: 'Button labels can be at most 80 characters.',
        });
      }
      if (panel.kind === 'SELECT' && !item.label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'label'],
          message: 'Menu options need a label.',
        });
      }
    });
    if (panel.kind === 'SELECT' && panel.maxValues > panel.items.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxValues'],
        message: 'Members cannot pick more roles than the menu offers.',
      });
    }
  });

export type ReactionRolePanel = z.output<typeof ReactionRolePanelSchema>;
export type ReactionRolePanelInput = z.input<typeof ReactionRolePanelSchema>;

/** Panel errors as lines, with list errors named by role number (`Role 2: Choose a role.`). */
export function describePanelIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
): string[] {
  return issues.map(({ path, message }) =>
    path[0] === 'items' && typeof path[1] === 'number'
      ? `Role ${path[1] + 1}: ${message}`
      : message,
  );
}

/*
 * Message JSON as the Discord API sends and accepts it (only the fields panels use).
 */
export interface ApiEmoji {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
}

export interface ApiSelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: ApiEmoji;
}

export interface ApiComponent {
  type: number;
  custom_id?: string;
  style?: number;
  label?: string;
  emoji?: ApiEmoji;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  options?: ApiSelectOption[];
  components?: ApiComponent[];
}

export interface ApiEmbed {
  title?: string;
  description?: string;
  color?: number;
}

export interface PanelMessageBody {
  content: string;
  embeds: ApiEmbed[];
  components: ApiComponent[];
  allowed_mentions: { parse: [] };
}

const ACTION_ROW = 1;
const BUTTON = 2;
const STRING_SELECT = 3;

function apiEmoji(emoji: PanelEmoji | null): ApiEmoji | undefined {
  if (!emoji) return undefined;
  return emoji.id
    ? { id: emoji.id, name: emoji.name, animated: emoji.animated }
    : { name: emoji.name };
}

/**
 * The message body for a panel. `bindingIds[i]` is the stored binding of `items[i]`; buttons
 * carry their binding in the custom ID, the menu carries the panel's group. Mentions in the
 * text never ping.
 */
export function buildPanelMessage(
  panel: ReactionRolePanel,
  bindingIds: readonly string[],
  groupId: string,
): PanelMessageBody {
  let components: ApiComponent[];
  if (panel.kind === 'BUTTONS') {
    const buttons: ApiComponent[] = panel.items.map((item, index) => ({
      type: BUTTON,
      style: BUTTON_STYLE_CODES[item.style],
      custom_id: panelButtonCustomId(bindingIds[index]!),
      ...(item.label ? { label: item.label } : {}),
      ...(item.emoji ? { emoji: apiEmoji(item.emoji)! } : {}),
    }));
    components = [];
    for (let start = 0; start < buttons.length; start += BUTTONS_PER_ROW) {
      components.push({
        type: ACTION_ROW,
        components: buttons.slice(start, start + BUTTONS_PER_ROW),
      });
    }
  } else {
    components = [
      {
        type: ACTION_ROW,
        components: [
          {
            type: STRING_SELECT,
            custom_id: panelSelectCustomId(groupId),
            ...(panel.placeholder ? { placeholder: panel.placeholder } : {}),
            min_values: 0,
            max_values: panel.maxValues,
            options: panel.items.map((item) => ({
              label: item.label,
              value: item.roleId,
              ...(item.description ? { description: item.description } : {}),
              ...(item.emoji ? { emoji: apiEmoji(item.emoji)! } : {}),
            })),
          },
        ],
      },
    ];
  }
  const embeds: ApiEmbed[] = panel.embed
    ? [
        {
          ...(panel.embed.title ? { title: panel.embed.title } : {}),
          ...(panel.embed.description ? { description: panel.embed.description } : {}),
          color: panel.embed.color,
        },
      ]
    : [];
  return { content: panel.content, embeds, components, allowed_mentions: { parse: [] } };
}

/** Whether any component of the message belongs to another feature (not `rr:`). */
export function hasForeignComponents(rows: readonly ApiComponent[]): boolean {
  return rows.some((row) =>
    (row.components ?? []).some((component) => !isReactionRoleComponent(component.custom_id)),
  );
}

/** A stored binding, as far as the component helpers need it. */
export interface PanelBindingRef {
  id: string;
  roleId: string;
  groupId: string | null;
  mode: string;
}

/**
 * The message's components without one binding: its button, or its option in the group's
 * menu (a menu left without options is removed, and its pick limit lowered to what is left).
 * Rows left empty are dropped.
 */
export function stripPanelBinding(
  rows: readonly ApiComponent[],
  binding: PanelBindingRef,
): ApiComponent[] {
  const buttonId = panelButtonCustomId(binding.id);
  const selectId = binding.groupId ? panelSelectCustomId(binding.groupId) : null;
  return rows
    .map((row) => ({
      ...row,
      components: (row.components ?? []).flatMap((component): ApiComponent[] => {
        if (component.custom_id === buttonId) return [];
        if (selectId && component.custom_id === selectId) {
          const options = (component.options ?? []).filter(
            (option) => option.value !== binding.roleId,
          );
          if (options.length === 0) return [];
          return [
            {
              ...component,
              options,
              max_values: Math.min(component.max_values ?? 1, options.length),
            },
          ];
        }
        return [component];
      }),
    }))
    .filter((row) => row.components.length > 0);
}

const STYLE_BY_CODE = new Map(
  Object.entries(BUTTON_STYLE_CODES).map(([style, code]) => [code, style as PanelButtonStyle]),
);

/**
 * A published panel as builder input, read back from its message and bindings, so it can be
 * edited. Null when the message carries no reaction role buttons or menu.
 */
export function panelFromMessage(
  message: {
    channel_id: string;
    id: string;
    content: string;
    embeds: ApiEmbed[];
    components?: ApiComponent[];
  },
  bindings: readonly PanelBindingRef[],
): ReactionRolePanelInput | null {
  const components = (message.components ?? []).flatMap((row) => row.components ?? []);
  const embed = message.embeds[0];
  const base = {
    channelId: message.channel_id,
    messageId: message.id,
    content: message.content,
    embed: embed
      ? {
          title: embed.title ?? '',
          description: embed.description ?? '',
          color: embed.color ?? DEFAULT_PANEL_COLOR,
        }
      : null,
  };
  const menu = components.find((component) => component.custom_id?.startsWith(SELECT_PREFIX));
  if (menu) {
    return {
      ...base,
      kind: 'SELECT',
      placeholder: menu.placeholder ?? '',
      maxValues: menu.max_values ?? 1,
      items: (menu.options ?? []).map((option) => ({
        roleId: option.value,
        label: option.label,
        description: option.description ?? '',
        emoji: formatPanelEmoji(emojiOf(option.emoji)) || null,
      })),
    };
  }
  const byId = new Map(bindings.map((binding) => [panelButtonCustomId(binding.id), binding]));
  const buttons = components.filter((component) => byId.has(component.custom_id ?? ''));
  if (buttons.length === 0) return null;
  const mode = byId.get(buttons[0]!.custom_id!)!.mode;
  return {
    ...base,
    kind: 'BUTTONS',
    mode: (REACTION_ROLE_MODES as readonly string[]).includes(mode)
      ? (mode as ReactionRoleModeName)
      : 'TOGGLE',
    items: buttons.map((button) => ({
      roleId: byId.get(button.custom_id!)!.roleId,
      label: button.label ?? '',
      description: '',
      emoji: formatPanelEmoji(emojiOf(button.emoji)) || null,
      style: STYLE_BY_CODE.get(button.style ?? 1) ?? 'PRIMARY',
    })),
  };
}

function emojiOf(emoji: ApiEmoji | undefined): PanelEmoji | null {
  if (!emoji?.name) return null;
  return { id: emoji.id ?? null, name: emoji.name, animated: emoji.animated ?? false };
}
