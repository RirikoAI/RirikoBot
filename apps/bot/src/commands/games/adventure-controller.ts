import { createHash } from 'node:crypto';
import { AdventureError, type ActiveAdventureSession } from '@ririko/services';
import type { ButtonInteraction, Client, Message } from 'discord.js';
import type { BotServices } from '../../services.js';
import { adventureView } from './adventure-view.js';

type Services = Pick<BotServices, 'adventureEngine' | 'adventureSessions'>;
const errorCode = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'code' in error ? Number(error.code) : undefined;
const definitelyUnavailable = (error: unknown) =>
  [10003, 10008, 50001, 50013].includes(errorCode(error) ?? 0);

/** Database state owns the game. No collector is needed, so old buttons work after a restart. */
export class AdventureController {
  private timer: ReturnType<typeof setInterval> | undefined;
  private recovering = false;
  constructor(private readonly services: Services) {}

  async button(interaction: ButtonInteraction): Promise<void> {
    const [, id, revisionText, choice, extra] = interaction.customId.split(':');
    if (!id || !/^\d+$/.test(revisionText ?? '') || !choice || extra) {
      await interaction.reply({ content: 'This adventure button is invalid.', ephemeral: true });
      return;
    }
    const session = await this.services.adventureSessions.findById(id);
    if (!session || session.userId !== interaction.user.id) {
      await interaction.reply({
        content: 'Only the player who started this adventure can choose.',
        ephemeral: true,
      });
      return;
    }
    if (session.guildId !== interaction.guildId || session.channelId !== interaction.channelId) {
      await interaction.reply({
        content: 'Use the adventure buttons in the original channel.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    try {
      let next: ActiveAdventureSession;
      if (choice === 'abandon') {
        if (session.revision !== Number(revisionText))
          throw new AdventureError('STALE', 'That decision has already ended.');
        next = await this.services.adventureEngine.cancel(
          session.userId,
          id,
          'ABANDONED',
          Number(revisionText),
        );
      } else
        next = await this.services.adventureEngine.choose(
          session.userId,
          id,
          Number(revisionText),
          choice,
        );
      await this.deliver(interaction.client, next);
    } catch (error) {
      console.error('[Adventure] Button failed:', error);
      await interaction.followUp({
        content:
          error instanceof AdventureError
            ? error.message
            : 'Your choice could not finish. Check adventure status and try again.',
        ephemeral: true,
      });
    }
  }

  async deliver(client: Client, state: ActiveAdventureSession): Promise<ActiveAdventureSession> {
    // Always reread before rendering. A duplicate/stale interaction must not replay an older view.
    let session = (await this.services.adventureSessions.findById(state.id)) ?? state;
    if (session.status === 'SETTLING') {
      try {
        session = await this.services.adventureEngine.settle(session.userId, session.id);
      } catch (error) {
        console.error('[Adventure] Payout pending retry:', error);
      }
    }
    try {
      const channel = await client.channels.fetch(session.channelId);
      if (!channel?.isSendable())
        throw Object.assign(new Error('Adventure channel is unavailable'), { code: 10003 });
      let message: Message | undefined;
      if (session.messageId) {
        try {
          message = await channel.messages.fetch(session.messageId);
        } catch (error) {
          if (errorCode(error) !== 10008) throw error;
        }
      } else if (session.status === 'ACTIVE') {
        // Reconcile a send that succeeded but whose response or database acknowledgement was lost.
        const recent = await channel.messages.fetch({ limit: 100 });
        message = recent.find(
          (candidate) =>
            candidate.author.id === client.user?.id &&
            candidate.components.some(
              (row) =>
                'components' in row &&
                row.components.some(
                  (component) =>
                    'customId' in component &&
                    component.customId?.startsWith(`adventure:${session.id}:`),
                ),
            ),
        );
      }
      if (!message && session.status === 'START_FAILED') {
        return this.services.adventureEngine.presented(
          session.userId,
          session.id,
          session.revision,
          '',
        );
      }
      const payload = adventureView(session);
      if (message) await message.edit(payload);
      else
        message = await channel.send({
          ...payload,
          nonce: createHash('sha256')
            .update(`${session.id}:${session.revision}`)
            .digest('hex')
            .slice(0, 24),
          enforceNonce: true,
        });
      const current = await this.services.adventureEngine.presented(
        session.userId,
        session.id,
        session.revision,
        message.id,
      );
      // An action/timeout can commit while Discord is in flight. Repair that stale edit immediately.
      if (current.revision !== session.revision) return this.deliver(client, current);
      return current;
    } catch (error) {
      if (definitelyUnavailable(error)) {
        if (session.status === 'ACTIVE' && !session.presented && !session.history.length) {
          session = await this.services.adventureEngine.cancel(
            session.userId,
            session.id,
            'START_FAILED',
          );
        }
        if (session.receipt)
          await this.services.adventureEngine.presented(
            session.userId,
            session.id,
            session.revision,
            session.messageId ?? '',
          );
      }
      // Ambiguous network failures retain ownership; the durable delivery queue retries them.
      throw error;
    }
  }

  async recover(client: Client): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      // Reconcile uncertain deliveries before deadline recovery decides whether entry was published.
      let after = '';
      for (;;) {
        const pending = await this.services.adventureSessions.listUndelivered(after);
        if (!pending.length) break;
        for (const session of pending) {
          try {
            await this.deliver(client, session);
          } catch (error) {
            console.error(`[Adventure] Delivery pending for ${session.id}:`, error);
          }
        }
        after = pending.at(-1)!.id;
      }
      await this.services.adventureEngine.recover(
        (session) => this.deliver(client, session).then(() => {}),
        (error, session) => console.error(`[Adventure] Recovery failed for ${session.id}:`, error),
      );
    } finally {
      this.recovering = false;
    }
  }

  start(client: Client): void {
    if (this.timer) return;
    const run = () =>
      void this.recover(client).catch((error) =>
        console.error('[Adventure] Recovery failed:', error),
      );
    run();
    this.timer = setInterval(run, 5_000);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
