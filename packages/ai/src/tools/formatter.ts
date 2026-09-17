import type { MediatedToolResponse } from '../security/types.js';

/**
 * Formats mediated tool execution results into clean, human-friendly markdown strings.
 * Used as a fallback when LLM synthesis is unavailable or fails, ensuring users never see raw JSON.
 */
export function formatToolResultFallback(toolResponses: MediatedToolResponse[]): string {
  const lines: string[] = [];

  for (const tr of toolResponses) {
    if (!tr.success) {
      lines.push(`⚠️ *[${tr.name} Blocked]*: ${tr.error}`);
      continue;
    }

    const res = tr.result as Record<string, unknown> | undefined;
    if (!res || typeof res !== 'object') {
      lines.push(`🔧 *[${tr.name}]*: ${String(tr.result)}`);
      continue;
    }

    const normName = tr.name.toLowerCase().replace(/_/g, '.');

    if (normName.includes('time')) {
      const formatted = typeof res.formatted === 'string' ? res.formatted : String(res.iso ?? '');
      lines.push(`🕒 **Current Time**: ${formatted}`);
    } else if (normName.includes('coinflip')) {
      const msg = typeof res.message === 'string' ? res.message : `The coin landed on ${res.result}!`;
      lines.push(`🪙 **Coin Flip**: ${msg}`);
    } else if (normName.includes('anime')) {
      const title = String(res.title ?? 'Anime Search');
      const score = res.score ? ` (⭐ Score: ${res.score}/10)` : '';
      const episodes = res.episodes ? ` [${res.episodes} eps]` : '';
      let synopsis = typeof res.synopsis === 'string' ? res.synopsis.replace(/<[^>]*>/g, '').trim() : '';
      if (synopsis.length > 300) {
        synopsis = `${synopsis.slice(0, 297)}...`;
      }
      const url = typeof res.url === 'string' ? `\n🔗 <${res.url}>` : '';
      lines.push(`🎬 **${title}**${score}${episodes}\n${synopsis}${url}`);
    } else if (normName.includes('balance') || normName.includes('economy')) {
      const wallet = typeof res.wallet === 'number' ? res.wallet.toLocaleString() : '0';
      const bank = typeof res.bank === 'number' ? res.bank.toLocaleString() : '0';
      lines.push(`💰 **Balance**: **${wallet}** in wallet | **${bank}** in bank`);
    } else if (normName.includes('reminder')) {
      const msg = typeof res.message === 'string' ? res.message : 'Reminder';
      const rel = typeof res.relativeDescription === 'string' ? ` (${res.relativeDescription})` : '';
      lines.push(`⏰ **Reminder Set**: "${msg}"${rel}`);
    } else if (normName.includes('music')) {
      if (res.action === 'error') {
        lines.push(`⚠️ **Music**: ${res.message || 'Unable to play music.'}`);
      } else {
        const msg = typeof res.message === 'string' ? res.message : `Queued "${res.query}"`;
        const link = typeof res.trackUrl === 'string' ? `\n🔗 <${res.trackUrl}>` : '';
        lines.push(`🎵 **Music**: ${msg}${link}`);
      }
    } else if (typeof res.message === 'string') {
      lines.push(`🔧 **${tr.name}**: ${res.message}`);
    } else {
      lines.push(`🔧 **${tr.name}**: ${JSON.stringify(res)}`);
    }
  }

  return lines.join('\n\n');
}
