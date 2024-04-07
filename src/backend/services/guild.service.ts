import { DiscordBot } from "./bot.service";
import { getUserID } from "./discord.service";

export async function getEnabledFeatures(guild: string): Promise<any> {
  const features=  [];
  const welcomeMessage = await this.prisma.welcomeMessage.count({
    where: {
      id: guild,
    },
  });
  
  if (welcomeMessage !== 0) {
    features.push('welcome-message');
  }
  
  return features;
}

export async function checkPermissions(user: any, guildID: string) {
  const guild = DiscordBot.guilds.cache.get(guildID);
  if (guild == null)
    throw new Error('Guild Not found');
  
  // @ts-ignore
  const userID = await getUserID(user.access_token);
  const member = await guild?.members.fetch(userID);
  
  if (
    !member?.permissions.has('Administrator') &&
    guild.ownerId !== member.id
  ) {
    throw new Error('Missing permissions');
  }
}