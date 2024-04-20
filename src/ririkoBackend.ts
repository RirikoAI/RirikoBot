import "@ririkoai/colors.ts";
import { loggerMiddleware } from "./backend/middlewares/logger.middleware";
import { DiscordBot } from "./backend/services/bot.service";
import { Client } from "discord.js";

const {overrideLoggers} = require("helpers/logger");
const {hostname, backendPort} = require("./helpers/getconfig");
const express = require('express');
require("handlers/mongoose")(false, "Ririko BE", true);
const apiRoutes = require('./backend/routes/api.routes');
const authRoutes = require('./backend/routes/auth.routes');
const guildRoutes = require('./backend/routes/guild.routes');
const cookieParser = require('cookie-parser');
const cors = require('cors')
import 'dotenv/config';

// Override the default loggers
overrideLoggers();

// CORS options
const corsOptions = {
  origin: `${process.env.PUBLIC_URL}:${process.env.PORT}`,
  maxAge: 40,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'HEAD', 'POST', 'DELETE', 'PATCH'],
  optionsSuccessStatus: 200
}

const app = express()

// Middleware to add the Discord bot to the request object
app.use((req, res, next) => {
  req.bot = DiscordBot as Client;
  return next();
});
// Middleware to parse JSON requests
app.use(express.json());
// Middleware to parse cookies
app.use(cookieParser());
// Middleware to enable CORS
app.use(cors(corsOptions));
// Middleware to log requests
app.use(loggerMiddleware);

console.info('[Ririko BE] Starting Ririko Backend')

// Routes
app.use('/', [guildRoutes, authRoutes]);
app.use('/api', apiRoutes);

app.listen(backendPort(), function () {
  console.info(`[Ririko BE] Ririko BE is now listening on port ${ backendPort() }`)
})

// Handle uncaught exceptions and rejections
process
  .on("unhandledRejection", (reason, p) => {
    console.error(reason, "Unhandled Rejection at Promise", p);
  })
  .on("uncaughtException", (err) => {
    console.error(err, "Uncaught Exception thrown");
    console.oLog(err);
  });