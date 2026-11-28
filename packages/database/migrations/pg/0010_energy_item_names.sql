-- Data-only: stamina becomes energy in item codes, names and descriptions.
-- Only rows still holding the old default text are touched, so owner edits stay.
UPDATE game_items SET code = 'RESTORE_ENERGY_CANDY' WHERE code = 'RESTORE_STAMINA_CANDY' AND NOT EXISTS (SELECT 1 FROM game_items WHERE code = 'RESTORE_ENERGY_CANDY');--> statement-breakpoint
UPDATE game_items SET code = 'RESTORE_GRAND_ENERGY_FLASK' WHERE code = 'RESTORE_GRAND_STAMINA_FLASK' AND NOT EXISTS (SELECT 1 FROM game_items WHERE code = 'RESTORE_GRAND_ENERGY_FLASK');--> statement-breakpoint
UPDATE game_items SET name = 'Energy Candy' WHERE code = 'RESTORE_ENERGY_CANDY' AND name = 'Stamina Candy';--> statement-breakpoint
UPDATE game_items SET name = 'Grand Energy Flask' WHERE code = 'RESTORE_GRAND_ENERGY_FLASK' AND name = 'Grand Stamina Flask';--> statement-breakpoint
UPDATE economy_items SET code = 'energy_potion' WHERE code = 'stamina_potion' AND NOT EXISTS (SELECT 1 FROM economy_items WHERE code = 'energy_potion');--> statement-breakpoint
UPDATE economy_items SET name = 'Energy Potion' WHERE code = 'energy_potion' AND name = 'Stamina Potion';--> statement-breakpoint
UPDATE economy_items SET description = 'Restores 50 energy. Hard anti-abuse ceiling: max 3 potions consumed per day.' WHERE code = 'energy_potion' AND description = 'Restores 50 stamina. Hard anti-abuse ceiling: max 3 potions consumed per day.';--> statement-breakpoint
UPDATE economy_items SET description = 'A sweet candy that restores 20 energy. Town shop limit: 1 per user per day.' WHERE code = 'candy_minor' AND description = 'A sweet candy that restores 20 stamina. Town shop limit: 1 per user per day.';
