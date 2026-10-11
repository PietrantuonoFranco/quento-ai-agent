CREATE TYPE "public"."fixed_booking_dates_state_enum" AS ENUM('booked', 'released', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."fixed_bookings_frequency_enum" AS ENUM('weekly', 'biweekly');--> statement-breakpoint
CREATE TABLE "fixed_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"court_id" integer,
	"booker_phone_number" varchar,
	"start_date" date NOT NULL,
	"end_date" date,
	"start_time" time NOT NULL,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"frequency" "fixed_bookings_frequency_enum" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_booking_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixed_booking_id" integer,
	"booking_id" integer,
	"date" date NOT NULL,
	"state" "fixed_booking_dates_state_enum" NOT NULL,
	CONSTRAINT "UQ_fixed_booking_dates_booking_id" UNIQUE("booking_id"),
	CONSTRAINT "UQ_fixed_booking_dates_fixed_booking_id_date" UNIQUE("fixed_booking_id","date")
);
--> statement-breakpoint
ALTER TABLE "fixed_bookings" ADD CONSTRAINT "fixed_bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_bookings" ADD CONSTRAINT "fixed_bookings_booker_phone_number_bookers_phone_number_fk" FOREIGN KEY ("booker_phone_number") REFERENCES "public"."bookers"("phone_number") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fixed_booking_dates" ADD CONSTRAINT "fixed_booking_dates_fixed_booking_id_fixed_bookings_id_fk" FOREIGN KEY ("fixed_booking_id") REFERENCES "public"."fixed_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_booking_dates" ADD CONSTRAINT "fixed_booking_dates_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;