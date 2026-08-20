/**
 * ============================================================================
 *  ህይወት የቀዶ ህክምና ማዕከል — Hiwot Surgical Center
 *  Calming AI Voice Assistant — Single-file React App (App.jsx)
 * ============================================================================
 *
 *  DEPLOYMENT NOTES (Vite + Tailwind + Vercel):
 *  1. npm create vite@latest hiwot-surgical -- --template react
 *  2. npm install lucide-react
 *  3. npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
 *  4. tailwind.config.js -> content: ["./index.html","./src/**\/*.{js,jsx}"]
 *  5. src/index.css -> add:  @tailwind base; @tailwind components; @tailwind utilities;
 *  6. Replace src/App.jsx with this file. Import "./index.css" in main.jsx.
 *  7. Add a Vercel env var VITE_GEMINI_API_KEY with your Gemini API key
 *     (Google AI Studio -> generativelanguage.googleapis.com). Without a key,
 *     the assistant runs in a safe local "reassurance" fallback mode so the
 *     UI is always demoable.
 *  8. Deploy: vercel --prod
 *
 *  Where to wire the real Gemini Live endpoint:
 *   - See callGemini() below. Swap the REST call for the Gemini Live
 *     WebSocket endpoint (wss://generativelanguage.googleapis.com/...)
 *     for true streaming audio if/when you move off the STT/TTS fallback.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  PhoneCall,
  HeartPulse,
  ClipboardList,
  MapPin,
  Users2,
  Stethoscope,
  Send,
  X,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Droplets,
  Wind,
  Activity,
  Loader2,
} from "lucide-react";

/* ---------------------------------------------------------------------------
 * Gemini system instruction (kept verbatim as the operating contract for the
 * medical assistant persona — passed as the system_instruction on every call)
 * ------------------------------------------------------------------------- */
const SYSTEM_INSTRUCTION = `You are a warm, calm, highly polite, and reassuring AI Medical Assistant for Hiwot Surgical Center in Hosanna Menaheriya (50+ Doctors, 80+ Nurses).
1. ALWAYS detect the caller's language automatically (Amharic, English, Oromiffa, Guragigna, etc.) and respond immediately in that EXACT same language with a calm, comforting voice tone.
2. If the user is panicking or reporting an emergency, reassure them first, collect location/symptoms, dispatch data to the ambulance driver & doctor dashboard, and give simple step-by-step first-aid guidance.`;

/**
 * On a real Vite/Vercel deployment, replace this with:
 *   const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
 * Left as a plain mock constant here (no import.meta) so the file runs
 * standalone in any plain React sandbox, including the Claude Artifact
 * preview window, without a bundler-specific module system.
 */
const GEMINI_API_KEY = ""; // <-- put your Gemini API key here for local/prod testing

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

/* ---------------------------------------------------------------------------
 * Lightweight language heuristic for the demo (Ethiopic script vs Latin).
 * Swap for Gemini's own language field once the live endpoint is wired in.
 * ------------------------------------------------------------------------- */
function detectLanguage(text) {
  if (/[\u1200-\u137F]/.test(text)) return "am"; // Ethiopic block (Amharic/Guragigna share it)
  return "en";
}

const REASSURING_STATUS = {
  idle: "እረጋ ይበሉ፣ አብረንዎት ነን...",
  listening: "AI ዶክተር ረዳትዎ እያዳመጠዎት ነው...",
  thinking: "እያሰላሰለ ነው... በትንሽ ትዕግስት ይጠብቁ",
  speaking: "AI ዶክተር ረዳት እየመለሰ ነው...",
};

