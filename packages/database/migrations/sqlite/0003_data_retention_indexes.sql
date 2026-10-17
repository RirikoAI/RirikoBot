CREATE INDEX `idx_music_history_played` ON `music_history` (`played_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_conversations_updated` ON `ai_conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_messages_created` ON `ai_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_image_jobs_created` ON `image_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);