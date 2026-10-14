import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GatewayIntentBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  GUIDES,
  GUIDE_IMAGE_DIR,
  dashboardRedirectUri,
  getGuide,
  guideImageFiles,
  privilegedIntentLabels,
} from './guides.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

describe('guides', () => {
  it('has the guides the wizard needs and none of the dropped ones', () => {
    const ids = GUIDES.map((guide) => guide.id);
    expect(ids).toEqual([
      'discord',
      'owner-id',
      'openai',
      'gemini',
      'ollama',
      'replicate',
      'comfyui',
      'twitch',
      'youtube',
      'spotify',
      'postgres',
      'dashboard-oauth',
    ]);
    expect(ids.some((id) => /mongo|nlp/i.test(id))).toBe(false);
  });

  it('numbers every step "Step N: ..." in order', () => {
    for (const guide of GUIDES) {
      guide.steps.forEach((step, index) => {
        expect(step.heading.startsWith(`Step ${index + 1}: `)).toBe(true);
      });
    }
  });

  it('only names image files that exist in assets/installer/images', () => {
    const files = guideImageFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(existsSync(join(ROOT, GUIDE_IMAGE_DIR, file)), file).toBe(true);
    }
  });

  it('gives each image alt text and a caption', () => {
    for (const guide of GUIDES) {
      for (const step of guide.steps) {
        for (const image of step.images ?? []) {
          expect(image.alt.length).toBeGreaterThan(0);
          expect(image.caption.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the five Twitch steps from 1.x', () => {
    const twitch = getGuide('twitch');
    expect(twitch.steps.map((step) => step.heading)).toEqual([
      'Step 1: Create a Twitch Developer Account',
      'Step 2: Create a New Application',
      'Step 3: Fill in Application Details',
      'Step 4: Obtain Client ID and Client Secret',
      "Step 5: You've Got Both the Client ID and Client Secret now!",
    ]);
    expect(guideImageFiles()).toEqual(
      expect.arrayContaining([
        'twitch-step1.png',
        'twitch-step2_1.png',
        'twitch-step2_2.png',
        'twitch-step3.png',
        'twitch-step4.png',
        'replicate.png',
      ]),
    );
  });

  it('derives the privileged intents from the gateway intents', () => {
    expect(privilegedIntentLabels()).toEqual(['SERVER MEMBERS INTENT', 'MESSAGE CONTENT INTENT']);
    expect(privilegedIntentLabels([GatewayIntentBits.Guilds])).toEqual([]);
    expect(
      privilegedIntentLabels([GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent]),
    ).toEqual(['PRESENCE INTENT', 'MESSAGE CONTENT INTENT']);
    const discord = getGuide('discord');
    const text = discord.steps.map((step) => [step.heading, ...step.text].join(' ')).join('\n');
    expect(discord.steps[4]?.heading).toBe('Step 5: Check the 2 Privileged Gateway Intents.');
    expect(text).toContain('SERVER MEMBERS INTENT and MESSAGE CONTENT INTENT');
    expect(text).not.toMatch(/Add Bot/);
  });

  it('puts the dashboard redirect in the OAuth2 guide', () => {
    const guide = getGuide('dashboard-oauth');
    const text = JSON.stringify(guide);
    expect(text).toContain('<DASHBOARD_URL>/api/auth/callback');
    expect(dashboardRedirectUri('http://localhost:3000/')).toBe(
      'http://localhost:3000/api/auth/callback',
    );
  });

  it('shows a PostgreSQL example box like the 1.x MongoDB one', () => {
    const callout = getGuide('postgres').steps.find((step) => step.callout)?.callout;
    expect(callout?.kind).toBe('info');
    expect(callout?.code).toMatch(/^postgresql:\/\//);
  });

  it('rejects an unknown guide id', () => {
    expect(() => getGuide('mongodb' as never)).toThrow(/Unknown guide/);
  });
});
