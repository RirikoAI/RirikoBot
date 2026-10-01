import { CommandSettingsRepository } from '@ririko/database';
import { CommandCategory } from '@ririko/discord';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { startBotHarness, type BotHarness } from '../support/bot-harness.js';

describe('prefix commands through the real router (TASK-1202)', () => {
  let harness: BotHarness;

  beforeAll(async () => {
    harness = await startBotHarness();
  }, 60_000);

  afterEach(async () => {
    await harness.settle();
    harness.assertAllRoutesHandled();
    harness.fake.reset();
  });

  afterAll(() => harness?.close());

  const replies = () =>
    harness.fake
      .find('POST', `/channels/${ids.generalChannel}/messages`)
      .map((r) => r.body as { content?: string; message_reference?: { message_id: string } });

  it('replies to the invoking message', async () => {
    const messageId = harness.sendMessage('!ping');
    await harness.settle();

    expect(replies()).toEqual([
      expect.objectContaining({
        content: expect.stringContaining('Pong'),
        message_reference: expect.objectContaining({ message_id: messageId }),
      }),
    ]);
  });

  it('switches to a custom guild prefix set by the owner', async () => {
    harness.sendMessage('!prefix ?');
    await harness.settle();
    expect(await harness.services.guildSettingsService.getPrefix(ids.mainGuild)).toBe('?');

    harness.fake.reset();
    harness.sendMessage('!ping');
    harness.sendMessage('?ping');
    await harness.settle();
    expect(replies()).toHaveLength(1);
    expect(replies()[0]?.content).toContain('Pong');

    await harness.services.guildSettingsService.setPrefix(ids.mainGuild, '!');
  });

  it('refuses a prefix change from a member without Manage Server', async () => {
    harness.sendMessage('!prefix ?', { userId: ids.member });
    await harness.settle();

    expect(replies()[0]?.content).toMatch(/^🚫/);
    expect(await harness.services.guildSettingsService.getPrefix(ids.mainGuild)).toBe('!');
  });

  it('blocks a command disabled on the dashboard for members, but not for staff', async () => {
    await new CommandSettingsRepository(harness.db).replaceForGuild(ids.mainGuild, [
      {
        commandName: 'dice',
        channelId: null,
        isEnabled: false,
        cooldownOverride: null,
        allowedRoles: [],
        blockedRoles: [],
      },
    ]);
    // What the config watcher emits after a dashboard save.
    await harness.services.eventBus.emitAsync('guild:configChanged', {
      guildId: ids.mainGuild,
      module: 'commands',
      version: 1,
    });

    harness.sendMessage('!dice', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content).toBe('🔒 `dice` is disabled in this server.');

    harness.fake.reset();
    harness.sendMessage('!dice');
    await harness.settle();
    expect(replies()).toHaveLength(1);
    expect(replies()[0]?.content ?? '').not.toMatch(/^🔒/);

    await new CommandSettingsRepository(harness.db).replaceForGuild(ids.mainGuild, []);
    harness.services.commandOverrideService.invalidate(ids.mainGuild);
  });

  it('enforces a command cooldown per user', async () => {
    harness.sendMessage('!cf', { userId: ids.member });
    await harness.settle();
    harness.sendMessage('!cf', { userId: ids.member });
    await harness.settle();

    const [first, second] = replies();
    expect(first?.content ?? '').not.toMatch(/^⏳/);
    expect(second?.content).toMatch(/^⏳ You must wait \d+s before using this command again\.$/);
  });

  it('blocks commands during maintenance mode for regular users while allowing owners', async () => {
    (harness.services as { botOwnerIds: readonly string[] }).botOwnerIds = [ids.admin];
    harness.services.maintenanceService.enable('Undergoing database upgrades.');

    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content).toBe('🛠️ Undergoing database upgrades.');

    harness.fake.reset();
    // Bot owner bypasses maintenance mode
    harness.sendMessage('!ping', { userId: ids.admin });
    await harness.settle();
    expect(replies()).toHaveLength(1);
    expect(replies()[0]?.content).toContain('Pong');

    harness.services.maintenanceService.disable();
  });

  it('blocks commands when their parent module is disabled for the server', async () => {
    // Disable the games module for the guild
    harness.services.moduleToggleService.setModuleEnabled(ids.mainGuild, 'games', false);

    // Regular member invokes !cf (category: games)
    harness.sendMessage('!cf', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content).toBe('🔒 The games module is currently disabled in this server.');

    // Exempt categories (like general: !ping) remain accessible
    harness.fake.reset();
    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    expect(replies()).toHaveLength(1);
    expect(replies()[0]?.content).toContain('Pong');

    // Re-enable games module
    harness.services.moduleToggleService.setModuleEnabled(ids.mainGuild, 'games', true);
    harness.fake.reset();
    harness.sendMessage('!cf', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content ?? '').not.toMatch(/^🔒/);
  });

  it('enforces rate limits per command metadata and allows bypass for guild owner', async () => {
    harness.router.registry.register({
      metadata: {
        name: 'rltest',
        category: CommandCategory.GENERAL,
        description: 'Rate limit test',
        rateLimit: { max: 1, windowSeconds: 10 },
      },
      execute: async (ctx) => {
        await ctx.reply({ content: 'Rate limit test pass' });
      },
    });

    // 1. Regular member first invocation succeeds
    harness.sendMessage('!rltest', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content).toContain('Rate limit test pass');

    // 2. Regular member second invocation immediately exceeds rate limit
    harness.fake.reset();
    harness.sendMessage('!rltest', { userId: ids.member });
    await harness.settle();
    expect(replies()[0]?.content).toMatch(/^⏱️ Rate limit exceeded\. Try again in \d+s\.$/);

    // 3. Guild owner (ids.admin) bypasses rate limit
    harness.fake.reset();
    harness.sendMessage('!rltest', { userId: ids.admin });
    await harness.settle();
    expect(replies()).toHaveLength(1);
    expect(replies()[0]?.content).toContain('Rate limit test pass');
  });
});
