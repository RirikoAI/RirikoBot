import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// Grouped by reader. Every user doc under docs/ appears exactly once.
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Get Started',
      collapsed: false,
      items: ['index', 'deployment', 'after-installing'],
    },
    {
      type: 'category',
      label: 'Self-Host',
      items: ['adapters', 'dashboard', 'migrations', 'upgrading-from-1.4'],
    },
    {
      type: 'category',
      label: 'Use Ririko',
      items: [
        'commands',
        'modules',
        'music',
        'ai',
        'moderation',
        'economy',
        'waifu-tcg',
        'tcg-player-guide',
        'adventure-game',
        'adventure-catalog',
        'adventure-completion-rewards',
        'legal/terms',
        'legal/privacy',
        'legal/ms/terms',
        'legal/ms/privacy',
      ],
    },
    {
      type: 'category',
      label: 'Contribute',
      items: ['contributing', 'development', 'architecture', 'database', 'testing'],
    },
    {
      type: 'category',
      label: 'Operate',
      items: ['release'],
    },
  ],
};

export default sidebars;
