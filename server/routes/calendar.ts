import type { Express } from "express";
import { requireAuth } from "../middleware/auth";

type CalendarEvent = {
  id: string;
  title: string;
  category: "macro" | "commodities" | "equities" | "crypto";
  when: string;
  importance: "high" | "medium";
  note: string;
};

function nextWeekdayDate(targetWeekday: number, hourUtc: number, minuteUtc = 0): Date {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minuteUtc, 0));
  const delta = (targetWeekday - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  if (base <= now) {
    base.setUTCDate(base.getUTCDate() + 7);
  }
  return base;
}

function nextMonthDayDate(day: number, hourUtc: number, minuteUtc = 0): Date {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let d = new Date(Date.UTC(year, month, day, hourUtc, minuteUtc, 0));
  if (d <= now) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    d = new Date(Date.UTC(year, month, day, hourUtc, minuteUtc, 0));
  }
  return d;
}

function buildUpcomingEvents(): CalendarEvent[] {
  // Inference-based recurring schedule for major market events.
  const events: CalendarEvent[] = [
    {
      id: "us-cpi",
      title: "US CPI (Inflation)",
      category: "macro",
      when: nextMonthDayDate(12, 12, 30).toISOString(),
      importance: "high",
      note: "Can move rates, bonds, equities, and USD quickly.",
    },
    {
      id: "us-payrolls",
      title: "US Nonfarm Payrolls",
      category: "macro",
      when: nextWeekdayDate(5, 12, 30).toISOString(),
      importance: "high",
      note: "Labor strength/weakness often shifts Fed expectations.",
    },
    {
      id: "eia-crude",
      title: "EIA Crude Oil Inventories",
      category: "commodities",
      when: nextWeekdayDate(3, 14, 30).toISOString(),
      importance: "high",
      note: "Key weekly data point for oil and refined products.",
    },
    {
      id: "fomc",
      title: "FOMC Policy Decision",
      category: "macro",
      when: nextWeekdayDate(3, 18, 0).toISOString(),
      importance: "high",
      note: "Rate decisions and guidance are major macro catalysts.",
    },
    {
      id: "opec",
      title: "OPEC+ Meeting Watch",
      category: "commodities",
      when: nextWeekdayDate(4, 13, 0).toISOString(),
      importance: "medium",
      note: "Production language can shift oil supply expectations.",
    },
    {
      id: "earnings-us",
      title: "US Mega-cap Earnings Window",
      category: "equities",
      when: nextWeekdayDate(2, 20, 0).toISOString(),
      importance: "high",
      note: "Guidance and margins can move broad equity sentiment.",
    },
  ];

  return events.sort((a, b) => +new Date(a.when) - +new Date(b.when));
}

export function registerCalendarRoutes(app: Express): void {
  app.get("/api/calendar/upcoming", requireAuth, (_req, res) => {
    res.json({
      events: buildUpcomingEvents(),
      note:
        "Dates are recurring approximations for planning. Confirm exact release times with official calendars.",
    });
  });
}
