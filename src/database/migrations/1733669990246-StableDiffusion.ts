import { MigrationInterface, QueryRunner } from "typeorm";

export class StableDiffusion1733669990246 implements MigrationInterface {
    name = 'StableDiffusion1733669990246'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "stream_notification"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_notification" RENAME TO "stream_notification"`);
        await queryRunner.query(`CREATE TABLE "temporary_configuration" ("applicationId" varchar PRIMARY KEY NOT NULL, "twitchClientId" varchar, "twitchClientSecret" varchar, "stableDiffusionType" varchar, "stableDiffusionApiToken" varchar)`);
        await queryRunner.query(`INSERT INTO "temporary_configuration"("applicationId", "twitchClientId", "twitchClientSecret") SELECT "applicationId", "twitchClientId", "twitchClientSecret" FROM "configuration"`);
        await queryRunner.query(`DROP TABLE "configuration"`);
        await queryRunner.query(`ALTER TABLE "temporary_configuration" RENAME TO "configuration"`);
        await queryRunner.query(`CREATE TABLE "temporary_stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "stream_notification"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_notification" RENAME TO "stream_notification"`);
        await queryRunner.query(`CREATE TABLE "temporary_stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar NOT NULL)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "stream_notification"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_notification" RENAME TO "stream_notification"`);
        await queryRunner.query(`CREATE TABLE "temporary_stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar NOT NULL, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "stream_notification"`);
        await queryRunner.query(`DROP TABLE "stream_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_stream_notification" RENAME TO "stream_notification"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stream_notification" RENAME TO "temporary_stream_notification"`);
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar NOT NULL)`);
        await queryRunner.query(`INSERT INTO "stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_notification"`);
        await queryRunner.query(`ALTER TABLE "stream_notification" RENAME TO "temporary_stream_notification"`);
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar)`);
        await queryRunner.query(`INSERT INTO "stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_notification"`);
        await queryRunner.query(`ALTER TABLE "stream_notification" RENAME TO "temporary_stream_notification"`);
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_notification"`);
        await queryRunner.query(`ALTER TABLE "configuration" RENAME TO "temporary_configuration"`);
        await queryRunner.query(`CREATE TABLE "configuration" ("applicationId" varchar PRIMARY KEY NOT NULL, "twitchClientId" varchar, "twitchClientSecret" varchar)`);
        await queryRunner.query(`INSERT INTO "configuration"("applicationId", "twitchClientId", "twitchClientSecret") SELECT "applicationId", "twitchClientId", "twitchClientSecret" FROM "temporary_configuration"`);
        await queryRunner.query(`DROP TABLE "temporary_configuration"`);
        await queryRunner.query(`ALTER TABLE "stream_notification" RENAME TO "temporary_stream_notification"`);
        await queryRunner.query(`CREATE TABLE "stream_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "twitchUserId" varchar NOT NULL, "channelId" varchar NOT NULL, "streamId" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, CONSTRAINT "FK_72d0bec59898ddbaca2f30b26be" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "stream_notification"("id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId") SELECT "id", "twitchUserId", "channelId", "streamId", "notified", "createdAt", "updatedAt", "guildId" FROM "temporary_stream_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_stream_notification"`);
    }

}
