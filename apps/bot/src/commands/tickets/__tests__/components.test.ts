import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, MessageFlags } from 'discord.js';
import {
  TICKET_CLAIM_BUTTON_ID,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_OPEN_BUTTON_ID,
} from '@ririko/services';
import type { BotServices } from '../../../services.js';
import {
  TICKET_CLOSE_MODAL_ID,
  TICKET_OPEN_MODAL_ID,
  buildCloseTicketModal,
  buildOpenTicketModal,
  handleTicketButton,
  handleTicketModal,
  isTicketCustomId,
} from '../components.js';

/** The action row shape that `ModalBuilder.addComponents(ActionRowBuilder)` produces. */
interface ModalJson {
  custom_id: string;
  components: Array<{
    components: Array<{
      custom_id: string;
      label: string;
      required: boolean;
      max_length: number;
    }>;
  }>;
}

const MEMBER = { id: 'user-1', permissions: { has: () => false } };
const ticketChannel = { id: 'chan-1', type: ChannelType.GuildText };

describe('ticket buttons and modals (TASK-1984)', () => {
  let ticketService: Record<'open' | 'claim' | 'close', ReturnType<typeof vi.fn>>;
  let services: BotServices;
  let membersFetch: ReturnType<typeof vi.fn>;

  function makeInteraction(
    customId: string,
    overrides: Record<string, unknown> = {},
    fields: Record<string, string> = {},
  ) {
    return {
      customId,
      inGuild: () => true,
      user: { id: 'user-1' },
      member: MEMBER,
      channel: ticketChannel,
      guild: { members: { fetch: membersFetch } },
      fields: { getTextInputValue: vi.fn((id: string) => fields[id] ?? '') },
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      showModal: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  const answer = (interaction: { editReply: ReturnType<typeof vi.fn> }): string =>
    interaction.editReply.mock.calls.at(-1)![0].content;

  beforeEach(() => {
    membersFetch = vi.fn().mockResolvedValue(MEMBER);
    ticketService = {
      open: vi.fn().mockResolvedValue({
        ok: true,
        ticket: { number: 3 },
        channel: { id: 'new-chan' },
        welcomePosted: true,
      }),
      claim: vi.fn().mockResolvedValue({ ok: true, ticket: { number: 3 } }),
      close: vi.fn().mockResolvedValue({
        ok: true,
        ticket: { number: 3 },
        transcriptChannelId: 'log-1',
        channelDeleted: true,
      }),
    };
    services = { ticketService } as unknown as BotServices;
  });

  describe('the modals', () => {
    it('the open modal has one required Subject field of at most 200 characters', () => {
      const json = buildOpenTicketModal().toJSON() as ModalJson;
      expect(json.custom_id).toBe(TICKET_OPEN_MODAL_ID);
      expect(json.components).toHaveLength(1);
      const input = json.components[0]!.components[0]!;
      expect(input).toMatchObject({ custom_id: 'subject', label: 'Subject', required: true });
      expect(input.max_length).toBe(200);
    });

    it('the close modal has one optional Reason field of at most 500 characters', () => {
      const json = buildCloseTicketModal().toJSON() as ModalJson;
      expect(json.custom_id).toBe(TICKET_CLOSE_MODAL_ID);
      const input = json.components[0]!.components[0]!;
      expect(input).toMatchObject({ custom_id: 'reason', required: false });
      expect(input.max_length).toBe(500);
    });

    it('recognises ticket custom ids', () => {
      expect(isTicketCustomId('ticket:open')).toBe(true);
      expect(isTicketCustomId(TICKET_OPEN_MODAL_ID)).toBe(true);
      expect(isTicketCustomId('giveaway:enter:1')).toBe(false);
    });
  });

  describe('handleTicketButton', () => {
    it('Open Ticket shows the subject modal as the first response', async () => {
      const interaction = makeInteraction(TICKET_OPEN_BUTTON_ID);
      await handleTicketButton(interaction, services);
      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      expect(interaction.showModal.mock.calls[0]![0].toJSON().custom_id).toBe(TICKET_OPEN_MODAL_ID);
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(ticketService.open).not.toHaveBeenCalled();
    });

    it('Close shows the reason modal without closing yet', async () => {
      const interaction = makeInteraction(TICKET_CLOSE_BUTTON_ID);
      await handleTicketButton(interaction, services);
      expect(interaction.showModal.mock.calls[0]![0].toJSON().custom_id).toBe(
        TICKET_CLOSE_MODAL_ID,
      );
      expect(ticketService.close).not.toHaveBeenCalled();
    });

    it('Claim calls the service and answers privately', async () => {
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID);
      await handleTicketButton(interaction, services);
      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(ticketService.claim).toHaveBeenCalledWith(MEMBER, ticketChannel);
      expect(answer(interaction)).toBe('You claimed this ticket.');
    });

    it('Claim passes a refusal on', async () => {
      ticketService.claim.mockResolvedValue({ ok: false, message: 'Only the staff can do that.' });
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID);
      await handleTicketButton(interaction, services);
      expect(answer(interaction)).toBe('Only the staff can do that.');
    });

    it('Claim outside a text channel is not a ticket', async () => {
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID, { channel: null });
      await handleTicketButton(interaction, services);
      expect(answer(interaction)).toBe('This channel is not an open ticket.');
      const thread = makeInteraction(TICKET_CLAIM_BUTTON_ID, {
        channel: { id: 't', type: ChannelType.PublicThread },
      });
      await handleTicketButton(thread, services);
      expect(answer(thread)).toBe('This channel is not an open ticket.');
      expect(ticketService.claim).not.toHaveBeenCalled();
    });

    it('fetches the member when the interaction carries a raw one', async () => {
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID, {
        member: { permissions: '8' },
      });
      await handleTicketButton(interaction, services);
      expect(membersFetch).toHaveBeenCalledWith('user-1');
      expect(ticketService.claim).toHaveBeenCalledWith(MEMBER, ticketChannel);
    });

    it('stops when the member cannot be found', async () => {
      membersFetch.mockRejectedValue(new Error('Unknown Member'));
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID, { member: null });
      await handleTicketButton(interaction, services);
      expect(answer(interaction)).toBe('This channel is not an open ticket.');
      const noGuild = makeInteraction(TICKET_CLAIM_BUTTON_ID, { member: null, guild: null });
      await handleTicketButton(noGuild, services);
      expect(ticketService.claim).not.toHaveBeenCalled();
    });

    it('refuses outside a server', async () => {
      const interaction = makeInteraction(TICKET_OPEN_BUTTON_ID, { inGuild: () => false });
      await handleTicketButton(interaction, services);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: MessageFlags.Ephemeral,
          content: expect.stringContaining('server'),
        }),
      );
      expect(interaction.showModal).not.toHaveBeenCalled();
    });

    it('ignores an unknown ticket button', async () => {
      const interaction = makeInteraction('ticket:other');
      await handleTicketButton(interaction, services);
      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('survives a failed answer', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const interaction = makeInteraction(TICKET_CLAIM_BUTTON_ID);
      interaction.editReply.mockRejectedValue(new Error('Unknown Interaction'));
      await expect(handleTicketButton(interaction, services)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unknown Interaction'));
      spy.mockRestore();
    });
  });

  describe('handleTicketModal', () => {
    it('the subject modal defers, opens the ticket and links the channel', async () => {
      const interaction = makeInteraction(TICKET_OPEN_MODAL_ID, {}, { subject: 'Cannot log in' });
      await handleTicketModal(interaction, services);
      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(ticketService.open).toHaveBeenCalledWith(MEMBER, 'Cannot log in');
      expect(answer(interaction)).toBe('Your ticket is ready: <#new-chan>.');
    });

    it('notes a missing welcome message', async () => {
      ticketService.open.mockResolvedValue({
        ok: true,
        ticket: { number: 3 },
        channel: { id: 'new-chan' },
        welcomePosted: false,
      });
      const interaction = makeInteraction(TICKET_OPEN_MODAL_ID, {}, { subject: 'Help' });
      await handleTicketModal(interaction, services);
      expect(answer(interaction)).toContain('<#new-chan>');
      expect(answer(interaction)).toContain('could not post the welcome message');
    });

    it('answers a refusal from open', async () => {
      ticketService.open.mockResolvedValue({
        ok: false,
        message: 'You already have an open ticket. Close it before opening another.',
      });
      const interaction = makeInteraction(TICKET_OPEN_MODAL_ID, {}, { subject: 'Help' });
      await handleTicketModal(interaction, services);
      expect(answer(interaction)).toContain('already have an open ticket');
    });

    it('the reason modal closes the ticket with the typed reason', async () => {
      const interaction = makeInteraction(TICKET_CLOSE_MODAL_ID, {}, { reason: 'Solved' });
      await handleTicketModal(interaction, services);
      expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(ticketService.close).toHaveBeenCalledWith(MEMBER, ticketChannel, 'Solved');
      expect(answer(interaction)).toBe('Ticket #0003 is closed. The transcript is in <#log-1>.');
    });

    it('an empty reason is passed on for the service to drop', async () => {
      const interaction = makeInteraction(TICKET_CLOSE_MODAL_ID);
      await handleTicketModal(interaction, services);
      expect(ticketService.close).toHaveBeenCalledWith(MEMBER, ticketChannel, '');
    });

    it('answers a refusal from close', async () => {
      ticketService.close.mockResolvedValue({
        ok: false,
        message: 'Only the person who opened the ticket and the staff can close it.',
      });
      const interaction = makeInteraction(TICKET_CLOSE_MODAL_ID);
      await handleTicketModal(interaction, services);
      expect(answer(interaction)).toContain('Only the person who opened the ticket');
    });

    it('close outside a ticket channel is refused', async () => {
      const interaction = makeInteraction(TICKET_CLOSE_MODAL_ID, { channel: null });
      await handleTicketModal(interaction, services);
      expect(answer(interaction)).toBe('This channel is not an open ticket.');
      expect(ticketService.close).not.toHaveBeenCalled();
    });

    it('stops when the member cannot be found', async () => {
      membersFetch.mockRejectedValue(new Error('Unknown Member'));
      const interaction = makeInteraction(TICKET_OPEN_MODAL_ID, { member: null });
      await handleTicketModal(interaction, services);
      expect(answer(interaction)).toContain('Could not find you');
      expect(ticketService.open).not.toHaveBeenCalled();
    });

    it('refuses outside a server and ignores unknown modals', async () => {
      const outside = makeInteraction(TICKET_OPEN_MODAL_ID, { inGuild: () => false });
      await handleTicketModal(outside, services);
      expect(outside.reply).toHaveBeenCalledWith(
        expect.objectContaining({ flags: MessageFlags.Ephemeral }),
      );
      expect(outside.deferReply).not.toHaveBeenCalled();

      const unknown = makeInteraction('ticket:modal:other');
      await handleTicketModal(unknown, services);
      expect(unknown.deferReply).not.toHaveBeenCalled();
    });
  });
});
