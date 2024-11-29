import { Image, loadImage } from 'canvas';
import { DiscordGuildMember } from '#command/command.types';

export const BadgesUtil = {
  getBadges: getBadges,
};

async function getBadges(guildMember: DiscordGuildMember): Promise<Image[]> {
  const flags = guildMember.user.flags.toArray();
  const badges: Image[] = [];
  for (const flag of flags) {
    // only get alphanumeric characters + numbers of flag and put it to safeFlag variable
    const safeFlag = flag.replace(/[^a-zA-Z0-9]/g, '');
    try {
      // load badge images svg from the path /assets/badges
      const badge: Image = await loadImage(`./assets/badges/${safeFlag}.svg`);
      badges.push(badge);
    } catch (e) {
      console.error(
        `Error loading badge ${flag} on path ./assets/badges/${safeFlag}.svg`,
      );
    }
  }

  if (guildMember.premiumSince) {
    try {
      // load badge images svg from the path /assets/badges
      const badge: Image = await loadImage(`./assets/badges/nitro.svg`);
      badges.push(badge);
    } catch (e) {
      console.error(
        `Error loading badge boost on path ./assets/badges/nitro.svg`,
      );
    }
  }

  return badges;
}
