ALTER TABLE "knowledges" RENAME TO "datasets";--> statement-breakpoint
ALTER TABLE "chunks" RENAME COLUMN "knowledge_base_id" TO "dataset_id";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "knowledge_base_id" TO "dataset_id";--> statement-breakpoint
ALTER TABLE "chunks" DROP CONSTRAINT "chunks_knowledge_base_id_knowledges_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_knowledge_base_id_knowledges_id_fk";
--> statement-breakpoint
ALTER TABLE "datasets" DROP CONSTRAINT "knowledges_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "idx_chunks_knowledge_base_id";--> statement-breakpoint
DROP INDEX "idx_chunks_knowledge_base_id_user_id";--> statement-breakpoint
DROP INDEX "idx_documents_knowledge_base_id";--> statement-breakpoint
DROP INDEX "idx_knowledges_user_id";--> statement-breakpoint
DROP INDEX "idx_knowledges_status";--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chunks_dataset_id" ON "chunks" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "idx_chunks_dataset_id_user_id" ON "chunks" USING btree ("dataset_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_documents_dataset_id" ON "documents" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "idx_datasets_user_id" ON "datasets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_datasets_status" ON "datasets" USING btree ("status");