import { DEFAULT_GATEWAY_INTENTS } from '@ririko/discord';
import { GatewayIntentBits } from 'discord.js';

/**
 * The setup wizard's guides as data. A guide is a list of numbered steps with text, links and an
 * optional screenshot. The 1.x installer guides (Discord, the OpenAI key, Replicate, Twitch) are
 * ported from `.local/installer-1x/index.html`; the rest are written in the same voice: short
 * numbered steps, one action each, the exact button names. Images live in
 * `assets/installer/images/`.
 */

export type GuideId =
  | 'discord'
  | 'owner-id'
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'replicate'
  | 'comfyui'
  | 'twitch'
  | 'youtube'
  | 'spotify'
  | 'postgres'
  | 'lavalink'
  | 'dashboard-oauth';

export interface GuideLink {
  label: string;
  href: string;
}

export interface GuideImage {
  /** File name inside `assets/installer/images/`. */
  file: string;
  alt: string;
  /** Shown under the full-size image. */
  caption: string;
}

export interface GuideCallout {
  kind: 'info' | 'warning';
  text: string;
  /** An example shown in a box under the text. */
  code?: string;
}

export interface GuideStep {
  /** Always "Step N: ...". */
  heading: string;
  text: string[];
  links?: GuideLink[];
  images?: GuideImage[];
  callout?: GuideCallout;
}

export interface Guide {
  id: GuideId;
  title: string;
  steps: GuideStep[];
}

/** The folder, relative to the repository root, that holds the guide images. */
export const GUIDE_IMAGE_DIR = 'assets/installer/images';

/** Placeholder the dashboard guide shows in place of the reader's address. */
export const DASHBOARD_URL_PLACEHOLDER = '<DASHBOARD_URL>';

const PRIVILEGED_INTENT_LABELS: ReadonlyMap<GatewayIntentBits, string> = new Map([
  [GatewayIntentBits.GuildPresences, 'PRESENCE INTENT'],
  [GatewayIntentBits.GuildMembers, 'SERVER MEMBERS INTENT'],
  [GatewayIntentBits.MessageContent, 'MESSAGE CONTENT INTENT'],
]);

/**
 * The privileged intents the bot asks for, in the Developer Portal's wording, from
 * `DEFAULT_GATEWAY_INTENTS` (Server Members and Message Content; Presence is not requested).
 */
