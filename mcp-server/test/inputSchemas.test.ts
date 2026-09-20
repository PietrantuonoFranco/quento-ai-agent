import { describe, expect, it } from "vitest";

import {
  cancelBookingInputSchema,
  checkTimeAvailabilityInputSchema,
  createBookingInputSchema,
  getAvailableBookingsInputSchema,
  getAvailableTimesInputSchema,
  getBookingDetailsInputSchema,
  getClubInfoInputSchema,
  getMyBookingsInputSchema,
  listCourtsInputSchema,
  rescheduleBookingInputSchema,
  createMatchFromBookingInputSchema,
} from "../src/schemas/inputSchemas";

describe("inputSchemas", () => {
  describe("date opcional (get_available_bookings / get_available_times)", () => {
    it.each([getAvailableBookingsInputSchema, getAvailableTimesInputSchema])("acepta omitirla", (schema) => {
      expect(schema.parse({})).toEqual({});
    });

    it.each(["2026-09-20", "1999-01-01"])("acepta %s", (date) => {
      expect(getAvailableTimesInputSchema.parse({ date }).date).toBe(date);
    });

    it.each(["20-09-2026", "2026/09/20", "mañana", "2026-9-2", ""])("rechaza %j", (date) => {
      expect(getAvailableTimesInputSchema.safeParse({ date }).success).toBe(false);
      expect(getAvailableBookingsInputSchema.safeParse({ date }).success).toBe(false);
    });
  });

  it("get_available_bookings valida courtId como entero positivo", () => {
    expect(getAvailableBookingsInputSchema.safeParse({ courtId: 3 }).success).toBe(true);
    expect(getAvailableBookingsInputSchema.safeParse({ courtId: 0 }).success).toBe(false);
    expect(getAvailableBookingsInputSchema.safeParse({ courtId: -1 }).success).toBe(false);
    expect(getAvailableBookingsInputSchema.safeParse({ courtId: 1.5 }).success).toBe(false);
    expect(getAvailableBookingsInputSchema.safeParse({ courtId: "1" }).success).toBe(false);
  });

  describe("check_time_availability", () => {
    it.each(["00:00", "09:00", "13:30", "23:59"])("acepta la hora %s", (time) => {
      expect(checkTimeAvailabilityInputSchema.safeParse({ time }).success).toBe(true);
    });

    it.each(["24:00", "9:00", "13:60", "13", "13:00:00", "1pm", ""])("rechaza la hora %j", (time) => {
      expect(checkTimeAvailabilityInputSchema.safeParse({ time }).success).toBe(false);
    });

    it("exige time", () => {
      expect(checkTimeAvailabilityInputSchema.safeParse({}).success).toBe(false);
    });
  });

  it.each([
    ["get_booking_details", getBookingDetailsInputSchema],
    ["cancel_booking", cancelBookingInputSchema],
    ["create_match_from_booking", createMatchFromBookingInputSchema],
  ])("%s exige bookingId positivo y phoneNumber", (_name, schema) => {
    expect(schema.safeParse({ bookingId: 1, phoneNumber: "549" }).success).toBe(true);
    expect(schema.safeParse({ bookingId: 0, phoneNumber: "549" }).success).toBe(false);
    expect(schema.safeParse({ bookingId: 1 }).success).toBe(false);
    expect(schema.safeParse({ phoneNumber: "549" }).success).toBe(false);
  });

  it("get_my_bookings exige phoneNumber", () => {
    expect(getMyBookingsInputSchema.safeParse({ phoneNumber: "549" }).success).toBe(true);
    expect(getMyBookingsInputSchema.safeParse({}).success).toBe(false);
  });

  it("reschedule_booking exige newDatetime y courtId es opcional", () => {
    const base = { bookingId: 1, phoneNumber: "549", newDatetime: "2026-09-20T12:00:00Z" };

    expect(rescheduleBookingInputSchema.safeParse(base).success).toBe(true);
    expect(rescheduleBookingInputSchema.safeParse({ ...base, courtId: 2 }).success).toBe(true);
    expect(rescheduleBookingInputSchema.safeParse({ ...base, courtId: 0 }).success).toBe(false);
    expect(rescheduleBookingInputSchema.safeParse({ bookingId: 1, phoneNumber: "549" }).success).toBe(false);
  });

  it("create_booking exige courtId, teléfono y datetime", () => {
    const ok = { courtId: 1, bookerPhoneNumber: "549", datetime: "2026-09-20T12:00:00Z" };

    expect(createBookingInputSchema.safeParse(ok).success).toBe(true);
    expect(createBookingInputSchema.safeParse({ ...ok, courtId: undefined }).success).toBe(false);
    expect(createBookingInputSchema.safeParse({ ...ok, datetime: undefined }).success).toBe(false);
  });

  it("list_courts solo acepta estados válidos", () => {
    expect(listCourtsInputSchema.safeParse({}).success).toBe(true);
    expect(listCourtsInputSchema.safeParse({ state: "available" }).success).toBe(true);
    expect(listCourtsInputSchema.safeParse({ state: "inexistente" }).success).toBe(false);
  });

  it("get_club_info no pide parámetros", () => {
    expect(getClubInfoInputSchema.safeParse({}).success).toBe(true);
  });
});
