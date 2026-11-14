CREATE TABLE `desktop_sessions` (
	`origin` text PRIMARY KEY,
	`version` integer NOT NULL,
	`encrypted` blob NOT NULL,
	CONSTRAINT "desktop_session_version" CHECK("version" > 0),
	CONSTRAINT "desktop_session_size" CHECK(length("encrypted") BETWEEN 28 AND 262172)
);
