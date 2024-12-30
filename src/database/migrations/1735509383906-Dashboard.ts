import { MigrationInterface, QueryRunner } from "typeorm";

export class Dashboard1735509383906 implements MigrationInterface {
    name = 'Dashboard1735509383906'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "role" ("id" integer PRIMARY KEY NOT NULL, "name" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "status" ("id" integer PRIMARY KEY NOT NULL, "name" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "session" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar)`);
        await queryRunner.query(`CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `);
        await queryRunner.query(`CREATE TABLE "forgot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hash" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar)`);
        await queryRunner.query(`CREATE INDEX "IDX_df507d27b0fb20cd5f7bef9b9a" ON "forgot" ("hash") `);
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar, "email" varchar, "password" varchar, "provider" varchar NOT NULL DEFAULT ('email'), "socialId" varchar, "firstName" varchar, "lastName" varchar, "hash" varchar, "deletedAt" datetime, "roleId" integer, "statusId" integer, CONSTRAINT "UQ_ed766a9782779b8390a2a81f444" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
        await queryRunner.query(`CREATE INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f" ON "user" ("socialId") `);
        await queryRunner.query(`CREATE INDEX "IDX_58e4dbff0e1a32a9bdc861bb29" ON "user" ("firstName") `);
        await queryRunner.query(`CREATE INDEX "IDX_f0e1b4ecdca13b177e2e3a0613" ON "user" ("lastName") `);
        await queryRunner.query(`CREATE INDEX "IDX_e282acb94d2e3aec10f480e4f6" ON "user" ("hash") `);
        await queryRunner.query(`DROP INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f"`);
        await queryRunner.query(`DROP INDEX "IDX_58e4dbff0e1a32a9bdc861bb29"`);
        await queryRunner.query(`DROP INDEX "IDX_f0e1b4ecdca13b177e2e3a0613"`);
        await queryRunner.query(`DROP INDEX "IDX_e282acb94d2e3aec10f480e4f6"`);
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar, "email" varchar, "password" varchar, "provider" varchar NOT NULL DEFAULT ('email'), "socialId" varchar, "firstName" varchar, "lastName" varchar, "hash" varchar, "deletedAt" datetime, "roleId" integer, "statusId" integer, CONSTRAINT "UQ_ed766a9782779b8390a2a81f444" UNIQUE ("email"), CONSTRAINT "FK_c28e52f758e7bbc53828db92194" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_dc18daa696860586ba4667a9d31" FOREIGN KEY ("statusId") REFERENCES "status" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL", "email", "password", "provider", "socialId", "firstName", "lastName", "hash", "deletedAt", "roleId", "statusId") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL", "email", "password", "provider", "socialId", "firstName", "lastName", "hash", "deletedAt", "roleId", "statusId" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
        await queryRunner.query(`CREATE INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f" ON "user" ("socialId") `);
        await queryRunner.query(`CREATE INDEX "IDX_58e4dbff0e1a32a9bdc861bb29" ON "user" ("firstName") `);
        await queryRunner.query(`CREATE INDEX "IDX_f0e1b4ecdca13b177e2e3a0613" ON "user" ("lastName") `);
        await queryRunner.query(`CREATE INDEX "IDX_e282acb94d2e3aec10f480e4f6" ON "user" ("hash") `);
        await queryRunner.query(`DROP INDEX "IDX_3d2f174ef04fb312fdebd0ddc5"`);
        await queryRunner.query(`CREATE TABLE "temporary_session" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar, CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_session"("id", "createdAt", "deletedAt", "userId") SELECT "id", "createdAt", "deletedAt", "userId" FROM "session"`);
        await queryRunner.query(`DROP TABLE "session"`);
        await queryRunner.query(`ALTER TABLE "temporary_session" RENAME TO "session"`);
        await queryRunner.query(`CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `);
        await queryRunner.query(`DROP INDEX "IDX_df507d27b0fb20cd5f7bef9b9a"`);
        await queryRunner.query(`CREATE TABLE "temporary_forgot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hash" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar, CONSTRAINT "FK_31f3c80de0525250f31e23a9b83" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_forgot"("id", "hash", "createdAt", "deletedAt", "userId") SELECT "id", "hash", "createdAt", "deletedAt", "userId" FROM "forgot"`);
        await queryRunner.query(`DROP TABLE "forgot"`);
        await queryRunner.query(`ALTER TABLE "temporary_forgot" RENAME TO "forgot"`);
        await queryRunner.query(`CREATE INDEX "IDX_df507d27b0fb20cd5f7bef9b9a" ON "forgot" ("hash") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_df507d27b0fb20cd5f7bef9b9a"`);
        await queryRunner.query(`ALTER TABLE "forgot" RENAME TO "temporary_forgot"`);
        await queryRunner.query(`CREATE TABLE "forgot" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hash" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar)`);
        await queryRunner.query(`INSERT INTO "forgot"("id", "hash", "createdAt", "deletedAt", "userId") SELECT "id", "hash", "createdAt", "deletedAt", "userId" FROM "temporary_forgot"`);
        await queryRunner.query(`DROP TABLE "temporary_forgot"`);
        await queryRunner.query(`CREATE INDEX "IDX_df507d27b0fb20cd5f7bef9b9a" ON "forgot" ("hash") `);
        await queryRunner.query(`DROP INDEX "IDX_3d2f174ef04fb312fdebd0ddc5"`);
        await queryRunner.query(`ALTER TABLE "session" RENAME TO "temporary_session"`);
        await queryRunner.query(`CREATE TABLE "session" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, "userId" varchar)`);
        await queryRunner.query(`INSERT INTO "session"("id", "createdAt", "deletedAt", "userId") SELECT "id", "createdAt", "deletedAt", "userId" FROM "temporary_session"`);
        await queryRunner.query(`DROP TABLE "temporary_session"`);
        await queryRunner.query(`CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `);
        await queryRunner.query(`DROP INDEX "IDX_e282acb94d2e3aec10f480e4f6"`);
        await queryRunner.query(`DROP INDEX "IDX_f0e1b4ecdca13b177e2e3a0613"`);
        await queryRunner.query(`DROP INDEX "IDX_58e4dbff0e1a32a9bdc861bb29"`);
        await queryRunner.query(`DROP INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar, "email" varchar, "password" varchar, "provider" varchar NOT NULL DEFAULT ('email'), "socialId" varchar, "firstName" varchar, "lastName" varchar, "hash" varchar, "deletedAt" datetime, "roleId" integer, "statusId" integer, CONSTRAINT "UQ_ed766a9782779b8390a2a81f444" UNIQUE ("email"))`);
        await queryRunner.query(`INSERT INTO "user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL", "email", "password", "provider", "socialId", "firstName", "lastName", "hash", "deletedAt", "roleId", "statusId") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL", "email", "password", "provider", "socialId", "firstName", "lastName", "hash", "deletedAt", "roleId", "statusId" FROM "temporary_user"`);
        await queryRunner.query(`DROP TABLE "temporary_user"`);
        await queryRunner.query(`CREATE INDEX "IDX_e282acb94d2e3aec10f480e4f6" ON "user" ("hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_f0e1b4ecdca13b177e2e3a0613" ON "user" ("lastName") `);
        await queryRunner.query(`CREATE INDEX "IDX_58e4dbff0e1a32a9bdc861bb29" ON "user" ("firstName") `);
        await queryRunner.query(`CREATE INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f" ON "user" ("socialId") `);
        await queryRunner.query(`DROP INDEX "IDX_e282acb94d2e3aec10f480e4f6"`);
        await queryRunner.query(`DROP INDEX "IDX_f0e1b4ecdca13b177e2e3a0613"`);
        await queryRunner.query(`DROP INDEX "IDX_58e4dbff0e1a32a9bdc861bb29"`);
        await queryRunner.query(`DROP INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar)`);
        await queryRunner.query(`INSERT INTO "user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL" FROM "temporary_user"`);
        await queryRunner.query(`DROP TABLE "temporary_user"`);
        await queryRunner.query(`DROP INDEX "IDX_df507d27b0fb20cd5f7bef9b9a"`);
        await queryRunner.query(`DROP TABLE "forgot"`);
        await queryRunner.query(`DROP INDEX "IDX_3d2f174ef04fb312fdebd0ddc5"`);
        await queryRunner.query(`DROP TABLE "session"`);
        await queryRunner.query(`DROP TABLE "status"`);
        await queryRunner.query(`DROP TABLE "role"`);
    }

}
