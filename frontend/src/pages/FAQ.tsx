import React, { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  emoji: string;
  items: FAQItem[];
}

const faqData: FAQSection[] = [
  {
    title: "For Customers",
    emoji: "🏠",
    items: [
      {
        question: "How do I book a service?",
        answer:
          "Browse available service categories on the home page, select the type of service you need, and choose a verified provider near you. Pick a time slot that works for you and confirm your booking — it's that simple!",
      },
      {
        question: "What payment methods are accepted?",
        answer:
          "We accept all major credit and debit cards through our secure Stripe payment gateway. Your card details are never stored on our servers — all transactions are encrypted and processed by Stripe.",
      },
      {
        question: "Can I cancel my booking?",
        answer:
          "Yes, you can cancel a booking before the provider has started the service. Go to 'My Bookings' in your dashboard, select the booking, and click 'Cancel'. Please note that cancellation policies may vary depending on how close to the appointment time you cancel.",
      },
      {
        question: "How do I leave a review after a service?",
        answer:
          "Once your booking is marked as 'Completed', you will see a 'Leave a Review' option in your bookings dashboard. You can rate your experience from 1 to 5 stars and leave a written comment to help other customers.",
      },
      {
        question: "What if the provider does not show up?",
        answer:
          "If a provider fails to show up for your appointment, please submit a complaint through the 'Support' button in your dashboard. Our support team will investigate the issue and process a full refund if applicable.",
      },
      {
        question: "Are all service providers verified?",
        answer:
          "Yes! Every provider on ServiceHub goes through a multi-step verification process that includes ID verification, face matching, and a background check against the National Sex Offender Public Website (NSOPW). You can trust that the professionals you invite into your home have been thoroughly screened.",
      },
    ],
  },
  {
    title: "For Providers",
    emoji: "🔧",
    items: [
      {
        question: "How do I register as a service provider?",
        answer:
          "Click 'Get Started' on the home page and choose 'Register as Provider'. You will need to complete your profile with your business details, the services you offer, and your pricing. You will then be guided through the verification process.",
      },
      {
        question: "What does the verification process involve?",
        answer:
          "Verification involves three steps: (1) Uploading a valid US government-issued ID, (2) Taking a selfie for face matching against your ID, and (3) An automated background check against the NSOPW registry. Once verified, a badge will appear on your profile.",
      },
      {
        question: "How do I manage my bookings?",
        answer:
          "Log in and go to your Provider Dashboard. Under the 'Bookings' tab you can view all upcoming, in-progress, and completed bookings. You can accept or reject new booking requests from there.",
      },
      {
        question: "When and how do I get paid?",
        answer:
          "Payments are processed through Stripe. Once a booking is marked as completed, the payout (minus the 15% platform commission) is initiated to your registered bank account. Payouts typically arrive within 2–3 business days.",
      },
      {
        question: "What happens if a customer files a complaint against me?",
        answer:
          "Our support team will reach out to both parties to understand the situation. You will have the opportunity to provide your side of the story. Decisions are made fairly and are based on the evidence provided by both sides.",
      },
    ],
  },
  {
    title: "General",
    emoji: "💡",
    items: [
      {
        question: "What is ServiceHub?",
        answer:
          "ServiceHub is an AI-powered home services marketplace connecting verified homeowners with verified, background-checked service professionals across the United States. We cover Plumbing, Electrical, Cleaning, and Pest Control services.",
      },
      {
        question: "Which cities is ServiceHub available in?",
        answer:
          "ServiceHub is currently available nationwide across the United States. Coverage may vary by specific zip code. You can check availability by entering your address when searching for providers.",
      },
      {
        question: "Is my personal information safe?",
        answer:
          "Absolutely. We take data privacy seriously. All personal data is encrypted and stored securely. We never sell your information to third parties. Authentication is handled by Supabase, a secure and industry-standard auth provider.",
      },
      {
        question: "How do I contact support?",
        answer:
          "You can reach our support team by clicking the 'Support' button in your dashboard after logging in. Fill out the complaint or inquiry form and our team will respond within 24 hours.",
      },
      {
        question: "What is the platform commission?",
        answer:
          "ServiceHub charges a 15% commission on each completed booking. This fee covers platform maintenance, payment processing, customer support, and the cost of provider verification.",
      },
    ],
  },
];

export const FAQ: React.FC = () => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)]">
      {/* Hero */}
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 border border-white/60 shadow-sm backdrop-blur-md mb-8">
            <HelpCircle size={14} className="text-teal-500" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Help Center
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tighter mb-6 leading-[0.95]">
            Frequently Asked{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500">
              Questions
            </span>
          </h1>
          <p className="text-xl text-slate-500 font-medium leading-relaxed">
            Everything you need to know about ServiceHub. Can't find your
            answer? Contact our support team.
          </p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-4 space-y-12">
          {faqData.map((section) => (
            <div key={section.title}>
              {/* Section heading */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{section.emoji}</span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {section.title}
                </h2>
              </div>

              {/* Accordion items */}
              <div className="space-y-3">
                {section.items.map((item, index) => {
                  const key = `${section.title}-${index}`;
                  const isOpen = openItems[key] ?? false;

                  return (
                    <div
                      key={key}
                      className="glass-panel rounded-2xl overflow-hidden transition-all duration-300"
                    >
                      <button
                        onClick={() => toggleItem(key)}
                        className="w-full flex items-center justify-between px-6 py-5 text-left"
                      >
                        <span className="font-semibold text-slate-800 pr-4">
                          {item.question}
                        </span>
                        {isOpen ? (
                          <ChevronUp
                            size={18}
                            className="text-teal-600 flex-shrink-0"
                          />
                        ) : (
                          <ChevronDown
                            size={18}
                            className="text-slate-400 flex-shrink-0"
                          />
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-6 pb-5 text-slate-500 leading-relaxed border-t border-slate-100/60 pt-4">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-4">
          <div className="glass-panel rounded-[2.5rem] p-10 text-center">
            <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">
              Still have questions?
            </h3>
            <p className="text-slate-500 font-medium mb-6">
              Log in to your account and use the <strong>Support</strong> button
              in your dashboard to submit a ticket. Our team will respond within
              24 hours.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
