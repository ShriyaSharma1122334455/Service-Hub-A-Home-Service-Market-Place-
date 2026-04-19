import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotRaw {
  id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  date?: string;
}

interface Slot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
}

interface BookingModalProps {
  /** Provider's internal DB id (uuid) */
  providerId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  token: string;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

/** Format a Date as YYYY-MM-DD in local time */
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Build calendar weeks for a given month */
function buildCalendar(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(first).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function fmt12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BookingModal: React.FC<BookingModalProps> = ({
  providerId,
  providerName,
  serviceId,
  serviceName,
  servicePrice,
  token,
  onClose,
  onSuccess,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar state
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Slots state
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Address + notes
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [notes, setNotes] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch slots when date changes ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();

    async function fetchSlots() {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      const dateStr = toLocalDate(selectedDate!);
      try {
        const res = await fetch(
          `${API_BASE}/api/availability/${providerId}?date=${dateStr}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        );
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const available: Slot[] = (json.data as SlotRaw[])
            .filter((s) => !s.is_booked)
            .map((s) => ({
              id: s.id,
              startTime: s.start_time,
              endTime: s.end_time,
              label: `${fmt12h(s.start_time)} – ${fmt12h(s.end_time)}`,
            }));
          setSlots(available);
        } else {
          // No availability endpoint yet — fall back to generated slots
          setSlots(generateFallbackSlots());
        }
      } catch {
        if (!controller.signal.aborted) setSlots(generateFallbackSlots());
      } finally {
        if (!controller.signal.aborted) setSlotsLoading(false);
      }
    }

    fetchSlots();
    return () => controller.abort();
  }, [selectedDate, providerId, token]);

  /** Fallback: generate 9am–5pm hourly slots when no availability API data */
  function generateFallbackSlots(): Slot[] {
    const out: Slot[] = [];
    for (let h = 9; h < 17; h++) {
      const start = `${String(h).padStart(2, "0")}:00`;
      const end = `${String(h + 1).padStart(2, "0")}:00`;
      out.push({
        id: `fallback-${h}`,
        startTime: start,
        endTime: end,
        label: `${fmt12h(start)} – ${fmt12h(end)}`,
      });
    }
    return out;
  }

  // ── Submit booking ─────────────────────────────────────────────────────────
  async function handleBook() {
    if (!selectedDate || !selectedSlot) return;
    setError(null);
    setSubmitting(true);

    const scheduledAt = new Date(selectedDate);
    const [h, m] = selectedSlot.startTime.split(":").map(Number);
    scheduledAt.setHours(h, m, 0, 0);

    const body: Record<string, unknown> = {
      provider_id: providerId,
      service_id: serviceId,
      scheduled_at: scheduledAt.toISOString(),
      notes: notes.trim() || undefined,
      address_street: addressStreet.trim() || undefined,
      address_city: addressCity.trim() || undefined,
      address_state: addressState.trim() || undefined,
      address_zip: addressZip.trim() || undefined,
    };

    // Only include availability_id if it's a real slot (not fallback)
    if (!selectedSlot.id.startsWith("fallback-")) {
      body.availability_id = selectedSlot.id;
    }

    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to create booking. Please try again.");
        return;
      }
      onSuccess(json.data.id as string);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Calendar navigation ────────────────────────────────────────────────────
  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  const isPastDate = (d: Date) => d < today;
  const weeks = buildCalendar(calYear, calMonth);

  const canBook =
    !!selectedDate && !!selectedSlot && !submitting;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Book Appointment</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {serviceName} · <span className="font-semibold text-teal-700">{providerName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Step 1: Date Picker ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-teal-600" />
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Select Date
              </span>
            </div>

            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft size={16} className="text-slate-600" />
              </button>
              <span className="text-sm font-bold text-slate-800">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[11px] font-bold text-slate-400 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (!day) return <div key={di} />;
                  const past = isPastDate(day);
                  const selected =
                    selectedDate && toLocalDate(day) === toLocalDate(selectedDate);
                  return (
                    <button
                      key={di}
                      disabled={past}
                      onClick={() => { setSelectedDate(day); setSelectedSlot(null); }}
                      className={`
                        m-0.5 rounded-xl py-2 text-sm font-semibold transition-all
                        ${past ? "text-slate-300 cursor-not-allowed" : "hover:bg-teal-50 text-slate-700"}
                        ${selected ? "!bg-teal-600 !text-white shadow-md shadow-teal-200" : ""}
                      `}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </section>

          {/* ── Step 2: Slot Selector ──────────────────────────────────────── */}
          {selectedDate && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-teal-600" />
                <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Select Time Slot
                </span>
                <span className="text-xs text-slate-400 ml-1">
                  {toLocalDate(selectedDate)}
                </span>
              </div>

              {slotsLoading ? (
                <div className="flex items-center gap-2 text-slate-400 py-4">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading availability…</span>
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">
                  No slots available on this date. Try another day.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlot(slot)}
                      className={`
                        py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all
                        ${
                          selectedSlot?.id === slot.id
                            ? "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-100"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50"
                        }
                      `}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Step 3: Address ────────────────────────────────────────────── */}
          {selectedSlot && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={16} className="text-teal-600" />
                <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Service Address
                </span>
                <span className="text-xs text-slate-400">(optional)</span>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Street address"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="City"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 col-span-1 transition"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={addressState}
                    onChange={(e) => setAddressState(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={addressZip}
                    onChange={(e) => setAddressZip(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
                  />
                </div>

                {/* Notes */}
                <textarea
                  rows={2}
                  placeholder="Notes for provider (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none transition"
                />
              </div>
            </section>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── Summary + Confirm ──────────────────────────────────────────── */}
          {selectedDate && selectedSlot && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Service</span>
                <span className="font-semibold text-slate-900">{serviceName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Provider</span>
                <span className="font-semibold text-slate-900">{providerName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Date</span>
                <span className="font-semibold text-slate-900">
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Time</span>
                <span className="font-semibold text-slate-900">{selectedSlot.label}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200 mt-1">
                <span className="font-bold">Estimated Price</span>
                <span className="font-bold text-teal-700">${servicePrice}</span>
              </div>
            </div>
          )}

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <div className="flex gap-3 pb-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBook}
              disabled={!canBook}
              className={`
                flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2
                ${canBook
                  ? "bg-teal-600 text-white hover:bg-teal-700 shadow-lg shadow-teal-200 active:scale-[0.98]"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"}
              `}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Booking…
                </>
              ) : (
                "Confirm Booking"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
