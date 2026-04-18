import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, ChevronDown, Send, MessageCircle } from "lucide-react";
import type { User, Provider } from "../../types";
import { UserRole } from "../../types";
import fetchApi from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuickReply {
  label: string;
  value: string;
}

interface DummyOrder {
  id: string;
  serviceCategory: string;
  serviceIcon: string;
  providerName: string;
  date: string;
  status: "REQUESTED" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  totalPrice: number;
}

// Real booking data shape from GET /api/chatbot/context
interface RealBooking {
  id: string;
  status: string;
  scheduled_at: string;
  total_price: number;
  notes?: string | null;
  service?: { name: string } | null;
  provider?: { business_name: string } | null;
  customer?: { full_name: string } | null;
}

interface ChatbotContext {
  role: string;
  bookings: RealBooking[];
}

interface ServiceItem {
  name: string;
}

interface ServiceGroup {
  category: string;
  icon: string;
  color: string;
  services: ServiceItem[];
}

interface FAQEntry {
  question: string;
  answer: string;
  keywords: string[];
  audience: "customer" | "provider" | "both";
}

interface FAQMatch {
  question: string;
  answer: string;
}

interface UserMessage {
  id: string;
  sender: "user";
  text: string;
  timestamp: Date;
}

type BotContentType =
  | "text"
  | "order-cards"
  | "service-grid"
  | "faq-answer"
  | "quick-replies";

interface BotMessage {
  id: string;
  sender: "bot";
  timestamp: Date;
  contentType: BotContentType;
  text: string;
  orders?: DummyOrder[];
  services?: ServiceGroup[];
  faqAnswer?: FAQMatch;
  quickReplies?: QuickReply[];
}

type ChatMessage = UserMessage | BotMessage;

type Intent =
  | "greeting"
  | "my_orders"
  | "services"
  | "faq_search"
  | "provider_earnings"
  | "provider_bookings"
  | "fallback";

// ─── Data ────────────────────────────────────────────────────────────────────

const SERVICE_ICON_MAP: Record<string, string> = {
  cleaning: "🧹",
  plumbing: "🔧",
  electrical: "⚡",
  electric: "⚡",
  pest: "🐛",
};

function getServiceIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(SERVICE_ICON_MAP)) {
    if (lower.includes(key)) return icon;
  }
  return "🔧";
}

