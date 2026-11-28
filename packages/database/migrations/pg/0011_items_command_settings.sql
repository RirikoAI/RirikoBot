-- Data-only: the /item command is now /items, so its saved server overrides move with it.
-- Rows for /use stay as they are.
UPDATE command_settings SET command_name = 'items' WHERE command_name = 'item';