export function privilegedIntentLabels(
  intents: readonly GatewayIntentBits[] = DEFAULT_GATEWAY_INTENTS,
): string[] {
  const labels: string[] = [];
  for (const [intent, label] of PRIVILEGED_INTENT_LABELS) {
    if (intents.includes(intent)) labels.push(label);
  }
  return labels;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const intentLabels = privilegedIntentLabels();

const DISCORD: Guide = {
  id: 'discord',
  title: 'Get your Application ID and Bot Token',
  steps: [
    {
      heading: 'Step 1: Go to Discord Developer Portal page.',
      text: [],
      links: [
        { label: 'Click on this link', href: 'https://discord.com/developers/applications/' },
      ],
    },
    {
      heading: 'Step 2: Click on one of your application.',
      text: [`If you don't have one, create a new one by clicking "New Application"`],
    },
    {
      heading: 'Step 3: Copy the Application ID.',
      text: [
        'On the General Information page, find the Application ID and click the Copy button. Then, paste it on the Application ID form above',
      ],
    },
    {
      heading: 'Step 4: Get the Bot Token.',
      text: [
        'Click on the Bot tab on the left side. Then click on the Reset Token and confirm. Copy the token and paste it on the Bot Token form above. Discord shows the token only once: if you lose it, reset it again.',
      ],
    },
    {
      heading: `Step 5: Check the ${intentLabels.length} Privileged Gateway Intents.`,
      text: [
        `This is super important! On the same Bot page, turn on the ${joinAnd(intentLabels)} toggles for your bot to function properly. The Presence Intent stays off. Finally, don't forget to click on the Save Changes button at the Discord bot page.`,
      ],
    },
  ],
};

const OWNER_ID: Guide = {
  id: 'owner-id',
  title: 'Find your Discord user ID',
  steps: [
    {
      heading: 'Step 1: Turn on Developer Mode.',
      text: [
        'In Discord, open User Settings, click Advanced, and turn on the Developer Mode toggle.',
      ],
    },
    {
      heading: 'Step 2: Copy your user ID.',
      text: [
        'Right-click your own name or avatar anywhere in Discord and click "Copy User ID". Paste it on the Bot Owner ID form above.',
        'To name more than one owner, separate the IDs with a comma.',
      ],
    },
  ],
};

const OPENAI: Guide = {
  id: 'openai',
  title: 'Get an OpenAI API key',
  steps: [
    {
      heading: 'Step 1: Go to API keys page for OpenAI.',
      text: ["Proceed to sign up for an account if you don't have one. API usage is not free."],
      links: [
        { label: 'Click on this link', href: 'https://platform.openai.com/account/api-keys' },
      ],
    },
    {
      heading: 'Step 2: Create a new API key.',
      text: ['Click "Create new secret key" and give it a name.'],
    },
    {
      heading: 'Step 3: Copy the key.',
      text: [
        'Paste it in the OpenAI API key form above. OpenAI shows the key only once.',
        'To use another service that speaks the OpenAI API (OpenRouter, Groq or a local proxy), also enter its address in the OpenAI base URL form.',
      ],
    },
  ],
};

const GEMINI: Guide = {
  id: 'gemini',
  title: 'Get a Gemini API key',
  steps: [
    {
      heading: 'Step 1: Go to Google AI Studio.',
      text: ['Sign in with your Google account.'],
      links: [{ label: 'Click on this link', href: 'https://aistudio.google.com/' }],
    },
    {
      heading: 'Step 2: Open the API keys page.',
      text: ['Click "Get API key" in the left sidebar.'],
    },
    {
      heading: 'Step 3: Create a new API key.',
      text: [
        'Click "Create API key" and pick a Google Cloud project, or let AI Studio create one.',
      ],
    },
    {
      heading: 'Step 4: Copy the key.',
      text: [
        'Click the Copy button next to the key and paste it in the Gemini API key form above.',
      ],
    },
  ],
};

const OLLAMA: Guide = {
  id: 'ollama',
  title: 'Find your Ollama address',
  steps: [
    {
      heading: 'Step 1: Install and start Ollama.',
      text: ['Ollama runs the AI model on your own computer, so it costs nothing per message.'],
      links: [{ label: 'Click on this link', href: 'https://ollama.com/download' }],
    },
    {
      heading: 'Step 2: Download a model.',
      text: [
        'Open a terminal and run `ollama pull llama3.2` (any model from the Ollama library works).',
      ],
    },
    {
      heading: 'Step 3: Enter the address.',
      text: [
        "Ollama listens on http://localhost:11434 by default. Paste that address in the Ollama address form above. If Ollama runs on another computer, use that computer's address instead.",
        'Inside Docker, "localhost" is the container itself: use http://host.docker.internal:11434 to reach Ollama on the host.',
      ],
    },
  ],
};

const REPLICATE: Guide = {
  id: 'replicate',
  title: 'Get a Replicate token',
  steps: [
    {
      heading: 'Step 1: Sign up for Replicate.com',
      text: ["You'll need to sign up using GitHub."],
      links: [
        {
          label: 'Click here to sign up for Replicate.com account',
          href: 'https://replicate.com/account/api-tokens',
        },
      ],
    },
    {
      heading: 'Step 2: Go to the API tokens page.',
      text: ['Then, copy the tokens and paste it in the Replicate Token form above.'],
      links: [
        {
          label: 'Click here to go to the API tokens page',
          href: 'https://replicate.com/account/api-tokens',
        },
      ],
      images: [
        {
          file: 'replicate.png',
          alt: 'Copy the token and paste it in the Replicate Token form above',
          caption: 'Copy the token and paste it in the Replicate Token form above',
        },
      ],
    },
  ],
};

const COMFYUI: Guide = {
  id: 'comfyui',
  title: 'Find your ComfyUI address',
  steps: [
    {
      heading: 'Step 1: Start your image server.',
      text: [
        'ComfyUI or the Stable Diffusion WebUI must be running and reachable from the computer that runs the bot.',
      ],
    },
    {
      heading: 'Step 2: Copy the address.',
      text: [
        'It is the address you open in your browser, such as http://127.0.0.1:7860 (WebUI) or http://127.0.0.1:8188 (ComfyUI). Paste it in the ComfyUI address form above, without a path.',
      ],
    },
  ],
};

const TWITCH: Guide = {
  id: 'twitch',
  title: 'Get a Twitch Client ID and Client Secret',
  steps: [
    {
      heading: 'Step 1: Create a Twitch Developer Account',
      text: ['Visit the Twitch Developer Portal and click on the "Login with Twitch" button.'],
      links: [{ label: 'Twitch Developer Portal', href: 'https://dev.twitch.tv/' }],
      images: [
        {
          file: 'twitch-step1.png',
          alt: 'Click Login with Twitch',
          caption: 'Click Login with Twitch',
        },
      ],
    },
    {
      heading: 'Step 2: Create a New Application',
      text: [
        'After signing in, click on "Your Console" located next to your avatar.',
        'On the Developer Console page, click on "Applications" in the left sidebar and then click on the "Register Your Application" button.',
      ],
      images: [
        {
          file: 'twitch-step2_1.png',
          alt: 'Click Your Console',
          caption: 'Click Your Console',
        },
        {
          file: 'twitch-step2_2.png',
          alt: 'Click Applications and Register Your Application button',
          caption: 'Click Applications and Register Your Application button',
        },
      ],
    },
    {
      heading: 'Step 3: Fill in Application Details',
      text: [
        'Enter the necessary details for your application, such as the name, OAuth redirect URLs (use http://localhost), and category (select Application Integration). Then click on "Create."',
      ],
      images: [
        {
          file: 'twitch-step3.png',
          alt: 'Enter the details of the applications',
          caption: 'Enter the details of the applications',
        },
      ],
    },
    {
      heading: 'Step 4: Obtain Client ID and Client Secret',
      text: [
        "Once your application is created, you'll be redirected to the application's settings page. Here, you'll find your Twitch Client ID. Click on the \"New Secret\" button to generate a Client Secret.",
      ],
      images: [
        {
          file: 'twitch-step4.png',
          alt: 'Step 4 Screenshot',
          caption: 'Step 4 Screenshot',
        },
      ],
    },
    {
      heading: "Step 5: You've Got Both the Client ID and Client Secret now!",
      text: ['Copy and paste the Twitch Client ID and Client Secret on the form above.'],
      links: [
        {
          label: 'For more information, visit the Twitch Authentication Documentation.',
          href: 'https://dev.twitch.tv/docs/authentication',
        },
      ],
    },
  ],
};

const YOUTUBE: Guide = {
  id: 'youtube',
  title: 'Get a YouTube Data API key',
  steps: [
    {
      heading: 'Step 1: Go to the Google Cloud Console.',
      text: [
        'Sign in with your Google account and create a project, or pick one you already have.',
      ],
      links: [{ label: 'Click on this link', href: 'https://console.cloud.google.com/' }],
    },
    {
      heading: 'Step 2: Turn on the YouTube Data API v3.',
      text: [
        'Open "APIs & Services", click "Library", search for "YouTube Data API v3", open it and click the Enable button.',
      ],
    },
    {
      heading: 'Step 3: Create an API key.',
      text: [
        'Open "APIs & Services", click "Credentials", then click "Create credentials" and "API key".',
      ],
    },
    {
      heading: 'Step 4: Copy the key.',
      text: ['Copy the key and paste it in the YouTube Data API key form above.'],
    },
  ],
};

const SPOTIFY: Guide = {
  id: 'spotify',
  title: 'Create a Spotify client',
  steps: [
    {
      heading: 'Step 1: Go to the Spotify Developer Dashboard.',
      text: ['Log in with your Spotify account.'],
      links: [{ label: 'Click on this link', href: 'https://developer.spotify.com/dashboard' }],
    },
    {
      heading: 'Step 2: Create an app.',
      text: ['Click "Create app", enter any name and description, tick "Web API", and click Save.'],
    },
    {
      heading: 'Step 3: Open the app settings.',
      text: ['Click your new app, then click "Settings".'],
    },
    {
      heading: 'Step 4: Copy the Client ID and the Client Secret.',
      text: [
        'Copy the Client ID, click "View client secret", and copy the Client secret. Paste both in the forms above.',
      ],
    },
  ],
};

const POSTGRES: Guide = {
  id: 'postgres',
  title: 'Get a PostgreSQL connection string',
  steps: [
    {
      heading: 'Step 1: Get a PostgreSQL database.',
      text: [
        'Install PostgreSQL on your own computer, or use a hosted PostgreSQL service. Create an empty database and a user that owns it. SQLite needs none of this: leave the database on SQLite if you only run one bot on one computer.',
      ],
      links: [{ label: 'PostgreSQL downloads', href: 'https://www.postgresql.org/download/' }],
    },
    {
      heading: 'Step 2: Note the five parts of the address.',
      text: [
        'You need the user name, the password, the host, the port (5432 by default) and the database name.',
      ],
    },
    {
      heading: 'Step 3: Build the connection string.',
      text: [
        'Put the five parts together and paste the result into the PostgreSQL connection string form above. If the password contains characters such as @ or /, write them percent-encoded (@ becomes %40).',
      ],
      callout: {
        kind: 'info',
        text: 'If your user is ririko, your password is 1234567, the database runs on this computer and is named ririko, then your connection string will be like this:',
        code: 'postgresql://ririko:1234567@localhost:5432/ririko',
      },
    },
  ],
};

const LAVALINK: Guide = {
  id: 'lavalink',
  title: 'Find the address and password of your Lavalink server',
  steps: [
    {
      heading: 'Step 1: Run a Lavalink 4 server.',
      text: [
        'Lavalink is the music server. Use one that is already running on another computer, or start one there (docs/deployment.md, section 8.1, shows a Docker setup). The bot needs Lavalink 4.',
      ],
      links: [{ label: 'Lavalink on GitHub', href: 'https://github.com/lavalink-devs/Lavalink' }],
    },
    {
      heading: 'Step 2: Note its address and port.',
      text: [
        'The address is the name or the IP address of that computer, for example 192.0.2.10. Lavalink listens on port 2333 unless its application.yml says otherwise (the "port" under "server"). Paste both in the forms above.',
        'The computer that runs the bot must be able to reach that address and port. A firewall on either side can block it.',
      ],
    },
    {
      heading: 'Step 3: Copy the password.',
      text: [
        'The password is in the application.yml of the Lavalink server, under "lavalink", "server", "password". Paste it in the Lavalink password form above. It must be exactly the same, or Lavalink refuses the bot.',
      ],
    },
    {
      heading: 'Step 4: Pick the connection type.',
      text: [
        'Choose "Plain" for a server reached directly. Choose "Secure" only when the server is behind a reverse proxy that serves HTTPS (https and wss). If you are not sure, keep "Plain".',
      ],
    },
  ],
};

const DASHBOARD_OAUTH: Guide = {
  id: 'dashboard-oauth',
  title: 'Get the OAuth2 client secret and add the redirect',
  steps: [
    {
      heading: 'Step 1: Go to Discord Developer Portal page.',
      text: ['Open the same application you used in Step 1.'],
      links: [
        { label: 'Click on this link', href: 'https://discord.com/developers/applications/' },
      ],
    },
    {
      heading: 'Step 2: Open the OAuth2 page.',
      text: ['Click on the OAuth2 tab on the left side.'],
    },
    {
      heading: 'Step 3: Copy the Client Secret.',
      text: [
        'Click "Reset Secret" and confirm. Copy the secret and paste it on the OAuth2 client secret form above. Discord shows it only once.',
      ],
    },
    {
      heading: 'Step 4: Add the redirect.',
      text: [
        `Under Redirects click "Add Redirect", enter ${DASHBOARD_URL_PLACEHOLDER}/api/auth/callback (with your own dashboard address in place of ${DASHBOARD_URL_PLACEHOLDER}), and click Save Changes.`,
      ],
      callout: {
        kind: 'info',
        text: 'If your dashboard address is http://localhost:3000, the redirect is:',
        code: 'http://localhost:3000/api/auth/callback',
      },
    },
  ],
};

/** Every guide, in the order the wizard first shows them. */
export const GUIDES: readonly Guide[] = [
  DISCORD,
  OWNER_ID,
  OPENAI,
  GEMINI,
  OLLAMA,
  REPLICATE,
  COMFYUI,
  TWITCH,
  YOUTUBE,
  SPOTIFY,
  POSTGRES,
  LAVALINK,
  DASHBOARD_OAUTH,
];

const GUIDES_BY_ID: ReadonlyMap<GuideId, Guide> = new Map(GUIDES.map((guide) => [guide.id, guide]));

/** The guide with this id. */
export function getGuide(id: GuideId): Guide {
  const guide = GUIDES_BY_ID.get(id);
  if (!guide) throw new Error(`Unknown guide: ${id}`);
  return guide;
}

/** Every image file a guide names, in guide and step order. */
export function guideImageFiles(): string[] {
  return GUIDES.flatMap((guide) =>
    guide.steps.flatMap((step) => (step.images ?? []).map((image) => image.file)),
  );
}

/**
 * The dashboard redirect for an address: `<address>/api/auth/callback`, with a trailing slash on
 * the address removed.
 */
export function dashboardRedirectUri(dashboardUrl: string): string {
  return `${dashboardUrl.replace(/\/+$/, '')}/api/auth/callback`;
}
