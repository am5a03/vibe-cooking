CREATE TABLE `kitchen_flavor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`origin` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "flavor_profile_json" CHECK(json_valid("kitchen_flavor_profiles"."document")),
	CONSTRAINT "flavor_profile_origin" CHECK("kitchen_flavor_profiles"."origin" IN ('builtin','custom')),
	CONSTRAINT "flavor_profile_revision" CHECK("kitchen_flavor_profiles"."revision" > 0)
);
