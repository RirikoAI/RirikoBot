import { describe, expect, it } from 'vitest';
import {
  buildPanelMessage,
  describePanelIssues,
  hasForeignComponents,
  panelFromMessage,
  parsePanelEmoji,
  ReactionRolePanelSchema,
  stripPanelBinding,
} from './reaction-roles.js';

const CHANNEL = '300000000000000001';
const ROLE_A = '200000000000000001';
const ROLE_B = '200000000000000002';
const ROLE_C = '200000000000000003';

describe('parsePanelEmoji', () => {
  it('reads Unicode and server emojis and rejects text', () => {
    expect(parsePanelEmoji(' 🎮 ')).toEqual({ id: null, name: '🎮', animated: false });
    expect(parsePanelEmoji('👩‍💻')).toEqual({ id: null, name: '👩‍💻', animated: false });
    expect(parsePanelEmoji('🇯🇵')).toEqual({ id: null, name: '🇯🇵', animated: false });
    expect(parsePanelEmoji('<a:party:123456789012345678>')).toEqual({
      id: '123456789012345678',
      name: 'party',
      animated: true,
    });
    expect(parsePanelEmoji('')).toBeNull();
    expect(parsePanelEmoji('gamer')).toBeUndefined();
    expect(parsePanelEmoji('<:x:1>')).toBeUndefined();
  });
});

describe('ReactionRolePanelSchema', () => {
  it('fills defaults', () => {
    expect(
      ReactionRolePanelSchema.parse({
        channelId: CHANNEL,
        content: 'Pick a role',
        kind: 'BUTTONS',
        items: [{ roleId: ROLE_A, label: 'Gamer', emoji: '🎮' }],
      }),
    ).toEqual({
      channelId: CHANNEL,
      messageId: null,
      content: 'Pick a role',
      embed: null,
      kind: 'BUTTONS',
      mode: 'TOGGLE',
      placeholder: '',
      maxValues: 1,
      items: [
        {
          roleId: ROLE_A,
          label: 'Gamer',
          description: '',
          emoji: { id: null, name: '🎮', animated: false },
          style: 'PRIMARY',
        },
      ],
    });
  });

  it('names each problem by role number', () => {
    const result = ReactionRolePanelSchema.safeParse({
      channelId: CHANNEL,
      kind: 'SELECT',
      maxValues: 3,
      items: [
        { roleId: ROLE_A, label: 'A' },
        { roleId: ROLE_A, label: '' },
        { roleId: ROLE_B, label: 'B', emoji: 'nope' },
      ],
    });
    expect(result.success).toBe(false);
    expect(describePanelIssues(result.error!.issues)).toEqual([
      'Role 3: Use one emoji, such as 🎮, or a server emoji written as <:name:id>.',
      'Add message text or an embed.',
      'Role 2: This role is already in the panel.',
      'Role 2: Menu options need a label.',
    ]);

    const second = ReactionRolePanelSchema.safeParse({
      channelId: CHANNEL,
      kind: 'SELECT',
      maxValues: 3,
      items: [
        { roleId: ROLE_A, label: 'A' },
        { roleId: ROLE_A, label: '' },
      ],
    });
    expect(describePanelIssues(second.error!.issues)).toEqual([
      'Add message text or an embed.',
      'Role 2: This role is already in the panel.',
      'Role 2: Menu options need a label.',
      'Members cannot pick more roles than the menu offers.',
    ]);
  });

  it('needs a label or emoji on buttons and a title or description on embeds', () => {
    const result = ReactionRolePanelSchema.safeParse({
      channelId: CHANNEL,
      embed: { title: '', description: '' },
      kind: 'BUTTONS',
      items: [{ roleId: ROLE_A }],
    });
    expect(describePanelIssues(result.error!.issues)).toEqual([
      'An embed needs a title or a description.',
      'Role 1: A button needs a label or an emoji.',
    ]);
  });
});