const FIRST_AID_TOPICS = [
  {
    id: "bleeding",
    icon: Droplets,
    title: "ደም መፍሰስ",
    color: "text-rose-600",
    bg: "bg-rose-50",
    steps: [
      "እረጋ ይበሉ፤ ቁስሉን በንፁህ ጨርቅ በጥብቅ ይጫኑ።",
      "የተጎዳውን የሰውነት ክፍል ከልብ ከፍ ያድርጉት።",
      "ጨርቁ ደም ከጠገበ አያውጡት፤ ሌላ ጨርቅ ላዩ ላይ ይጨምሩ።",
      "አምቡላንስ እስኪደርስ ግፊቱን አያቁሙ።",
    ],
  },
  {
    id: "burns",
    icon: Flame,
    title: "ቃጠሎ",
    color: "text-amber-600",
    bg: "bg-amber-50",
    steps: [
      "የተቃጠለውን ቦታ በቀዝቃዛ (በረዶ ያልሆነ) ውሃ ስር ለ10-15 ደቂቃ ያቀዝቅዙ።",
      "የተጣበቀ ልብስ ካለ በኃይል አይላቁ።",
      "ቅቤ ወይም የቤት ውስጥ ቅባት አይቀቡ።",
      "ቦታውን በንፁህ፣ ላላ ጨርቅ በቀስታ ይሸፍኑ።",
    ],
  },
  {
    id: "fainting",
    icon: Wind,
    title: "ራስን መሳት",
    color: "text-sky-600",
    bg: "bg-sky-50",
    steps: [
      "ሰውየውን በጀርባው ላይ አስተኝተው እግሮቹን ትንሽ ከፍ ያድርጉ።",
      "ትንፋሽ እንዲያገኝ ዙሪያውን ያስፉ፤ ጠባብ ልብስ ይላቁ።",
      "ንቃተ ህሊናው እስኪመለስ ምንም አያጠጡት/አያበሉት።",
      "ከ1 ደቂቃ በላይ ካልነቃ ወዲያውኑ አምቡላንስ ይደውሉ።",
    ],
  },
  {
    id: "choking",
    icon: Activity,
    title: "መታፈን",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    steps: [
      "ሰውየው ዝቅ ብሎ እንዲያጎነብስ ያድርጉ።",
      "በትከሻ ጫፎች መካከል በእጅ መዳፍ 5 ጊዜ ጠንከር አድርገው ይምቱት።",
      "ካልተሳካ ከእምብርት በላይ ይዘው ወደ ውስጥና ወደ ላይ ግፉት (Heimlich)።",
      "ካልተሻለ ወዲያውኑ አምቡላንስ ይደውሉ።",
    ],
  },
];

