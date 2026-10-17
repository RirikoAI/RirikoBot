CREATE INDEX "idx_pg_music_history_played" ON "music_history" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "idx_pg_ai_conversations_updated" ON "ai_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_pg_ai_messages_created" ON "ai_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_image_jobs_created" ON "image_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_audit_logs_created" ON "audit_logs" USING btree ("created_at");