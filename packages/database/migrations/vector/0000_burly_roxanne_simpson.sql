CREATE TABLE "vector_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"index" text NOT NULL,
	"document_id" uuid,
	"dataset_id" uuid,
	"user_id" uuid NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vector_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"embedding" vector(1024),
	"content" text,
	"metadata" jsonb,
	"model" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_vector_chunks_document_id" ON "vector_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_vector_chunks_dataset_id" ON "vector_chunks" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "idx_vector_chunks_user_id" ON "vector_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vector_chunks_user_id_document_id" ON "vector_chunks" USING btree ("user_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_vector_embeddings_chunk_id" ON "vector_embeddings" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "idx_vector_embeddings_user_id" ON "vector_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vector_embeddings_user_id_chunk_id" ON "vector_embeddings" USING btree ("user_id","chunk_id");