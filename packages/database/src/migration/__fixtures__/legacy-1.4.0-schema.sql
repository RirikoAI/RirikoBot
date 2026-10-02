-- Schema of a Ririko 1.4.0 SQLite database (TASK-1261).
-- Produced on 2026-10-01 by running the published image ririkoai/ririkobot:latest
-- (sha256:c11e8defda3beb390a8ef673b92f82bb958952abfe214d49436388ab6bc9c012, package version 1.4.1)
-- once with DATABASE_TYPE=better-sqlite3: its start command ran the 12 TypeORM migrations below.
-- Schema only: the seed step inserted no rows. Do not edit; regenerate from the image instead.
--
-- migration 1731423065562 InitialDB1731423065562
-- migration 1731702068693 MusicChannel1731702068693
-- migration 1731828022359 MusicTracks1731828022359
-- migration 1732564190965 User1732564190965
-- migration 1732837987621 EconomyUpdate1732837987621
-- migration 1732921945292 GuildConfig1732921945292
-- migration 1733570785744 ConfigAndTwitch1733570785744
-- migration 1733669990246 StableDiffusion1733669990246
-- migration 1734379313298 UserNote1734379313298
-- migration 1749306901025 Migrations1749306901025
-- migration 1749328951108 Migrations1749328951108
-- migration 1753428868386 Migrations1753428868386

CREATE TABLE "configuration" ("applicationId" varchar PRIMARY KEY NOT NULL, "twitchClientId" varchar, "twitchClientSecret" varchar, "stableDiffusionType" varchar, "stableDiffusionApiToken" varchar);

CREATE TABLE "free_game_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "gameId" varchar NOT NULL, "gameName" varchar NOT NULL, "source" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "guildId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_d8c1952edfddb4c55bd310d98b2" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "guild" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "prefix" varchar NOT NULL DEFAULT ('!'));

CREATE TABLE "guild_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "value" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_d702256aa71bc54b91f0deb040c" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "price" integer NOT NULL, "description" varchar NOT NULL, "rarity" integer NOT NULL, "hidden" boolean NOT NULL DEFAULT (0), "purchaseLimit" integer NOT NULL DEFAULT (0), "purchasable" boolean NOT NULL DEFAULT (0), "sellable" boolean NOT NULL DEFAULT (0), "findable" boolean NOT NULL DEFAULT (0), "imageUrl" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "categoryId" integer, CONSTRAINT "FK_c0c8f47a702c974a77812169bc2" FOREIGN KEY ("categoryId") REFERENCES "item_category" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "item_category" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL);

CREATE TABLE "migrations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL, "name" varchar NOT NULL);

CREATE TABLE "music_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_6148e98fda68aa504c141a05600" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "playlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "userId" varchar NOT NULL, "author" varchar NOT NULL, "authorTag" varchar NOT NULL, "public" boolean NOT NULL, "plays" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')));

CREATE TABLE "reaction_role" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "messageId" varchar NOT NULL, "emoji" varchar NOT NULL, "roleId" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_3959343ea6e44ecef758a345642" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "reminder" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "channelId" varchar NOT NULL, "guildId" varchar NOT NULL, "message" varchar NOT NULL, "scheduledTime" datetime NOT NULL, "sent" boolean NOT NULL DEFAULT (0), "timezone" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')));

CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar NOT NULL, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "stream_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_05ef6cd02914c41a7431574cf50" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "track" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "playlistId" integer, CONSTRAINT "FK_cd57e08e2edf7fd0078a493ffe5" FOREIGN KEY ("playlistId") REFERENCES "playlist" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "twitch_streamer" ("twitchUserId" varchar PRIMARY KEY NOT NULL, "isLive" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')));

CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar);

CREATE TABLE "user_note" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "note" varchar NOT NULL, "createdBy" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, "userId" varchar, CONSTRAINT "FK_51c1d8f260411e99453caa02299" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_236dbd155cee61376a015913576" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE "voice_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "parentId" varchar, "guildId" varchar, CONSTRAINT "FK_e64c66cfcac55ab6f4bc1102d82" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION);