const STATUS_MAP: Record<string, DummyOrder["status"]> = {
  pending: "REQUESTED",
  confirmed: "ACCEPTED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

function mapBookingToOrder(b: RealBooking): DummyOrder {
  const serviceName = b.service?.name ?? "Service";
  return {
    id: `#${b.id.slice(-6).toUpperCase()}`,
    serviceCategory: serviceName,
    serviceIcon: getServiceIcon(serviceName),
    providerName: b.provider?.business_name ?? b.customer?.full_name ?? "Provider",
    date: new Date(b.scheduled_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    status: STATUS_MAP[b.status] ?? "REQUESTED",
    totalPrice: b.total_price ?? 0,
  };
}

const SERVICE_GROUPS: ServiceGroup[] = [
  {
    category: "Cleaning",
    icon: "🧹",
    color: "from-sky-400 to-blue-500",
    services: [
      { name: "Bathroom Cleaning" },
      { name: "Kitchen Cleaning" },
      { name: "Living Room Cleaning" },
    ],
  },
  {
    category: "Plumbing",
    icon: "🔧",
    color: "from-slate-500 to-slate-700",
    services: [
      { name: "Pipe Repair" },
      { name: "Drain Cleaning" },
      { name: "Leak Fix" },
    ],
  },
  {
    category: "Electrical",
    icon: "⚡",
    color: "from-amber-400 to-orange-500",
    services: [
      { name: "Wiring Check" },
      { name: "Light Fixture Install" },
      { name: "Circuit Breaker Service" },
    ],
  },
  {
    category: "Pest Control",
    icon: "🐛",
    color: "from-emerald-500 to-teal-600",
    services: [
      { name: "Pest Inspection" },
      { name: "Cockroach Treatment" },
      { name: "Termite Treatment" },
    ],
  },
];

const FAQ_DATA: FAQEntry[] = [
  {
    question: "How do I book a service?",
    answer:
      "Browse the home page, pick a service category, choose a verified provider near you, select a time slot, and confirm. That's it!",
    keywords: ["how to book", "book a service", "schedule", "reserve", "appointment", "appoint"],
    audience: "customer",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "We accept all major credit and debit cards through Stripe. Your card details are never stored on our servers — all transactions are encrypted.",
    keywords: ["pay", "payment", "card", "credit", "debit", "stripe", "billing", "charge"],
    audience: "both",
  },
  {
    question: "Can I cancel my booking?",
    answer:
      "Yes — go to 'My Bookings' in your dashboard, select the booking, and click 'Cancel'. Cancellation policies vary based on how close to the appointment you cancel.",
    keywords: ["cancel", "cancellation", "refund", "undo", "stop booking"],
    audience: "customer",
  },
  {
    question: "How do I leave a review?",
    answer:
      "After a booking is marked Completed, a 'Leave a Review' option appears in your dashboard. Rate 1–5 stars and leave a comment.",
    keywords: ["review", "rate", "rating", "feedback", "star", "comment"],
    audience: "customer",
  },
  {
    question: "What if my provider doesn't show up?",
    answer:
      "Submit a complaint through the 'Support' button in your dashboard. Our team will investigate and process a full refund if applicable.",
    keywords: ["no show", "didn't show", "missing", "absent", "late", "refund", "didn't arrive"],
    audience: "customer",
  },
  {
    question: "Are providers verified?",
    answer:
      "Yes! Every provider goes through ID verification, face matching, and an NSOPW background check before being listed on the platform.",
    keywords: ["verif", "verified", "background", "safe", "trust", "check", "screened", "legit"],
    audience: "both",
  },
  {
    question: "How do I register as a provider?",
    answer:
      "Click 'Get Started' → 'Register as Provider'. Fill in your business details, services, and pricing, then complete the verification process.",
    keywords: ["register", "sign up", "join", "become provider", "create account", "onboard"],
    audience: "provider",
  },
  {
    question: "What does verification involve?",
    answer:
      "Three steps: (1) Upload a valid US government-issued ID, (2) Take a selfie for face matching, (3) Automated NSOPW background check. A badge appears on your profile once verified.",
    keywords: ["verif", "process", "id", "document", "selfie", "badge", "background check"],
    audience: "provider",
  },
  {
    question: "How do I manage my bookings as a provider?",
    answer:
      "Log in and open your Provider Dashboard → 'Bookings' tab. You can view upcoming, in-progress, and completed bookings, and accept or reject new requests.",
    keywords: ["manage", "accept", "reject", "dashboard", "incoming", "request", "schedule"],
    audience: "provider",
  },
  {
    question: "When and how do I get paid?",
    answer:
      "Payments are via Stripe. Once a booking is marked Completed, a payout (minus the 15% platform commission) is sent to your bank within 2–3 business days.",
    keywords: ["paid", "payout", "earnings", "salary", "money", "withdraw", "bank", "commission"],
    audience: "provider",
  },
  {
    question: "What if a customer complains about me?",
    answer:
      "Our support team contacts both parties. You get to share your side — decisions are made fairly based on evidence from both sides.",
    keywords: ["complaint", "dispute", "report", "issue", "claim", "appeal"],
    audience: "provider",
  },
  {
    question: "What is ServiceHub?",
    answer:
      "ServiceHub is a home services marketplace connecting homeowners with verified professionals for Plumbing, Electrical, Cleaning, and Pest Control across the US.",
    keywords: ["what is", "about", "servicehub", "platform", "marketplace", "app"],
    audience: "both",
  },
  {
    question: "Which cities is ServiceHub available in?",
    answer:
      "ServiceHub is available nationwide across the US. Coverage may vary by zip code — check availability when searching for providers.",
    keywords: ["city", "cities", "location", "available", "where", "area", "zip", "coverage"],
    audience: "both",
  },
  {
    question: "Is my personal information safe?",
    answer:
      "Absolutely. All data is encrypted and stored securely. We never sell your information to third parties. Auth is handled by Supabase.",
    keywords: ["safe", "security", "privacy", "data", "personal", "secure", "private", "protect"],
    audience: "both",
  },
  {
    question: "How do I contact support?",
    answer:
      "Click the 'Support' button in the top navigation after logging in. Fill out the form and our team will respond within 24 hours.",
    keywords: ["support", "contact", "agent", "human", "ticket", "reach out", "help desk"],
    audience: "both",
  },
  {
    question: "What is the platform commission?",
    answer:
      "ServiceHub charges a 15% commission on each completed booking. This covers platform maintenance, payment processing, support, and provider verification.",
    keywords: ["commission", "fee", "15%", "cut", "platform fee", "charge", "deduct"],
    audience: "both",
  },
];

const CUSTOMER_QUICK_REPLIES: QuickReply[] = [
  { label: "📦 My Orders", value: "my orders" },
  { label: "🛠️ Services", value: "show services" },
  { label: "💳 Payment Info", value: "payment methods" },
  { label: "❌ Cancel Booking", value: "cancel booking" },
  { label: "🎧 Contact Support", value: "contact support" },
];

const PROVIDER_QUICK_REPLIES: QuickReply[] = [
  { label: "💰 My Earnings", value: "earnings" },
  { label: "📅 My Bookings", value: "manage bookings" },
  { label: "✅ Verification", value: "verification process" },
  { label: "🛠️ Services Offered", value: "show services" },
  { label: "🎧 Contact Support", value: "contact support" },
];

const GUEST_QUICK_REPLIES: QuickReply[] = [
  { label: "🛠️ Services", value: "show services" },
  { label: "❓ How It Works", value: "how does it work" },
  { label: "🔐 How to Book", value: "how to book" },
];

// ─── Pure functions ───────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function searchFAQ(query: string, role: string | null): FAQEntry | null {
  const q = query.toLowerCase();
  let bestMatch: FAQEntry | null = null;
  let bestScore = 0;

  for (const entry of FAQ_DATA) {
    if (entry.audience !== "both") {
      if (role === "customer" && entry.audience === "provider") continue;
      if (role === "provider" && entry.audience === "customer") continue;
    }
    let score = 0;
    for (const kw of entry.keywords) {
      // Use word-boundary regex so "book" doesn't match inside "booking"
      // Multi-word phrases match as-is; single words use \b
      const pattern = kw.includes(" ")
        ? new RegExp(kw.replace(/\s+/g, "\\s+"))
        : new RegExp(`\\b${kw}\\b`);
      if (pattern.test(q)) {
        // Phrase keywords (more specific) score 2; single-word keywords score 1
        score += kw.includes(" ") ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestScore >= 1 ? bestMatch : null;
}

function detectIntent(input: string, role: string | null): Intent {
  const q = input.toLowerCase().trim();

  if (/^(hi|hey|hello|howdy|sup|yo|good morning|good afternoon|start)\b/.test(q)) {
    return "greeting";
  }
  if (
    /\b(my orders|view.*booking|order status|booking status|track.*order|where.*order)\b/.test(q) &&
    !/\b(cancel|refund|delete|remove)\b/.test(q)
  ) {
    return "my_orders";
  }
  if (/\b(service|services|what.*offer|offer|catalog|cleaning|plumbing|electrical|pest|available service)\b/.test(q)) {
    return "services";
  }
  if (role === "provider") {
    if (/\b(earn|earning|payout|commission|salary|money|revenue|income|15%|pay me|get paid)\b/.test(q)) {
      return "provider_earnings";
    }
    if (/\b(manage booking|incoming|accept|reject|booking request)\b/.test(q)) {
      return "provider_bookings";
    }
  }
  const match = searchFAQ(q, role);
  if (match) return "faq_search";

  return "fallback";
}

function generateResponse(
  intent: Intent,
  input: string,
  user: User | Provider | null,
  realBookings?: RealBooking[] | null,
): Omit<BotMessage, "id" | "timestamp" | "sender"> {
  const role = user?.role?.toLowerCase() ?? null;
  const name = user?.name?.split(" ")[0] || "there";

  switch (intent) {
    case "greeting":
      return {
        contentType: "quick-replies",
        text:
          role === "provider"
            ? `Hi ${name}! 👋 I'm your ServiceHub assistant. How can I help you today?`
            : user
            ? `Hi ${name}! 👋 I'm here to help. What would you like to do?`
            : "👋 Hi! I'm the ServiceHub assistant. Here's what I can help with:",
        quickReplies:
          role === "provider"
            ? PROVIDER_QUICK_REPLIES
            : user
            ? CUSTOMER_QUICK_REPLIES
            : GUEST_QUICK_REPLIES,
      };

    case "my_orders":
      if (!user) {
        return {
          contentType: "quick-replies",
          text: "You need to be logged in to view your orders. Please sign in first.",
          quickReplies: [
            { label: "🔐 Go to Login", value: "how to book" },
            { label: "🛠️ Browse Services", value: "show services" },
          ],
        };
      }
      if (role === "provider") {
        // Provider: show their scheduled jobs if available
        if (realBookings && realBookings.length > 0) {
          return {
            contentType: "order-cards",
            text: `You have ${realBookings.length} booking${realBookings.length !== 1 ? "s" : ""} scheduled:`,
            orders: realBookings.map(mapBookingToOrder),
            quickReplies: [
              { label: "💰 Earnings Info", value: "earnings" },
              { label: "❓ More Help", value: "help" },
            ],
          };
        }
        if (realBookings && realBookings.length === 0) {
          return {
            contentType: "quick-replies",
            text: "You have no bookings yet. When customers book your services, they'll appear here.",
            quickReplies: [
              { label: "💰 Earnings Info", value: "earnings" },
              { label: "🛠️ Services Offered", value: "show services" },
            ],
          };
        }
        return {
          contentType: "faq-answer",
          text: "As a provider, you manage bookings from your dashboard:",
          faqAnswer: {
            question: "How do I manage my bookings?",
            answer:
              "Open your Provider Dashboard → Bookings tab. You can view all upcoming and past bookings, and accept or reject new requests from customers.",
          },
          quickReplies: [{ label: "💰 Earnings Info", value: "earnings" }],
        };
      }
      // Customer: show real bookings if fetched
      if (realBookings && realBookings.length === 0) {
        return {
          contentType: "quick-replies",
          text: "You don't have any bookings yet. Browse our services to get started!",
          quickReplies: [
            { label: "🛠️ Browse Services", value: "show services" },
            { label: "❓ How to Book", value: "how to book" },
          ],
        };
      }
      if (realBookings && realBookings.length > 0) {
        return {
          contentType: "order-cards",
          text: `Here are your ${realBookings.length} booking${realBookings.length !== 1 ? "s" : ""}:`,
          orders: realBookings.map(mapBookingToOrder),
          quickReplies: [
            { label: "🛠️ Browse Services", value: "show services" },
            { label: "❓ Cancel a Booking", value: "cancel booking" },
          ],
        };
      }
      // Fallback if fetch failed or not attempted
      return {
        contentType: "quick-replies",
        text: "Unable to load your bookings right now. Please try again.",
        quickReplies: [
          { label: "🔄 Try Again", value: "my orders" },
          { label: "🛠️ Browse Services", value: "show services" },
        ],
      };

    case "services":
      return {
        contentType: "service-grid",
        text: "Here's everything we offer:",
        services: SERVICE_GROUPS,
        quickReplies: [
          { label: "📦 My Orders", value: "my orders" },
          { label: "❓ How to Book", value: "how to book" },
        ],
      };

    case "faq_search": {
      const match = searchFAQ(input, role)!;
      return {
        contentType: "faq-answer",
        text: "Here's what I found:",
        faqAnswer: { question: match.question, answer: match.answer },
        quickReplies: [
          { label: "🔍 Ask another question", value: "help" },
          { label: "🛠️ View Services", value: "show services" },
        ],
      };
    }

    case "provider_earnings":
      return {
        contentType: "faq-answer",
        text: "Here's how earnings work:",
        faqAnswer: {
          question: "When and how do I get paid?",
          answer:
            "Payouts are via Stripe. Once a booking is marked Completed, you receive the amount minus the 15% platform commission within 2–3 business days to your registered bank account.",
        },
        quickReplies: [
          { label: "📅 My Bookings", value: "manage bookings" },
          { label: "💡 More Questions", value: "help" },
        ],
      };

    case "provider_bookings":
      if (realBookings && realBookings.length > 0) {
        return {
          contentType: "order-cards",
          text: `You have ${realBookings.length} booking${realBookings.length !== 1 ? "s" : ""} from customers:`,
          orders: realBookings.map(mapBookingToOrder),
          quickReplies: [
            { label: "💰 Earnings Info", value: "earnings" },
            { label: "❓ More Help", value: "help" },
          ],
        };
      }
      if (realBookings && realBookings.length === 0) {
        return {
          contentType: "quick-replies",
          text: "No incoming bookings yet. Once customers book your services, they'll appear here.",
          quickReplies: [
            { label: "💰 Earnings Info", value: "earnings" },
            { label: "🛠️ Services Offered", value: "show services" },
          ],
        };
      }
      return {
        contentType: "faq-answer",
        text: "Managing your bookings:",
        faqAnswer: {
          question: "How do I manage bookings as a provider?",
          answer:
            "Open your Provider Dashboard → Bookings tab. View all upcoming and past bookings, and accept or reject new requests from customers in real time.",
        },
        quickReplies: [
          { label: "💰 Earnings Info", value: "earnings" },
          { label: "❓ More Questions", value: "help" },
        ],
      };

    default:
      return {
        contentType: "quick-replies",
        text: "I'm not sure I caught that. Here are some things I can help with:",
        quickReplies:
          role === "provider"
            ? PROVIDER_QUICK_REPLIES
            : user
            ? CUSTOMER_QUICK_REPLIES
            : GUEST_QUICK_REPLIES,
      };
  }
}

function getWelcomeMessage(user: User | Provider | null): BotMessage {
  const role = user?.role?.toLowerCase();
  const name = user?.name?.split(" ")[0];

  const text = !user
    ? "👋 Hi! I'm the ServiceHub assistant. I can help you explore services, find answers, and more."
    : role === "provider"
    ? `👋 Welcome back, ${name}! I can help with your bookings, earnings, and platform questions.`
    : `👋 Hello, ${name}! I can show your orders, browse services, or answer any questions.`;

  return {
    id: generateId(),
    sender: "bot",
    timestamp: new Date(),
    contentType: "quick-replies",
    text,
    quickReplies:
      role === "provider"
        ? PROVIDER_QUICK_REPLIES
        : user
        ? CUSTOMER_QUICK_REPLIES
        : GUEST_QUICK_REPLIES,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 border border-teal-200 flex items-center justify-center text-sm shrink-0">
        🤖
      </div>
      <div className="bg-white/70 border border-white/60 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          <span
            className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<DummyOrder["status"], string> = {
  REQUESTED: "bg-amber-50 text-amber-700 border border-amber-200",
  ACCEPTED: "bg-teal-50 text-teal-700 border border-teal-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CANCELLED: "bg-slate-50 text-slate-500 border border-slate-200",
};

function OrderCard({ order }: { order: DummyOrder }) {
  return (
    <div className="flex items-center gap-3 bg-white/60 rounded-xl px-3 py-2.5 border border-white/80 shadow-sm">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-lg shrink-0">
        {order.serviceIcon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{order.serviceCategory}</p>
        <p className="text-[11px] text-slate-500 truncate">{order.providerName}</p>
        <p className="text-[10px] text-slate-400">{order.date}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[order.status]}`}>
          {order.status}
        </span>
        <span className="text-xs font-bold text-slate-700">${order.totalPrice}</span>
      </div>
    </div>
  );
}

function ServiceGrid({ groups }: { groups: ServiceGroup[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map((g) => (
        <div
          key={g.category}
          className="bg-white/60 rounded-xl p-2.5 border border-white/80 shadow-sm"
        >
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${g.color} flex items-center justify-center text-base mb-1.5`}
          >
            {g.icon}
          </div>
          <p className="text-[11px] font-bold text-slate-800 mb-1">{g.category}</p>
          <ul className="space-y-0.5">
            {g.services.map((s) => (
              <li key={s.name} className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-teal-400 shrink-0" />
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FAQAnswerCard({ match }: { match: FAQMatch }) {
  return (
    <div className="bg-teal-50/70 border-l-2 border-teal-400 rounded-r-xl px-3 py-2.5">
      <p className="text-[11px] font-bold text-teal-700 mb-1">Q: {match.question}</p>
      <p className="text-[11px] text-slate-600 leading-relaxed">{match.answer}</p>
    </div>
  );
}

function QuickReplies({
  replies,
  onSelect,
}: {
  replies: QuickReply[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {replies.map((r) => (
        <button
          key={r.value}
          onClick={() => onSelect(r.value)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/80 border border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition-colors"
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onQuickReply,
}: {
  message: ChatMessage;
  onQuickReply: (value: string) => void;
}) {
  if (message.sender === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm shadow-teal-500/20">
            {message.text}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 text-right">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    );
  }

  // Bot message
  const bot = message as BotMessage;
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 border border-teal-200 flex items-center justify-center text-sm shrink-0 mb-4">
        🤖
      </div>
      <div className="max-w-[90%]">
        <div className="bg-white/70 border border-white/60 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm space-y-2">
          {bot.text && (
            <p className="text-sm text-slate-700">{bot.text}</p>
          )}
          {bot.contentType === "order-cards" && bot.orders && (
            <div className="space-y-1.5">
              {bot.orders.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          )}
          {bot.contentType === "service-grid" && bot.services && (
            <ServiceGrid groups={bot.services} />
          )}
          {bot.contentType === "faq-answer" && bot.faqAnswer && (
            <FAQAnswerCard match={bot.faqAnswer} />
          )}
          {bot.quickReplies && bot.quickReplies.length > 0 && (
            <QuickReplies replies={bot.quickReplies} onSelect={onQuickReply} />
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 ml-1">
          {bot.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ChatbotProps {
  user: User | Provider | null;
  /** Opens the visual damage assessment flow (hash route). */
  onOpenVisualDamage: () => void;
}

export const Chatbot: React.FC<ChatbotProps> = ({
  user,
  onOpenVisualDamage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setIsOpen(false);
    }, 200);
  }, []);

  // Push welcome message on first open (wrapped in function to satisfy set-state-in-effect rule)
  useEffect(() => {
    function init() {
      setMessages((prev) =>
        prev.length === 0 ? [getWelcomeMessage(user)] : prev,
      );
    }
    if (isOpen) init();
  }, [isOpen, user]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleClose]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: UserMessage = {
      id: generateId(),
      sender: "user",
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev.slice(-49), userMsg]);
    setInputValue("");
    setIsTyping(true);

    const role = user?.role?.toLowerCase() ?? null;
    const intent = detectIntent(text, role);

    // Fetch real booking data for order/booking intents
    let realBookings: RealBooking[] | null = null;
    if (user && (intent === "my_orders" || intent === "provider_bookings")) {
      try {
        const result = await fetchApi<ChatbotContext>("/chatbot/context");
        if (result.success && result.data) {
          const ctx = result.data as unknown as ChatbotContext;
          realBookings = ctx.bookings ?? [];
        }
      } catch {
        // realBookings stays null → fallback message shown
      }
    }

    // Small delay for a natural conversational feel
    await new Promise<void>((resolve) => setTimeout(resolve, 600));

    const payload = generateResponse(intent, text, user, realBookings);
    const botMsg: BotMessage = {
      id: generateId(),
      sender: "bot",
      timestamp: new Date(),
      ...payload,
    };
    setMessages((prev) => [...prev.slice(-49), botMsg]);
    setIsTyping(false);
  };

  const roleBadge = user
    ? user.role === UserRole.PROVIDER
      ? { label: "Provider", cls: "bg-teal-100 text-teal-700" }
      : { label: "Customer", cls: "bg-sky-100 text-sky-700" }
    : null;

  const showVisualDamageEntry =
    user != null && String(user.role).toLowerCase() === "customer";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="ServiceHub Assistant"
          aria-modal="false"
          className={[
            "mb-3 w-80 sm:w-[360px] max-h-[520px]",
            "bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl shadow-black/10",
            "rounded-2xl flex flex-col overflow-hidden",
            isClosing
              ? "animate-out slide-out-to-bottom-4 fade-out duration-200"
              : "animate-in slide-in-from-bottom-4 fade-in duration-300",
          ].join(" ")}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-none">ServiceHub Assistant</p>
              {roleBadge && (
                <span
                  className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge.cls}`}
                >
                  {roleBadge.label}
                </span>
              )}
            </div>
            <button
              onClick={handleClose}
              aria-label="Close chat assistant"
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onQuickReply={handleSendMessage}
              />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/40 bg-white/40 px-3 py-2.5 flex items-center gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(inputValue);
                }
              }}
              disabled={isTyping}
              placeholder="Ask me anything…"
              aria-label="Type your message"
              className="flex-1 bg-white/60 border border-white/60 rounded-full px-4 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40 disabled:opacity-50 transition-all"
            />
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send message"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-sm shadow-teal-500/30 disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {showVisualDamageEntry && (
        <button
          type="button"
          onClick={onOpenVisualDamage}
          aria-label="Open visual damage assessment"
          title="Visual damage assessment"
          className="mb-3 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/35 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-200 ring-2 ring-white/80"
        >
          <Camera className="w-6 h-6 text-white" aria-hidden />
        </button>
      )}

      {/* FAB button */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? "Close chat assistant" : "Open chat assistant"}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 shadow-lg shadow-teal-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-200"
      >
        {isOpen ? (
          <ChevronDown className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
};
