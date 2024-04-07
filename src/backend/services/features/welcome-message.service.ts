const {Guild, setSettings} = require("app/Schemas/Guild");

export async function getWelcomeMessage(guildID: string) {
  const guild = await Guild.findOne({
    _id: guildID
  });
  
  if (!guild.welcome.enabled) return false;
  return {
    message: guild.welcome.message,
    channel: guild.welcome.channel,
  };
}

export async function setWelcomeMessage(guildID: string, req: any) {
  const query = {
    id: guildID
  };
  
  if (req.body.message)
  await setSettings(query, 'welcome', 'message', req.body.message);
  
  if (req.body.channel)
  await setSettings(query, 'welcome', 'channel', req.body.channel);
  
  const guild = await setSettings(query, 'welcome', 'enabled', true);
  
  return guild.welcome;
}