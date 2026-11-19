/**
 * app/lib/filters.js — the report filters shared by the dashboards, named the
 * way EVC's Behavioral Reporting workbook names them. Values match the API's
 * `segment` and `reportable` query parameters ("" = no filter).
 */
export const SEGMENT_OPTIONS = [
  { value: "", label: "All members" },
  { value: "behavioral", label: "Behavioral" },
  { value: "non", label: "Non-Behavioral" },
];

export const INCLUDE_OPTIONS = [
  { value: "", label: "All events" },
  { value: "reportable", label: "Reportable only" },
  { value: "non", label: "Non-reportable only" },
];
