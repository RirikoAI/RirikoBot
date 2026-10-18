import { ValidationError } from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type DungeonBoss,
  type DungeonBossRepository,
  type DungeonFloor,
  type DungeonFloorRepository,
  type DungeonSeason,
  type DungeonSeasonRepository,
  type GameItem,
  type GameItemRepository,
} from '@ririko/database';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';
import { parseBossDefinition } from '../waifu-tcg/dungeon/boss-definition.js';
import {
  bossDefinitionFromInput,
  bossEditInputSchema,
  floorLootCodeFields,
  floorLootFromInput,
  floorLootInputSchema,
  type FloorLootInput,
  seasonCreateInputSchema,
  seasonRowFromInput,
  seasonUpdateInputSchema,
} from '../waifu-tcg/dungeon/dungeon-admin-input.js';

export interface DungeonSeasonAdminServiceDeps {
  db: DatabaseClient;
  seasons: DungeonSeasonRepository;
  floors: DungeonFloorRepository;
  bosses: DungeonBossRepository;
  items: GameItemRepository;
  audit: AuditLogRepository;
  now?: () => Date;
}

/**
 * Where a season stands for players. `live` is the one season players climb now; `overlapped`
 * is inside its dates but a later-starting season is live instead.
 */
export type SeasonStatus = 'live' | 'overlapped' | 'scheduled' | 'ended' | 'off' | 'tutorial';

export interface SeasonSummary {
  season: DungeonSeason;
  status: SeasonStatus;
  floors: number;
  bosses: number;
}

export interface SeasonDetail extends SeasonSummary {
  floorRows: DungeonFloor[];
  bossRows: DungeonBoss[];
}

/** A refusal the owner should read, such as editing the tutorial. */
function refuse(message: string): never {
  throw new ValidationError(message);
}

function invalid(fieldErrors: Record<string, string[]>, subject: string): never {
  throw new GuildConfigValidationError(fieldErrors, subject);
}

/** Objects with their keys sorted at every depth, so stored and edited JSON compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, inner]) => [key, canonical(inner)]),
    );
  }
  return value;
}

function canonicalRecord(value: Record<string, unknown>): Record<string, unknown> {
  return canonical(value) as Record<string, unknown>;
}

/**
 * Dungeon seasons and their bosses for the owner console. Every write runs in one
 * transaction with its audit entry, recorded without a guild. The tutorial season is fixed.
 */
export class DungeonSeasonAdminService {
  private readonly now: () => Date;