export default function App() {
  /* ---------------------------- Core state ---------------------------- */
  const [voiceState, setVoiceState] = useState("idle"); // idle | listening | thinking | speaking
  const [messages, setMessages] = useState([
    {
      role: "ai",
      lang: "am",
      text: "ሰላም እንኳን ደህና መጡ! እኔ የህይወት ቀዶ ህክምና ማዕከል AI ረዳት ነኝ። እረጋ ይበሉ፣ እዚህ ነኝ አብሬዎት። እንዴት ላግዝዎት?",
    },
  ]);
  const [textInput, setTextInput] = useState("");
  const [showFirstAid, setShowFirstAid] = useState(false);
  const [activeFirstAid, setActiveFirstAid] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [showAmbulance, setShowAmbulance] = useState(false);
  const [ambulanceStatus, setAmbulanceStatus] = useState("idle"); // idle | locating | dispatched
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [bookingSaved, setBookingSaved] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    name: "",
    phone: "",
    reason: "",
    department: "አጠቃላይ ክፍል",
  });

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceState]);

  /* ------------------------- Inject calming fonts ------------------------- */
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
    document.title = "ህይወት የቀዶ ህክምና ማዕከል | Hiwot Surgical Center";
    return () => document.head.removeChild(link);
  }, []);

  /* ------------------------------------------------------------------------
   * Gemini call — falls back to a calm, canned reply set if no API key is
   * configured, so the UI always works when demoed without a backend.
   * ---------------------------------------------------------------------- */
  const callGemini = useCallback(async (userText, lang) => {
    if (!GEMINI_API_KEY) {
      await new Promise((r) => setTimeout(r, 900));
      return lang === "am"
        ? "እየሰማዎት ነው፣ እረጋ ይበሉ። እባክዎ ምልክቶችዎን ወይም ያሉበትን ቦታ በዝርዝር ይንገሩኝ፣ ወዲያውኑ ከዶክተር ጋር አገናኝዎታለሁ።"
        : "I'm here with you, please stay calm. Could you tell me your symptoms or your location so I can connect you with a doctor right away?";
    }
    try {
      const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
        }),
      });
      const data = await res.json();
      return (
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        (lang === "am"
          ? "ይቅርታ፣ በድጋሚ መግለጽ ይችላሉ? እዚህ ነኝ አብሬዎት።"
          : "Sorry, could you say that again? I'm right here with you.")
      );
    } catch (e) {
      return lang === "am"
        ? "ግንኙነት ላይ ትንሽ መስተጓጎል ገጠመኝ፣ ነገር ግን አብሬዎት ነኝ። እባክዎ እንደገና ይሞክሩ።"
        : "I had trouble connecting, but I'm still here with you. Please try again.";
    }
  }, []);

  const sendMessage = useCallback(
    async (rawText) => {
      const text = rawText.trim();
      if (!text) return;
      const lang = detectLanguage(text);
      setMessages((m) => [...m, { role: "user", lang, text }]);
      setTextInput("");
      setVoiceState("thinking");
      const reply = await callGemini(text, lang);
      setMessages((m) => [...m, { role: "ai", lang, text: reply }]);
      setVoiceState("speaking");
      // simulate TTS speaking duration, then return to idle
      window.setTimeout(() => setVoiceState("idle"), 1800);
    },
    [callGemini]
  );

  /* ------------------------- Web Speech API (STT) ------------------------- */
  const toggleMic = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      setVoiceState("idle");
      return;
    }

    if (!SpeechRecognition) {
      sendMessage("(ድምጽ ማንበብ አልተደገፈም) — በጽሁፍ ይላኩ");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "am-ET";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const spoken = event.results[0][0].transcript;
      sendMessage(spoken);
    };
    recognition.onerror = () => setVoiceState("idle");
    recognition.onend = () => {
      setVoiceState((s) => (s === "listening" ? "idle" : s));
    };
    recognitionRef.current = recognition;
    setVoiceState("listening");
    recognition.start();
  }, [voiceState, sendMessage]);

  /* ------------------------------ Ambulance ------------------------------ */
  const handleAmbulanceCall = () => {
    setShowAmbulance(true);
    setAmbulanceStatus("locating");
    if (!navigator.geolocation) {
      setAmbulanceStatus("dispatched");
      setAmbulanceLocation({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude.toFixed(5),
          lng: pos.coords.longitude.toFixed(5),
        };
        setAmbulanceLocation(loc);
        // TODO: POST to real dispatch endpoint, e.g.:
        // fetch('/api/dispatch', { method:'POST', body: JSON.stringify({ loc, ts: Date.now() }) })
        window.setTimeout(() => setAmbulanceStatus("dispatched"), 1200);
      },
      () => {
        setAmbulanceStatus("dispatched");
        setAmbulanceLocation({ lat: null, lng: null });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  /* ------------------------------- Booking -------------------------------- */
  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!bookingForm.name || !bookingForm.phone) return;
    // TODO: POST to real dashboard endpoint, e.g.:
    // fetch('/api/bookings', { method:'POST', body: JSON.stringify(bookingForm) })
    setBookingSaved(true);
  };

  const isActive = voiceState === "listening" || voiceState === "speaking";

  return (
    <div className="min-h-screen w-full bg-[#F6FAF8] text-[#123B33] font-sans pb-32">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Ethiopic:wght@400;500;600;700&display=swap');
        :root { --brand-teal:#0F6659; --brand-emerald:#10B981; --brand-gold:#D9A441; --brand-ember:#C1462F; }
        .font-amharic { font-family: 'Noto Sans Ethiopic', 'Inter', sans-serif; }
        body { font-family: 'Inter', 'Noto Sans Ethiopic', sans-serif; }

        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 0.9; }
        }
        @keyframes breatheFast {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.14); opacity: 1; }
        }
        @keyframes ringFade {
          0% { transform: scale(0.9); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.35); }
          50% { box-shadow: 0 0 0 14px rgba(16,185,129,0); }
        }
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .anim-breathe { animation: breathe 3.2s ease-in-out infinite; }
        .anim-breathe-fast { animation: breatheFast 1.6s ease-in-out infinite; }
        .anim-ring { animation: ringFade 2.4s ease-out infinite; }
        .anim-ring-fast { animation: ringFade 1.3s ease-out infinite; }
        .anim-glow { animation: glowPulse 2.2s ease-in-out infinite; }
        .anim-in { animation: floatUp 0.35s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .anim-breathe, .anim-breathe-fast, .anim-ring, .anim-ring-fast, .anim-glow { animation: none; }
        }
      `}</style>

      {/* ============================== HEADER ============================== */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-emerald-100">
        <div className="max-w-md mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0F6659] to-[#10B981] flex items-center justify-center shadow-sm shrink-0">
                <Stethoscope className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
              <div>
                <h1 className="font-amharic font-bold text-[15px] leading-tight text-[#0F6659]">
                  ህይወት የቀዶ ህክምና ማዕከል
                </h1>
                <p className="text-[11px] text-emerald-700/70 flex items-center gap-1 font-amharic">
                  <MapPin className="w-3 h-3" /> ሆሳዕና፡ መናኸሪያ ሰፈር
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-1 rounded-full border border-emerald-100 font-amharic shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 anim-glow" />
              24/7 ዝግጁ
            </span>
          </div>

          <div className="flex gap-2 mt-3">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#0F6659] bg-emerald-50/80 px-2.5 py-1 rounded-full font-amharic">
              <Users2 className="w-3 h-3" /> 50+ ልዩ ሀኪሞች
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#0F6659] bg-emerald-50/80 px-2.5 py-1 rounded-full font-amharic">
              <HeartPulse className="w-3 h-3" /> 80+ ነርሶች
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4">
        {/* ============================ HERO AVATAR ============================ */}
        <section className="flex flex-col items-center pt-8 pb-6">
          <div className="relative w-40 h-40 flex items-center justify-center">
            {/* soundwave rings */}
            <span
              className={`absolute inset-0 rounded-full border-2 border-emerald-400 ${
                isActive ? "anim-ring-fast" : "anim-breathe"
              }`}
            />
            <span
              className={`absolute inset-2 rounded-full border-2 border-cyan-400 ${
                isActive ? "anim-ring-fast" : "anim-breathe"
              }`}
              style={{ animationDelay: "0.4s" }}
            />
            <span
              className={`absolute inset-4 rounded-full border-2 border-emerald-300 ${
                isActive ? "anim-ring" : "anim-breathe"
              }`}
              style={{ animationDelay: "0.8s" }}
            />
            {/* avatar frame */}
            <div
              className={`relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-white shadow-lg ${
                isActive ? "anim-breathe-fast" : "anim-breathe"
              }`}
            >
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <defs>
                  <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8a5a3c" />
                    <stop offset="100%" stopColor="#79492f" />
                  </linearGradient>
                </defs>
                <rect width="200" height="200" fill="#EAF6F1" />
                {/* shoulders / lab coat */}
                <path d="M30,200 C30,150 70,135 100,135 C130,135 170,150 170,200 Z" fill="#FFFFFF" />
                <path d="M85,140 L100,175 L115,140 Z" fill="#0F6659" />
                <rect x="88" y="150" width="7" height="30" fill="#E5F3EE" />
                <rect x="105" y="150" width="7" height="30" fill="#E5F3EE" />
                {/* neck */}
                <rect x="85" y="115" width="30" height="30" fill="url(#skin)" />
                {/* head */}
                <circle cx="100" cy="88" r="46" fill="url(#skin)" />
                {/* hair / hijab-free natural hair wrap */}
                <path d="M54,80 C50,45 75,25 100,25 C125,25 150,45 146,80 C146,55 128,42 100,42 C72,42 54,55 54,80 Z" fill="#241712" />
                <path d="M54,78 C50,95 55,112 62,120 C56,105 56,90 60,80 Z" fill="#241712" />
                <path d="M146,78 C150,95 145,112 138,120 C144,105 144,90 140,80 Z" fill="#241712" />
                {/* warm smiling eyes */}
                <path d="M76,86 Q83,80 90,86" stroke="#2b1a12" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <path d="M110,86 Q117,80 124,86" stroke="#2b1a12" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                {/* reassuring smile */}
                <path d="M82,104 Q100,120 118,104" stroke="#3a2117" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                {/* cheeks blush */}
                <circle cx="72" cy="98" r="6" fill="#c97b5f" opacity="0.35" />
                <circle cx="128" cy="98" r="6" fill="#c97b5f" opacity="0.35" />
                {/* stethoscope */}
                <path d="M78,150 C78,168 92,178 100,178 C108,178 122,168 122,150" stroke="#0F6659" strokeWidth="4" fill="none" strokeLinecap="round" />
                <circle cx="100" cy="180" r="5" fill="#0F6659" />
              </svg>
            </div>
            {voiceState === "thinking" && (
              <div className="absolute -bottom-1 right-2 bg-white rounded-full p-1.5 shadow-md">
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              </div>
            )}
          </div>

          <p className="font-amharic text-[13px] font-medium text-emerald-800/80 mt-4 text-center px-6 anim-in" key={voiceState}>
            {REASSURING_STATUS[voiceState]}
          </p>
        </section>

        {/* ============================ CHAT PANEL ============================ */}
        <section className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-3 mb-5">
          <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed anim-in font-amharic ${
                  m.role === "ai"
                    ? "self-start bg-emerald-50 text-[#0F6659] rounded-tl-sm"
                    : "self-end bg-[#0F6659] text-white rounded-tr-sm"
                }`}
              >
                {m.text}
              </div>
            ))}
            {voiceState === "thinking" && (
              <div className="self-start bg-emerald-50 text-emerald-700 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.3s]" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </section>

        {/* ======================== EMERGENCY & CARE CARDS ====================== */}
        <section className="grid grid-cols-1 gap-3 mb-6">
          <button
            onClick={handleAmbulanceCall}
            className="flex items-center gap-3.5 bg-white border border-rose-100 rounded-3xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#C1462F]/10 flex items-center justify-center shrink-0">
              <PhoneCall className="w-6 h-6 text-[#C1462F]" />
            </div>
            <div className="flex-1">
              <h3 className="font-amharic font-bold text-[14px] text-[#8a2f1d]">
                🚑 አምቡላንስ ጥሪ
              </h3>
              <p className="font-amharic text-[11.5px] text-[#8a2f1d]/70 mt-0.5">
                ወዲያውኑ አካባቢዎን ልከን አምቡላንስ እንልካለን
              </p>
            </div>
          </button>

          <button
            onClick={() => setShowFirstAid(true)}
            className="flex items-center gap-3.5 bg-white border border-sky-100 rounded-3xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#0F6659]/10 flex items-center justify-center shrink-0">
              <HeartPulse className="w-6 h-6 text-[#0F6659]" />
            </div>
            <div className="flex-1">
              <h3 className="font-amharic font-bold text-[14px] text-[#0F6659]">
                🩺 የመጀመሪያ እርዳታ
              </h3>
              <p className="font-amharic text-[11.5px] text-[#0F6659]/70 mt-0.5">
                ቀላል፣ በደረጃ የተቀመጠ የመጀመሪያ እርዳታ መመሪያ
              </p>
            </div>
          </button>

          <button
            onClick={() => setShowBooking(true)}
            className="flex items-center gap-3.5 bg-white border border-amber-100 rounded-3xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#D9A441]/15 flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6 text-[#B4832A]" />
            </div>
            <div className="flex-1">
              <h3 className="font-amharic font-bold text-[14px] text-[#8a651f]">
                📋 የካርድ Booking
              </h3>
              <p className="font-amharic text-[11.5px] text-[#8a651f]/70 mt-0.5">
                ወደ ዶክተር/ነርስ ዳሽቦርድ ይመዘገባሉ
              </p>
            </div>
          </button>
        </section>

        <p className="text-center text-[10.5px] text-emerald-800/40 font-amharic pb-4">
          ህይወት የቀዶ ህክምና ማዕከል • ሆሳዕና መናኸሪያ • Powered by Gemini AI
        </p>
      </main>

      {/* ======================= BOTTOM FLOATING VOICE BAR ===================== */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-md mx-auto px-4 pb-4 pt-3 bg-gradient-to-t from-[#F6FAF8] via-[#F6FAF8]/95 to-transparent">
          <div className="flex items-center gap-2 bg-white rounded-full shadow-lg border border-emerald-100 pl-2 pr-2 py-2">
            <button
              onClick={toggleMic}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                voiceState === "listening"
                  ? "bg-[#0F6659] anim-glow"
                  : "bg-gradient-to-br from-[#0F6659] to-[#10B981]"
              }`}
              aria-label="ድምጽ ይናገሩ"
            >
              {voiceState === "listening" ? (
                <MicOff className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage(textInput)}
              placeholder="እዚህ ይፃፉ... / Type here..."
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-amharic placeholder:text-emerald-900/30"
            />
            <button
              onClick={() => sendMessage(textInput)}
              className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"
              aria-label="ላክ"
            >
              <Send className="w-4 h-4 text-[#0F6659]" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================ FIRST AID MODAL =========================== */}
      {showFirstAid && (
        <Modal onClose={() => { setShowFirstAid(false); setActiveFirstAid(null); }}>
          <h2 className="font-amharic font-bold text-lg text-[#0F6659] mb-1">🩺 የመጀመሪያ እርዳታ</h2>
          <p className="font-amharic text-[12px] text-emerald-800/60 mb-4">እባክዎ እረጋ ይበሉ፤ ደረጃ በደረጃ ይከተሉ</p>

          {!activeFirstAid ? (
            <div className="grid grid-cols-2 gap-2.5">
              {FIRST_AID_TOPICS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveFirstAid(t.id)}
                    className={`${t.bg} rounded-2xl p-3.5 text-left flex flex-col gap-2 active:scale-[0.97] transition-transform`}
                  >
                    <Icon className={`w-5 h-5 ${t.color}`} />
                    <span className="font-amharic text-[12.5px] font-semibold text-[#123B33]">
                      {t.title}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            (() => {
              const topic = FIRST_AID_TOPICS.find((t) => t.id === activeFirstAid);
              const Icon = topic.icon;
              return (
                <div className="anim-in">
                  <button
                    onClick={() => setActiveFirstAid(null)}
                    className="text-[12px] text-emerald-700 mb-3 font-amharic"
                  >
                    ← ወደ ኋላ
                  </button>
                  <div className={`${topic.bg} rounded-2xl p-4 flex items-center gap-2.5 mb-3`}>
                    <Icon className={`w-5 h-5 ${topic.color}`} />
                    <h3 className="font-amharic font-bold text-[15px]">{topic.title}</h3>
                  </div>
                  <ol className="flex flex-col gap-2.5">
                    {topic.steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#0F6659] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="font-amharic text-[13px] leading-relaxed text-[#123B33]">{s}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 bg-rose-50 rounded-2xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="font-amharic text-[11.5px] text-rose-700">
                      ሁኔታው ከባድ ከሆነ፣ በቀጥታ አምቡላንስ ይደውሉ።
                    </p>
                  </div>
                </div>
              );
            })()
          )}
        </Modal>
      )}

      {/* ============================= BOOKING MODAL ============================ */}
      {showBooking && (
        <Modal onClose={() => { setShowBooking(false); setBookingSaved(false); }}>
          {!bookingSaved ? (
            <>
              <h2 className="font-amharic font-bold text-lg text-[#B4832A] mb-1">📋 የካርድ Booking</h2>
              <p className="font-amharic text-[12px] text-amber-800/60 mb-4">
                መረጃዎን ይሙሉ፤ ወደ ዶክተር/ነርስ ዳሽቦርድ ወዲያውኑ ይመዘገባል
              </p>
              <form onSubmit={handleBookingSubmit} className="flex flex-col gap-3">
                <Field label="ሙሉ ስም">
                  <input
                    required
                    value={bookingForm.name}
                    onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                    className="w-full bg-emerald-50/60 rounded-xl px-3.5 py-2.5 text-[13px] font-amharic outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="አብነት ..."
                  />
                </Field>
                <Field label="ስልክ ቁጥር">
                  <input
                    required
                    value={bookingForm.phone}
                    onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                    className="w-full bg-emerald-50/60 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="09xx xxx xxx"
                  />
                </Field>
                <Field label="ክፍል">
                  <select
                    value={bookingForm.department}
                    onChange={(e) => setBookingForm({ ...bookingForm, department: e.target.value })}
                    className="w-full bg-emerald-50/60 rounded-xl px-3.5 py-2.5 text-[13px] font-amharic outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option>አጠቃላይ ክፍል</option>
                    <option>የቀዶ ህክምና ክፍል</option>
                    <option>የድንገተኛ ክፍል</option>
                    <option>የማህፀን ክፍል</option>
                    <option>የህጻናት ክፍል</option>
                  </select>
                </Field>
                <Field label="የህመም ምክንያት">
                  <textarea
                    value={bookingForm.reason}
                    onChange={(e) => setBookingForm({ ...bookingForm, reason: e.target.value })}
                    rows={3}
                    className="w-full bg-emerald-50/60 rounded-xl px-3.5 py-2.5 text-[13px] font-amharic outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                    placeholder="በአጭሩ ይግለጹ..."
                  />
                </Field>
                <button
                  type="submit"
                  className="mt-1 bg-[#D9A441] text-white font-amharic font-semibold rounded-xl py-3 text-[13.5px] active:scale-[0.98] transition-transform"
                >
                  ይመዝገቡ
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-6 anim-in">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-3" />
              <h3 className="font-amharic font-bold text-[15px] text-[#0F6659]">በተሳካ ሁኔታ ተመዝግበዋል!</h3>
              <p className="font-amharic text-[12.5px] text-emerald-800/60 mt-1.5 leading-relaxed">
                መረጃዎ ወደ ዶክተር/ነርስ ዳሽቦርድ ደርሷል። ስምዎ ሲጠራ ያሳውቅዎታል፤ እባክዎ በመቀመጫ ቦታ ይጠብቁ።
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* ============================ AMBULANCE MODAL =========================== */}
      {showAmbulance && (
        <Modal onClose={() => { setShowAmbulance(false); setAmbulanceStatus("idle"); }}>
          <div className="flex flex-col items-center text-center py-4">
            {ambulanceStatus !== "dispatched" ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[#C1462F]/10 flex items-center justify-center mb-4 anim-glow">
                  <PhoneCall className="w-7 h-7 text-[#C1462F]" />
                </div>
                <h3 className="font-amharic font-bold text-[15px] text-[#8a2f1d]">እረጋ ይበሉ፣ አብረንዎት ነን</h3>
                <p className="font-amharic text-[12.5px] text-[#8a2f1d]/60 mt-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> አካባቢዎን በማግኘት ላይ...
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-3 anim-in" />
                <h3 className="font-amharic font-bold text-[15px] text-[#0F6659]">አምቡላንስ እየመጣ ነው</h3>
                <p className="font-amharic text-[12.5px] text-emerald-800/60 mt-2 leading-relaxed">
                  አካባቢዎ ለአሽከርካሪው እና ለዶክተር ዳሽቦርድ ተልኳል። እባክዎ በስልክዎ ላይ ይቆዩ፣ ረዳት ሰራተኛ ያናግርዎታል።
                </p>
                {ambulanceLocation?.lat && (
                  <p className="text-[10.5px] text-emerald-700/50 mt-2 font-mono">
                    GPS: {ambulanceLocation.lat}, {ambulanceLocation.lng}
                  </p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------- Helpers -------------------------------- */
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[#0F1F1B]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 anim-in">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center"
          aria-label="ዝጋ"
        >
          <X className="w-4 h-4 text-emerald-700" />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-amharic text-[11.5px] font-medium text-emerald-800/70">{label}</span>
      {children}
    </label>
  );
}
