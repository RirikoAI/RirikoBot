import { MigrationInterface, QueryRunner } from "typeorm";

export class ConfigAndTwitch1733570785744 implements MigrationInterface {
    name = 'ConfigAndTwitch1733570785744'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`CREATE TABLE "stream_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`CREATE TABLE "twitch_streamer" ("twitchUserId" varchar PRIMARY KEY NOT NULL, "isLive" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "configuration" ("applicationId" varchar PRIMARY KEY NOT NULL, "twitchClientId" varchar, "twitchClientSecret" varchar)`);
        await queryRunner.query(`CREATE TABLE "temporary_stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "stream_notification"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_notification" RENAME TO "stream_notification"`);
        await queryRunner.query(`CREATE TABLE "temporary_stream_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_05ef6cd02914c41a7431574cf50" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_subscription"("id", "twitchUserId", "channelId", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "createdAt", "updatedAt", "guildId" FROM "stream_subscription"`);
        await queryRunner.query(`DROP TABLE "stream_subscription"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_subscription" RENAME TO "stream_subscription"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stream_subscription" RENAME TO "temporary_stream_subscription"`);
        await queryRunner.query(`CREATE TABLE "stream_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`INSERT INTO "stream_subscription"("id", "twitchUserId", "channelId", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_subscription"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_subscription"`);
        await queryRunner.query(`ALTER TABLE "stream_notification" RENAME TO "temporary_stream_notification"`);
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`INSERT INTO "stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "configuration"`);
        await queryRunner.query(`DROP TABLE "twitch_streamer"`);
        await queryRunner.query(`DROP TABLE "stream_subscription"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
    }

}
