/** The lines printed before the bot exits because DISCORD_TOKEN is not set. */
export function describeMissingToken(): string[] {
  return [
    '✖ Error: DISCORD_TOKEN is not configured in environment or .env file.',
    '  The step-by-step setup in your browser fills in every setting for you:',
    '  • From the source folder:  pnpm installer',
    '  • With Docker only (no Node.js): the "ririko setup --docker" one-liner in docs/deployment.md',
    '  To check an existing file instead, run: pnpm ririko doctor',
  ];
}
