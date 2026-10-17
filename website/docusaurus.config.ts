import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const REPO = 'https://github.com/RirikoAI/RirikoBot';
const SUPPORT_SERVER = 'https://discord.gg/UNMZx4qx8G';
// Docs edit links point at the integration branch until 2.0.0 lands on master (STORY-191).
const EDIT_BRANCH = 'develop/2.0.0';

const config: Config = {
  title: 'Ririko AI',
  tagline: 'The Discord bot with music, AI chat, a card game and a dashboard',
  favicon: 'img/favicon.svg',

  url: 'https://ririko.ai',
  baseUrl: '/',
  organizationName: 'RirikoAI',
  projectName: 'RirikoBot',

  // A broken link fails the build, and so fails CI.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',

  markdown: {
    // `.md` files parse as CommonMark, so the docs need no MDX escaping of `<` and `{`.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // The single source of truth is the repository's docs/ folder; nothing is copied.
          path: '../docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          exclude: ['kanban/**', 'archive/**', 'hosting.md', 'dockerhub/**'],
          editUrl: `${REPO}/edit/${EDIT_BRANCH}/docs/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      // Offline search built at build time; no third-party service.
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsDir: '../docs',
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Ririko AI',
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/commands', label: 'Commands', position: 'left' },
        { href: SUPPORT_SERVER, label: 'Support server', position: 'right' },
        { href: REPO, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Ririko',
          items: [
            { label: 'Documentation', to: '/docs/' },
            { label: 'Commands', to: '/commands' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'Support server', href: SUPPORT_SERVER },
            { label: 'GitHub', href: REPO },
          ],
        },
        {
          title: 'Legal',
          items: [
            { label: 'Terms', to: '/docs/legal/terms' },
            { label: 'Privacy', to: '/docs/legal/privacy' },
          ],
        },
      ],
      copyright: 'Ririko AI is open source under the MIT license.',
    },
    colorMode: { respectPrefersColorScheme: true },
  } satisfies Preset.ThemeConfig,
};

export default config;
