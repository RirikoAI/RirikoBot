import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import type { CommandRegistry } from '@ririko/discord';
import { registerComponentInteractions } from './component-interactions.js';
import type { CommandControllers } from './command-set.js';
import type { BotServices } from './services.js';

const ticketHandlers = vi.hoisted(() => ({
  button: vi.fn(),
  modal: vi.fn(),
}));
const helpHandler = vi.hoisted(() => vi.fn());
const cardDropClaimHandler = vi.hoisted(() => vi.fn());

vi.mock('./index.js', () => ({
  handleGiveawayButtonInteraction: vi.fn(),
  handleImagineButtonInteraction: vi.fn(),
  handleTicketButton: ticketHandlers.button,
  handleTicketModal: ticketHandlers.modal,
  isTicketCustomId: (id: string) => id.startsWith('ticket:'),
}));
vi.mock('./commands/tcg/card-drop-claim.js', () => ({
  CARD_DROP_CLAIM_PREFIX: 'carddrop:claim:',
  handleCardDropClaimButton: cardDropClaimHandler,
}));
vi.mock('@ririko/discord', () => ({ handleHelpInteraction: helpHandler }));

describe('component interaction routing (TASK-1984)', () => {
  let client: EventEmitter;
  let services: BotServices;
  let controllers: CommandControllers;
  let adventureButton: ReturnType<typeof vi.fn>;
  let rrSelect: ReturnType<typeof vi.fn>;

  function emit(interaction: Record<string, unknown>): Promise<void> {
    const flags = {
      isButton: () => false,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
      ...interaction,
    };
    client.emit('interactionCreate', flags);
    return new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EventEmitter();
    adventureButton = vi.fn();
    rrSelect = vi.fn();
    services = {
      reactionRoleService: { handleSelectMenuInteraction: rrSelect },
    } as unknown as BotServices;
    controllers = {
      adventureController: { button: adventureButton },
      musicController: {},
    } as unknown as CommandControllers;
    registerComponentInteractions(client as unknown as Client, {
      services,
      controllers,
      registry: {} as CommandRegistry,
      helpOptions: { defaultPrefix: '!' },
    });
  });

  it('sends ticket buttons to the ticket handler', async () => {
    const interaction = { isButton: () => true, customId: 'ticket:open' };
    await emit(interaction);
    expect(ticketHandlers.button).toHaveBeenCalledWith(
      expect.objectContaining({ customId: 'ticket:open' }),
      services,
    );
    expect(helpHandler).not.toHaveBeenCalled();
  });

  it('sends the Claim button of a card drop to the claim handler', async () => {
    await emit({ isButton: () => true, customId: 'carddrop:claim:drop-1' });
    expect(cardDropClaimHandler).toHaveBeenCalledWith(
      expect.objectContaining({ customId: 'carddrop:claim:drop-1' }),
      services,
    );
    expect(helpHandler).not.toHaveBeenCalled();
  });

  it('sends ticket modal submits to the modal handler', async () => {
    await emit({ isModalSubmit: () => true, customId: 'ticket:modal:open' });
    expect(ticketHandlers.modal).toHaveBeenCalledWith(
      expect.objectContaining({ customId: 'ticket:modal:open' }),
      services,
    );
    expect(helpHandler).not.toHaveBeenCalled();
  });

  it('does not route other modal submits', async () => {
    await emit({ isModalSubmit: () => true, customId: 'other:modal' });
    expect(ticketHandlers.modal).not.toHaveBeenCalled();
    expect(helpHandler).not.toHaveBeenCalled();
  });

  it('keeps the existing button and select routes working', async () => {
    await emit({ isButton: () => true, customId: 'adventure:go' });
    expect(adventureButton).toHaveBeenCalledTimes(1);
    expect(ticketHandlers.button).not.toHaveBeenCalled();

    await emit({ isStringSelectMenu: () => true, customId: 'rr:select:1' });
    expect(rrSelect).toHaveBeenCalledTimes(1);
  });

  it('hands everything else to the help center', async () => {
    await emit({ isButton: () => true, customId: 'unknown:button' });
    expect(helpHandler).toHaveBeenCalledTimes(1);
  });

  it('logs a failing handler instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ticketHandlers.button.mockRejectedValueOnce(new Error('boom'));
    await emit({ isButton: () => true, customId: 'ticket:claim' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    spy.mockRestore();
  });
});