describe('panel messages', () => {
  const buttons = ReactionRolePanelSchema.parse({
    channelId: CHANNEL,
    content: 'Roles @everyone',
    embed: { title: 'Colours' },
    kind: 'BUTTONS',
    mode: 'UNIQUE',
    items: Array.from({ length: 6 }, (_, i) => ({
      roleId: `20000000000000001${i}`,
      label: `Role ${i}`,
      style: i === 0 ? 'DANGER' : 'PRIMARY',
      emoji: i === 1 ? '<:blob:123456789012345678>' : null,
    })),
  });
  const ids = buttons.items.map((_, i) => `binding-${i}`);

  it('lays buttons out 5 per row with binding custom IDs and never pings', () => {
    const body = buildPanelMessage(buttons, ids, 'group-1');
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds).toEqual([{ title: 'Colours', color: 0xe91e63 }]);
    expect(body.components.map((row) => row.components!.length)).toEqual([5, 1]);
    expect(body.components[0]!.components![0]).toEqual({
      type: 2,
      style: 4,
      custom_id: 'rr:btn:binding-0',
      label: 'Role 0',
    });
    expect(body.components[0]!.components![1]!.emoji).toEqual({
      id: '123456789012345678',
      name: 'blob',
      animated: false,
    });
  });

  it('builds one menu whose options are the roles and whose ID is the group', () => {
    const menu = ReactionRolePanelSchema.parse({
      channelId: CHANNEL,
      content: 'Pick',
      kind: 'SELECT',
      placeholder: 'Choose…',
      maxValues: 2,
      items: [
        { roleId: ROLE_A, label: 'A', description: 'First' },
        { roleId: ROLE_B, label: 'B', emoji: '🎮' },
      ],
    });
    expect(buildPanelMessage(menu, ['x', 'y'], 'group-1').components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'rr:select:group:group-1',
            placeholder: 'Choose…',
            min_values: 0,
            max_values: 2,
            options: [
              { label: 'A', value: ROLE_A, description: 'First' },
              { label: 'B', value: ROLE_B, emoji: { name: '🎮' } },
            ],
          },
        ],
      },
    ]);
  });

  it('strips one button or one option, dropping empty rows and menus', () => {
    const body = buildPanelMessage(buttons, ids, 'group-1');
    const stripped = stripPanelBinding(body.components, {
      id: 'binding-5',
      roleId: buttons.items[5]!.roleId,
      groupId: 'group-1',
      mode: 'UNIQUE',
    });
    expect(stripped.map((row) => row.components!.length)).toEqual([5]);

    const menuRows = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'rr:select:group:g',
            max_values: 2,
            options: [
              { label: 'A', value: ROLE_A },
              { label: 'B', value: ROLE_B },
            ],
          },
        ],
      },
    ];
    const one = stripPanelBinding(menuRows, {
      id: 'b',
      roleId: ROLE_B,
      groupId: 'g',
      mode: 'TOGGLE',
    });
    expect(one[0]!.components![0]).toMatchObject({ max_values: 1, options: [{ value: ROLE_A }] });
    expect(
      stripPanelBinding(one, { id: 'a', roleId: ROLE_A, groupId: 'g', mode: 'TOGGLE' }),
    ).toEqual([]);
  });

  it('spots components of other features', () => {
    expect(hasForeignComponents(buildPanelMessage(buttons, ids, 'g').components)).toBe(false);
    expect(
      hasForeignComponents([
        { type: 1, components: [{ type: 2, custom_id: 'verify:btn:verify' }] },
      ]),
    ).toBe(true);
  });

  it('reads a published panel back for editing', () => {
    const body = buildPanelMessage(buttons, ids, 'group-1');
    const bindings = buttons.items.map((item, i) => ({
      id: ids[i]!,
      roleId: item.roleId,
      groupId: 'group-1',
      mode: 'UNIQUE',
    }));
    const input = panelFromMessage(
      { channel_id: CHANNEL, id: '400000000000000001', ...body },
      bindings,
    );
    expect(ReactionRolePanelSchema.parse(input)).toEqual({
      ...buttons,
      messageId: '400000000000000001',
    });

    const menu = ReactionRolePanelSchema.parse({
      channelId: CHANNEL,
      content: 'Pick',
      kind: 'SELECT',
      maxValues: 1,
      items: [
        { roleId: ROLE_A, label: 'A' },
        { roleId: ROLE_C, label: 'C', emoji: '🎮' },
      ],
    });
    const menuBody = buildPanelMessage(menu, ['x', 'y'], 'g');
    expect(
      ReactionRolePanelSchema.parse(
        panelFromMessage({ channel_id: CHANNEL, id: '400000000000000002', ...menuBody }, []),
      ),
    ).toEqual({ ...menu, messageId: '400000000000000002' });

    expect(
      panelFromMessage(
        { channel_id: CHANNEL, id: '1', content: 'x', embeds: [], components: [] },
        [],
      ),
    ).toBeNull();
  });
});
