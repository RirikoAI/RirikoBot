import { checkPermissions } from "../services/guild.service";
import { auth } from "../middlewares/auth.middleware";
import { getWelcomeMessage, setWelcomeMessage } from "../services/features/welcome-message.service";
import { getLeaveMessage, setLeaveMessage } from "../services/features/farewell-message.service";
import { getMusicInfo } from "../services/features/music-player.service";

const {Guild, setSettings} = require("app/Schemas/Guild");

const express = require('express');
const router = express.Router();

router.get('/guilds/:guild', async (req, res) => {
  try {
    const guildID = req.params.guild;
    const data = req.bot.guilds.cache.get(guildID);
    if (data == null) {
      return res.send('null')
    }
    
    const guild = await Guild.findOne({
      _id: guildID
    });
    
    const enabledFeatures = [];
    
    if (guild?.welcome?.enabled) enabledFeatures.push('welcome');
    if (guild?.farewell?.enabled) enabledFeatures.push('farewell');
    if (guild?.musicplayer?.enabled) enabledFeatures.push('musicplayer');
    if (guild?.autovoicechannel?.enabled) enabledFeatures.push('autovoicechannel');
    if (guild?.autorole?.enabled) enabledFeatures.push('autorole');
    if (guild?.aichatbot?.enabled) enabledFeatures.push('aichatbot');
    if (guild?.reactionroles?.enabled) enabledFeatures.push('reactionroles');
    
    return res.json({
      id: data.id,
      name: data.name,
      icon: data.icon,
      enabledFeatures, //
    });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

router.post('/guilds/:guild/features/:feature', async (req, res) => {
  try {
    const guildID = req.params.guild;
    const feature = req.params.feature;
    const data = req.bot.guilds.cache.get(guildID);
    if (data == null) {
      return res.status(500).send('Guild not found or bot not in guild.')
    }
    await setSettings({id: guildID}, feature, 'enabled', true);
    return res.send('Success');
  } catch (e) {
    console.error(e)
    res.status(500).json(e.message);
  }
});

router.delete('/guilds/:guild/features/:feature', async (req, res) => {
  try {
    const guildID = req.params.guild;
    const feature = req.params.feature;
    const data = req.bot.guilds.cache.get(guildID);
    if (data == null) {
      return res.status(500).send('Guild not found or bot not in guild.')
    }
    await setSettings({id: guildID}, feature, 'enabled', false);
    return res.send('Success');
  } catch (e) {
    console.error(e)
    res.status(500).json(e.message);
  }
});


router.get('/guilds/:guild/features/:feature', async (req, res) => {
  const guild = req.params.guild;
  const feature = req.params.feature;
  let response;
  try {
    switch (feature) {
      case 'welcome':
        response = await getWelcomeMessage(guild);
        break;
      case 'farewell':
        response = await getLeaveMessage(guild);
        break;
      case 'musicplayer':
        response = await getMusicInfo(guild);
        break;
      case 'autovoicechannel':
        response = {}
        break;
      default:
        return res.status(404).send('Feature not found');
    }
    return (response ? res.status(200).json(response) : res.status(404).send('Feature not enabled'));
  } catch (e) {
    console.error(`Error while getting feature ${ feature }:`, e.message)
    console.log(e)
    return res.status(500).json(e.message);
  }
});

router.get('/guilds/:guild/channels', async (req, res) => {
  const guild = req.params.guild;
  try {
    const channels = await req.bot.guilds.cache.get(guild)?.channels.fetch();
    if (channels == null) return null;
    
    return res.send([...channels.values()]);
  } catch (e) {
    console.error(`Error while getting channels for ${ guild }:`, e.message)
    console.log(e)
    return res.status(500).json(e.message);
  }
});

router.patch('/guilds/:guild/features/:feature', async (req, res) => {
  const guild = req.params.guild;
  const feature = req.params.feature;
  try {
    switch (feature) {
      case 'welcome':
        return res.status(200).json(await setWelcomeMessage(guild, req));
      case 'farewell':
        return res.status(200).json(await setLeaveMessage(guild, req));
      default:
        return res.status(404).send('Feature not found');
    }
  } catch (e) {
    console.error(`Error while getting feature ${ feature }:`, e.message)
    console.log(e)
    return res.status(500).json(e.message);
  }
});

router.get('/guilds/:guild/roles', async (req, res) => {
  const guild = req.params.guild;
  try {
    const roles = await req.bot.guilds.cache.get(guild)?.roles.fetch();
    if (roles == null) return null;
    
    return res.status(200).json([...roles.values()]);
  } catch (e) {
    console.error(`Error while getting roles for ${ guild }:`, e.message)
    console.log(e)
    return res.status(500).json(e.message);
  }
});

module.exports = router;