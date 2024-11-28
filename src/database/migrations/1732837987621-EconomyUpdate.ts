import { MigrationInterface, QueryRunner } from "typeorm";

export class EconomyUpdate1732837987621 implements MigrationInterface {
    name = 'EconomyUpdate1732837987621'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "item_category" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "price" integer NOT NULL, "description" varchar NOT NULL, "rarity" integer NOT NULL, "hidden" boolean NOT NULL DEFAULT (0), "purchaseLimit" integer NOT NULL DEFAULT (0), "purchasable" boolean NOT NULL DEFAULT (0), "sellable" boolean NOT NULL DEFAULT (0), "findable" boolean NOT NULL DEFAULT (0), "imageUrl" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "categoryId" integer)`);
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar)`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
        await queryRunner.query(`CREATE TABLE "temporary_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "price" integer NOT NULL, "description" varchar NOT NULL, "rarity" integer NOT NULL, "hidden" boolean NOT NULL DEFAULT (0), "purchaseLimit" integer NOT NULL DEFAULT (0), "purchasable" boolean NOT NULL DEFAULT (0), "sellable" boolean NOT NULL DEFAULT (0), "findable" boolean NOT NULL DEFAULT (0), "imageUrl" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "categoryId" integer, CONSTRAINT "FK_c0c8f47a702c974a77812169bc2" FOREIGN KEY ("categoryId") REFERENCES "item_category" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_item"("id", "name", "price", "description", "rarity", "hidden", "purchaseLimit", "purchasable", "sellable", "findable", "imageUrl", "createdAt", "updatedAt", "categoryId") SELECT "id", "name", "price", "description", "rarity", "hidden", "purchaseLimit", "purchasable", "sellable", "findable", "imageUrl", "createdAt", "updatedAt", "categoryId" FROM "item"`);
        await queryRunner.query(`DROP TABLE "item"`);
        await queryRunner.query(`ALTER TABLE "temporary_item" RENAME TO "item"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "item" RENAME TO "temporary_item"`);
        await queryRunner.query(`CREATE TABLE "item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "price" integer NOT NULL, "description" varchar NOT NULL, "rarity" integer NOT NULL, "hidden" boolean NOT NULL DEFAULT (0), "purchaseLimit" integer NOT NULL DEFAULT (0), "purchasable" boolean NOT NULL DEFAULT (0), "sellable" boolean NOT NULL DEFAULT (0), "findable" boolean NOT NULL DEFAULT (0), "imageUrl" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "categoryId" integer)`);
        await queryRunner.query(`INSERT INTO "item"("id", "name", "price", "description", "rarity", "hidden", "purchaseLimit", "purchasable", "sellable", "findable", "imageUrl", "createdAt", "updatedAt", "categoryId") SELECT "id", "name", "price", "description", "rarity", "hidden", "purchaseLimit", "purchasable", "sellable", "findable", "imageUrl", "createdAt", "updatedAt", "categoryId" FROM "temporary_item"`);
        await queryRunner.query(`DROP TABLE "temporary_item"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt" FROM "temporary_user"`);
        await queryRunner.query(`DROP TABLE "temporary_user"`);
        await queryRunner.query(`DROP TABLE "item"`);
        await queryRunner.query(`DROP TABLE "item_category"`);
    }

}
