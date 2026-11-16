CREATE TABLE "conversation_attachment_objects" (
	"key" text PRIMARY KEY,
	"cleanup_after" timestamp with time zone DEFAULT now() + interval '1 minute' NOT NULL,
	"cleanup_queued" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD COLUMN "object_key" text;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_object_key" UNIQUE("object_key");--> statement-breakpoint
CREATE INDEX "conversation_attachment_objects_cleanup_idx" ON "conversation_attachment_objects" ("cleanup_after","key") WHERE "cleanup_queued";--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_qbQn0jHfQFvr_fkey" FOREIGN KEY ("object_key") REFERENCES "conversation_attachment_objects"("key");--> statement-breakpoint
ALTER TABLE "conversation_attachments" DROP CONSTRAINT "conversation_attachments_size_check", ADD CONSTRAINT "conversation_attachments_size_check" CHECK ("size" between 1 and 1048576 and (
        ("bytes" is not null and octet_length(decode("bytes", 'base64')) = "size"
          and ("object_key" is null or not "ready"))
        or ("bytes" is null and "object_key" is not null and "ready")
      ));
--> statement-breakpoint
CREATE FUNCTION public.queue_conversation_attachment_object_cleanup() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public AS $$
BEGIN
  UPDATE public.conversation_attachment_objects
  SET cleanup_queued = true
  WHERE key = OLD.object_key;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversation_attachment_object_cleanup
AFTER DELETE ON public.conversation_attachments
FOR EACH ROW WHEN (OLD.object_key IS NOT NULL)
EXECUTE FUNCTION public.queue_conversation_attachment_object_cleanup();
