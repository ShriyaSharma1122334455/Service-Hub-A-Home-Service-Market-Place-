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

// LLM response shape from POST /api/chatbot/message
interface LLMResponse {
  text: string;
  contentType: BotContentType;
  faqAnswer: FAQMatch | null;
  quickReplies: QuickReply[] | null;
}

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

const CUSTOMER_QUICK_REPLIES: QuickReply[] = [
  { label: "📦 My Orders", value: "Show me my orders" },
  { label: "🛠️ Services", value: "What services do you offer?" },
  { label: "💳 Payment Info", value: "What payment methods are accepted?" },
  { label: "❌ Cancel Booking", value: "How do I cancel a booking?" },
  { label: "🎧 Contact Support", value: "How do I contact support?" },
];

const PROVIDER_QUICK_REPLIES: QuickReply[] = [
  { label: "💰 My Earnings", value: "How do earnings work?" },
  { label: "📅 My Bookings", value: "Show me my bookings" },
  { label: "✅ Verification", value: "What is the verification process?" },
  { label: "🛠️ Services Offered", value: "What services does ServiceHub offer?" },
  { label: "🎧 Contact Support", value: "How do I contact support?" },
];

const GUEST_QUICK_REPLIES: QuickReply[] = [
  { label: "🛠️ Services", value: "What services do you offer?" },
  { label: "❓ How It Works", value: "How does ServiceHub work?" },
  { label: "🔐 How to Book", value: "How do I book a service?" },
];

// ─── Pure functions ───────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function staticWelcome(user: User | Provider | null): BotMessage {
  const role = user?.role?.toLowerCase();
  const name = user?.name?.split(" ")[0];

  const text = !user
    ? "👋 Hi! I'm the ServiceHub assistant. Ask me anything about our services, bookings, payments, or how the platform works."
    : role === "provider"
    ? `👋 Welcome back, ${name}! Ask me about your bookings, earnings, verification, or anything else on ServiceHub.`
    : `👋 Hello, ${name}! I can help with your orders, browse services, or answer questions about ServiceHub.`;

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

function fallbackBotMessage(user: User | Provider | null): BotMessage {
  const role = user?.role?.toLowerCase();
  return {
    id: generateId(),
    sender: "bot",
    timestamp: new Date(),
    contentType: "quick-replies",
    text: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
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
          {bot.contentType === "order-cards" && bot.orders && bot.orders.length > 0 && (
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
  // Multi-turn conversation history (last 6 turns sent to LLM)
  const conversationHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

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

  // Push welcome message on first open
  useEffect(() => {
    function init() {
      setMessages((prev) =>
        prev.length === 0 ? [staticWelcome(user)] : prev,
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

    const trimmed = text.trim();
    const userMsg: UserMessage = {
      id: generateId(),
      sender: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev.slice(-49), userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      const result = await fetchApi<LLMResponse>("/chatbot/message", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: conversationHistory.current.slice(-6),
        }),
      });

      if (!result.success || !result.data) {
        setMessages((prev) => [...prev.slice(-49), fallbackBotMessage(user)]);
        return;
      }

      const payload = result.data as LLMResponse;

      const botMsg: BotMessage = {
        id: generateId(),
        sender: "bot",
        timestamp: new Date(),
        contentType: payload.contentType ?? "text",
        text: payload.text ?? "",
        faqAnswer: payload.faqAnswer ?? undefined,
        quickReplies: payload.quickReplies ?? undefined,
      };

      // Service grid: inject the static service catalog
      if (botMsg.contentType === "service-grid") {
        botMsg.services = SERVICE_GROUPS;
      }

      // Order cards: AI signalled it; fetch real bookings if logged in
      if (botMsg.contentType === "order-cards") {
        if (user) {
          try {
            const ctxRes = await fetchApi<ChatbotContext>("/chatbot/context");
            if (ctxRes.success && ctxRes.data) {
              const bookings = (ctxRes.data as ChatbotContext).bookings ?? [];
              botMsg.orders = bookings.map(mapBookingToOrder);
              if (bookings.length === 0) {
                // Re-frame as a friendly no-bookings reply
                botMsg.contentType = "quick-replies";
                botMsg.text =
                  user.role?.toLowerCase() === "provider"
                    ? "You don't have any bookings yet. They'll appear here once customers book your services."
                    : "You don't have any bookings yet. Browse services to get started!";
                botMsg.quickReplies = botMsg.quickReplies ?? [
                  { label: "🛠️ Browse Services", value: "What services do you offer?" },
                  { label: "❓ How to Book", value: "How do I book a service?" },
                ];
              }
            } else {
              botMsg.contentType = "quick-replies";
              botMsg.text =
                "Unable to load your bookings right now. Please try again in a moment.";
              botMsg.quickReplies = botMsg.quickReplies ?? [
                { label: "🔄 Try Again", value: "Show me my orders" },
              ];
            }
          } catch {
            botMsg.contentType = "quick-replies";
            botMsg.text =
              "Unable to load your bookings right now. Please try again in a moment.";
          }
        } else {
          // Guest asked for orders — redirect to sign in
          botMsg.contentType = "quick-replies";
          botMsg.text =
            "You need to sign in to view your orders. Once logged in, I can show your bookings here.";
          botMsg.quickReplies = botMsg.quickReplies ?? GUEST_QUICK_REPLIES;
        }
      }

      // Track history for multi-turn context
      conversationHistory.current.push({ role: "user", content: trimmed });
      conversationHistory.current.push({ role: "assistant", content: botMsg.text });
      // Cap memory to last 12 entries (6 turns)
      if (conversationHistory.current.length > 12) {
        conversationHistory.current = conversationHistory.current.slice(-12);
      }

      setMessages((prev) => [...prev.slice(-49), botMsg]);
    } catch {
      setMessages((prev) => [...prev.slice(-49), fallbackBotMessage(user)]);
    } finally {
      setIsTyping(false);
    }
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
