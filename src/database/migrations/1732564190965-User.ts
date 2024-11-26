import { MigrationInterface, QueryRunner } from "typeorm";

export class User1732564190965 implements MigrationInterface {
    name = 'User1732564190965'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "user"`);
    }

}
