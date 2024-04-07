const express = require('express');
const router = express.Router();

import { discordBotID } from "helpers/getconfig";
import { exchangeToken, refreshToken } from "../services/discord.service";
import { setCookie } from "../services/auth.service";
import { auth, TokenCookie } from "../middlewares/auth.middleware";

router.get('/login', (req, res) => {
  const url =
    'https://discord.com/api/oauth2/authorize?' +
    new URLSearchParams({
      client_id: discordBotID(),
      redirect_uri: "http://localhost:4000/callback",
      response_type: 'code',
      scope: 'identify guilds',
    });
  
  res.redirect(302, url);
});

router.get('/callback', async (req, res) => {
  try {
    if (req.query.code == null) {
      throw new Error('Missing query param');
    }
    
    const token = await exchangeToken(req.query.code);
    
    setCookie(res, token);
    res.redirect(`http://localhost:3000/callback`);
  } catch (e) {
    res.send(e.message);
  }
});

router.get('/auth', async (req, res) => {
  try {
    const user = auth(req);
    const refreshed = await refreshToken(user.refresh_token);
    
    setCookie(res, refreshed);
    res.json(refreshed.access_token);
  } catch (e) {
    res.status(401).json({"statusCode": 401, "message": e.message});
  }
});

router.post('/auth/signout', async (req, res) => {
  try {
    const user = auth(req);
    
    res.clearCookie(TokenCookie);
    await req.bot.revokeToken(user.access_token);
    res.sendStatus(200);
  } catch (e) {
    res.json({"statusCode": 401, "message": e.message});
  }
});

module.exports = router;