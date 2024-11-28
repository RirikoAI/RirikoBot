import { User } from 'discord.js';
import { Image, loadImage } from 'canvas';

export const BadgesUtil = {
  getBadges: getBadges,
};

async function getBadges(user: User): Promise<Image[]> {
  const flags = user.flags.toArray();

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
  return badges;
}
