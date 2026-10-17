import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '@ririko/discord';
import { buildTermsNotice, createTermsNoticeMiddleware, type LegalLinks } from './terms-notice.js';

const links: LegalLinks = {
  termsUrl: 'https://example.org/terms',
  privacyUrl: 'https://example.org/privacy',
};

function setup(accepted: boolean) {
  const consentService = {
    hasAccepted: vi.fn().mockResolvedValue(accepted),
    accept: vi.fn().mockResolvedValue(undefined),
  };
  return {
    consentService,
    middleware: createTermsNoticeMiddleware({ consentService, legalLinks: links }),
  };
}

function ctx(overrides: Record<string, unknown>) {
  const fake = {
    user: { id: 'u1' },
    source: 'slash',
    isReplied: false,
    isDeferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { fake, ctx: fake as unknown as CommandContext };
}

describe('buildTermsNotice', () => {
  it('links both pages and says the host of a self-hosted bot is responsible', () => {
    const text = buildTermsNotice(links);

    expect(text).toContain('accept the [Terms of Service](<https://example.org/terms>)');
    expect(text).toContain('[Privacy Policy](<https://example.org/privacy>)');
    expect(text).toContain('host is responsible for your data');
    expect(text.split('\n')).toHaveLength(2);
  });
});

describe('createTermsNoticeMiddleware', () => {
  it('replies to the message of a prefix command', async () => {
    const { middleware, consentService } = setup(false);
    const { fake, ctx: context } = ctx({ source: 'prefix' });

    await middleware(context, vi.fn().mockResolvedValue(undefined));

    expect(fake.reply).toHaveBeenCalledWith(buildTermsNotice(links));
    expect(fake.followUp).not.toHaveBeenCalled();
    expect(consentService.accept).toHaveBeenCalledWith('u1', 'terms');
  });

  it('follows up ephemerally once the slash command has replied', async () => {
    const { middleware } = setup(false);
    const { fake, ctx: context } = ctx({ isReplied: true });

    await middleware(context, vi.fn().mockResolvedValue(undefined));

    expect(fake.followUp).toHaveBeenCalledWith({
      content: buildTermsNotice(links),
      flags: MessageFlags.Ephemeral,
    });
    expect(fake.reply).not.toHaveBeenCalled();
  });

  it('follows up after a deferred reply too', async () => {
    const { middleware } = setup(false);
    const { fake, ctx: context } = ctx({ source: 'context-menu', isDeferred: true });

    await middleware(context, vi.fn().mockResolvedValue(undefined));

    expect(fake.followUp).toHaveBeenCalledTimes(1);
  });

  it('replies ephemerally when the command left the interaction unanswered', async () => {
    const { middleware } = setup(false);
    const { fake, ctx: context } = ctx({});

    await middleware(context, vi.fn().mockResolvedValue(undefined));

    expect(fake.reply).toHaveBeenCalledWith({
      content: buildTermsNotice(links),
      flags: MessageFlags.Ephemeral,
    });
  });

  it('shows nothing to a user who accepted the current version', async () => {
    const { middleware, consentService } = setup(true);
    const { fake, ctx: context } = ctx({ isReplied: true });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(fake.followUp).not.toHaveBeenCalled();
    expect(consentService.accept).not.toHaveBeenCalled();
  });

  it('logs a failure and keeps the command result', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { middleware, consentService } = setup(false);
    consentService.hasAccepted.mockRejectedValue(new Error('db down'));
    const { ctx: context } = ctx({});

    await expect(
      middleware(context, vi.fn().mockResolvedValue(undefined)),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('[TermsNotice]'), expect.any(Error));
    error.mockRestore();
  });
});
