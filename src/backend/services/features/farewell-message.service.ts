const {Guild, setSettings} = require("app/Schemas/Guild");

export async function getLeaveMessage(guildID: string) {
  const guild = await Guild.findOne({
    _id: guildID
  });
  
  if (!guild.farewell.enabled) return false;
  return {
    message: guild.farewell.message,
    channel: guild.farewell.channel,
  };
}

export async function setLeaveMessage(guildID: string, req: any) {
  const query = {
    id: guildID
  };
  
  if (req.body.message)
  await setSettings(query, 'farewell', 'message', req.body.message);
  
  if (req.body.channel)
  await setSettings(query, 'farewell', 'channel', req.body.channel);
  
  const guild = await setSettings(query, 'farewell', 'enabled', true);
  
  return guild.farewell;
}