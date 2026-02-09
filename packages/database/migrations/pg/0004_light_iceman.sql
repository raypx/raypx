CREATE TABLE "config_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"previous_value" text,
	"new_value" text,
	"changed_by" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_namespaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"sort_order" varchar(10) DEFAULT '0',
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" text,
	"value_type" varchar(20) DEFAULT 'string' NOT NULL,
	"description" text,
	"is_secret" boolean DEFAULT false,
	"metadata" jsonb,
	"namespace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config_history" ADD CONSTRAINT "config_history_config_id_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_history" ADD CONSTRAINT "config_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_namespaces" ADD CONSTRAINT "config_namespaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_namespace_id_config_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."config_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_config_history_config_id" ON "config_history" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "idx_config_history_changed_by" ON "config_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "idx_config_namespaces_user_id" ON "config_namespaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_config_namespaces_name" ON "config_namespaces" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_configs_namespace_id" ON "configs" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "idx_configs_user_id" ON "configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_configs_key" ON "configs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_configs_namespace_key" ON "configs" USING btree ("namespace_id","key");