  constructor(private readonly deps: DungeonSeasonAdminServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async listSeasons(): Promise<SeasonSummary[]> {
    const now = this.now();
    const [seasons, live] = await Promise.all([
      this.deps.seasons.listAll(),
      this.deps.seasons.findActiveSeason(undefined, now),
    ]);
    return Promise.all(
      seasons.map(async (season) => {
        const [floors, bosses] = await Promise.all([
          this.deps.floors.listFloorsForSeason(season.id),
          this.deps.bosses.listForSeason(season.id),
        ]);
        return {
          season,
          status: seasonStatus(season, live?.id ?? null, now),
          floors: floors.length,
          bosses: bosses.length,
        };
      }),
    );
  }

  async getSeason(seasonId: string): Promise<SeasonDetail | null> {
    const season = await this.deps.seasons.findById(seasonId);
    if (!season) return null;
    const now = this.now();
    const [live, floorRows, bossRows] = await Promise.all([
      this.deps.seasons.findActiveSeason(undefined, now),
      this.deps.floors.listFloorsForSeason(season.id),
      this.deps.bosses.listForSeason(season.id),
    ]);
    return {
      season,
      status: seasonStatus(season, live?.id ?? null, now),
      floors: floorRows.length,
      bosses: bossRows.length,
      floorRows,
      bossRows,
    };
  }

  async getBoss(bossId: string): Promise<DungeonBoss | null> {
    return this.deps.bosses.findById(bossId);
  }

  async getFloor(seasonId: string, floorNumber: number): Promise<DungeonFloor | null> {
    return this.deps.floors.findBySeasonAndFloor(seasonId, floorNumber);
  }

  /** TCG items (`game_items`) a boss or floor can drop, by name. */
  async listItems(): Promise<GameItem[]> {
    const items = await this.deps.items.findAll();
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createSeason(
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<DungeonSeason> {
    const parsed = seasonCreateInputSchema.safeParse(raw);
    if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'dungeon season');
    return withTransaction(this.deps.db, async (tx) => {
      if (await this.deps.seasons.findById(parsed.data.id, tx)) {
        invalid({ id: ['Another season uses this ID.'] }, 'dungeon season');
      }
      const season = await this.deps.seasons.create(
        { id: parsed.data.id, isTutorial: false, ...seasonRowFromInput(parsed.data) },
        tx,
      );
      await this.record('owner.dungeon_season.create', actor, seasonDetails(season), tx);
      return season;
    });
  }

  /** Saves the editor's values. Nothing is written when nothing changed. */
  async updateSeason(
    seasonId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ season: DungeonSeason; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.requireEditableSeason(seasonId, tx);
      // The ID is fixed once created.
      const { id: _id, ...fields } = raw;
      const parsed = seasonUpdateInputSchema.safeParse(fields);
      if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'dungeon season');
      const after = seasonRowFromInput(parsed.data);
      const before = Object.fromEntries(
        Object.keys(after).map((key) => [key, existing[key as keyof DungeonSeason]]),
      );
      const changes = diffFields(canonicalRecord(before), canonicalRecord(after));
      if (changes.length === 0) return { season: existing, changed: false };

      const season = await this.deps.seasons.update(existing.id, after, tx);
      await this.record(
        'owner.dungeon_season.update',
        actor,
        { ...seasonDetails(season), changes },
        tx,
      );
      return { season, changed: true };
    });
  }

  /** Saves a boss's combat settings and signature drop. */
  async updateBoss(
    bossId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ boss: DungeonBoss; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.deps.bosses.findById(bossId, tx);
      if (!existing) refuse('This boss no longer exists.');
      await this.requireEditableSeason(existing.seasonId, tx);
      const parsed = bossEditInputSchema.safeParse(raw);
      if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'dungeon boss');

      const code = parsed.data.signatureDropCode;
      if (code && !(await this.deps.items.findByCode(code, tx))) {
        invalid({ signatureDropCode: ['No TCG item has this code.'] }, 'dungeon boss');
      }
      const after = {
        definition: bossDefinitionFromInput(
          parsed.data,
          parseBossDefinition(existing.definition, `boss ${existing.id}`),
        ) as Record<string, unknown>,
        signatureDropCode: code,
      };
      const changes = diffFields(
        canonicalRecord({
          definition: existing.definition,
          signatureDropCode: existing.signatureDropCode,
        }),
        canonicalRecord(after),
      );
      if (changes.length === 0) return { boss: existing, changed: false };

      const boss = await this.deps.bosses.update(existing.id, after, tx);
      await this.record(
        'owner.dungeon_boss.update',
        actor,
        { bossId: boss.id, seasonId: boss.seasonId, name: boss.name, changes },
        tx,
      );
      return { boss, changed: true };
    });
  }

  /** Saves a floor's first-clear and repeat-clear loot overrides; empty fields keep the defaults. */
  async updateFloorLoot(
    seasonId: string,
    floorNumber: number,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ floor: DungeonFloor; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      await this.requireEditableSeason(seasonId, tx);
      const existing = await this.deps.floors.findBySeasonAndFloor(seasonId, floorNumber, tx);
      if (!existing) refuse('This floor no longer exists.');
      const parsed = floorLootInputSchema.safeParse(raw);
      if (!parsed.success) invalid(fieldErrorsOf(parsed.error.issues), 'floor loot');
      const input = parsed.data as FloorLootInput;

      const unknown: Record<string, string[]> = {};
      for (const [field, code] of floorLootCodeFields(input)) {
        if (!(await this.deps.items.findByCode(code, tx))) {
          unknown[field] = ['No TCG item has this code.'];
        }
      }
      if (Object.keys(unknown).length > 0) invalid(unknown, 'floor loot');

      const after = floorLootFromInput(input);
      const changes = diffFields(
        canonicalRecord({
          firstClearRewards: existing.firstClearRewards ?? {},
          repeatRewardsTable: existing.repeatRewardsTable ?? {},
        }),
        canonicalRecord(after),
      );
      if (changes.length === 0) return { floor: existing, changed: false };

      const floor = await this.deps.floors.update(existing.id, after, tx);
      await this.record(
        'owner.dungeon_floor.update',
        actor,
        { seasonId, floorNumber, changes },
        tx,
      );
      return { floor, changed: true };
    });
  }

  private async requireEditableSeason(
    seasonId: string,
    tx: DatabaseClient,
  ): Promise<DungeonSeason> {
    const season = await this.deps.seasons.findById(seasonId, tx);
    if (!season) refuse('This season no longer exists.');
    if (season.isTutorial) refuse('The tutorial season is fixed and cannot be edited.');
    return season;
  }

  private async record(
    action: string,
    actor: GuildConfigActor,
    details: Record<string, unknown>,
    tx: DatabaseClient,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId: null,
        actorUserId: actor.userId,
        action,
        details: { source: actor.source, ...details },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
      this.now(),
      tx,
    );
  }
}

export function seasonStatus(
  season: DungeonSeason,
  liveId: string | null,
  now: Date,
): SeasonStatus {
  if (season.isTutorial) return 'tutorial';
  if (!season.isActive) return 'off';
  if (season.endsAt.getTime() <= now.getTime()) return 'ended';
  if (season.startsAt.getTime() > now.getTime()) return 'scheduled';
  return season.id === liveId ? 'live' : 'overlapped';
}

function seasonDetails(season: DungeonSeason): Record<string, unknown> {
  return { seasonId: season.id, name: season.name };
}
