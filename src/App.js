import { useState, useEffect, useRef, useCallback } from "react";

const LANGUAGES = [
  { code: "en-IN",     label: "English",  sublabel: "English (India)",         flag: "🇬🇧" },
  { code: "hi-IN",     label: "हिन्दी",    sublabel: "Hindi (Devanagari)",       flag: "🇮🇳" },
  // { code: "hinglish",  label: "Hinglish", sublabel: "Hindi + English mixed",    flag: "🤝" },
  // { code: "auto",      label: "Auto",     sublabel: "Detect automatically",     flag: "✨" },
  { code: "ta-IN",      label: "Tamil",     sublabel: "Detect automatically",     flag: "ௐ" },
  { code: "mr-IN",      label: "Marathi",     sublabel: "Detect automatically",     flag: "♛" },
];

// Hinglish uses hi-IN engine — Chrome's hi-IN model is trained on real Indian
// speech which naturally includes code-switching between Hindi and English.
const getLangCode = (selected) =>
  selected === "auto" || selected === "hinglish" ? "hi-IN" : selected;

// Classify detected text into a language label
const classifyText = (text) => {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin      = /[a-zA-Z]/.test(text);
  if (hasDevanagari && hasLatin) return { label: "Hinglish", color: "#f59e0b", emoji: "🤝" };
  if (hasDevanagari)             return { label: "हिन्दी",   color: "#f472b6", emoji: "🇮🇳" };
  return                                { label: "English",  color: "#34d399", emoji: "🇬🇧" };
};

export default function SpeechToText() {
  const [isListening, setIsListening]   = useState(false);
  const [segments, setSegments]         = useState([]); // [{text, lang}]
  const [interimText, setInterimText]   = useState("");
  const [selectedLang, setSelectedLang] = useState("hinglish");
  const [copied, setCopied]             = useState(false);
  const [supported, setSupported]       = useState(true);
  const [pulseSize, setPulseSize]       = useState(1);
  const [lastDetected, setLastDetected] = useState(null);

  const recognitionRef  = useRef(null);
  const isListeningRef  = useRef(false);
  const selectedLangRef = useRef("hinglish");
  const animFrameRef    = useRef(null);
  const pulseRef        = useRef(1);
  const pulseDir        = useRef(1);
  const transcriptBoxRef = useRef(null);

  useEffect(() => { selectedLangRef.current = selectedLang; }, [selectedLang]);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setSupported(false);
    }
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [segments, interimText]);

  // Pulse animation
  useEffect(() => {
    if (isListening) {
      const animate = () => {
        pulseRef.current += 0.02 * pulseDir.current;
        if (pulseRef.current > 1.15) pulseDir.current = -1;
        if (pulseRef.current < 0.92) pulseDir.current = 1;
        setPulseSize(pulseRef.current);
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
      setPulseSize(1);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isListening]);

  const buildRecognition = useCallback((langCode) => {
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = langCode;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalChunk += t;
        else interimChunk += t;
      }
      if (finalChunk) {
        const detected = classifyText(finalChunk);
        setLastDetected(detected);
        setSegments(prev => [...prev, { text: finalChunk.trim(), lang: detected }]);
        setInterimText("");
      } else {
        setInterimText(interimChunk);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        alert("Microphone access denied. Please allow mic access in your browser settings.");
        isListeningRef.current = false;
        setIsListening(false);
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("Speech recognition error:", e.error);
      }
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        try { rec.start(); } catch (_) {}
      }
    };

    return rec;
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  const startRecognition = useCallback((langOverride) => {
    const lang = langOverride ?? selectedLangRef.current;
    const code = getLangCode(lang);
    stopRecognition();
    const rec = buildRecognition(code);
    recognitionRef.current = rec;
    isListeningRef.current = true;
    try { rec.start(); setIsListening(true); }
    catch (err) { console.error("Could not start recognition:", err); }
  }, [buildRecognition, stopRecognition]);

  const switchLanguage = useCallback((newLang) => {
    setSelectedLang(newLang);
    selectedLangRef.current = newLang;
    setLastDetected(null);
    if (isListeningRef.current) {
      stopRecognition();
      setInterimText("");
      setTimeout(() => startRecognition(newLang), 250);
    }
  }, [stopRecognition, startRecognition]);

  const toggleListening = () => {
    if (isListening) {
      isListeningRef.current = false;
      stopRecognition();
      setInterimText("");
      setIsListening(false);
    } else {
      startRecognition();
    }
  };

  const clearAll = () => {
    isListeningRef.current = false;
    stopRecognition();
    setInterimText("");
    setIsListening(false);
    setSegments([]);
    setLastDetected(null);
  };

  const fullText = segments.map(s => s.text).join(" ");
  const copyText = () => {
    const text = (fullText + " " + interimText).trim();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = fullText.length;
  const selectedLangInfo = LANGUAGES.find(l => l.code === selectedLang);

  // Status label below mic button
  const statusLabel = (() => {
    if (!isListening) return "Tap to start recording";
    if (lastDetected)  return `Detected: ${lastDetected.emoji} ${lastDetected.label}`;
    return "Listening… speak now";
  })();

  const statusColor = isListening && lastDetected ? lastDetected.color : "#94a3b8";

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0a0f", fontFamily:"'Georgia', serif",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"24px 16px",
      position:"relative", overflow:"hidden",
    }}>
      {/* Orbs */}
      <div style={{ position:"fixed", top:"-20%", left:"-10%", width:"500px", height:"500px", borderRadius:"50%", background:"radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"fixed", bottom:"-20%", right:"-10%", width:"600px", height:"600px", borderRadius:"50%", background:"radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)", pointerEvents:"none" }} />

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom:"32px" }}>
        <div style={{ fontSize:"13px", letterSpacing:"4px", color:"#6366f1", textTransform:"uppercase", marginBottom:"8px" }}>Voice Intelligence</div>
        <h1 style={{ fontSize:"clamp(26px,5vw,44px)", fontWeight:"300", color:"#f1f5f9", margin:0, letterSpacing:"-1px", lineHeight:1.1 }}>
          Speech <span style={{ color:"#818cf8", fontStyle:"italic" }}>→</span> Text
        </h1>
        <p style={{ color:"#475569", fontSize:"14px", marginTop:"8px", fontFamily:"sans-serif" }}>
          {/* English · हिन्दी · Hinglish · Auto-detect */}
          Indian Language
        </p>
      </div>

      {/* Card */}
      <div style={{
        width:"100%", maxWidth:"740px",
        background:"rgba(15,15,25,0.85)", border:"1px solid rgba(99,102,241,0.2)",
        borderRadius:"24px", backdropFilter:"blur(20px)",
        boxShadow:"0 0 80px rgba(99,102,241,0.08), 0 20px 60px rgba(0,0,0,0.5)", overflow:"hidden",
      }}>

        {/* Language tabs */}
        <div style={{ display:"flex", padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)", gap:"6px", flexWrap:"wrap" }}>
          {LANGUAGES.map(l => {
            const active = selectedLang === l.code;
            return (
              <button key={l.code} onClick={() => switchLanguage(l.code)} title={l.sublabel} style={{
                padding:"8px 16px", borderRadius:"20px", border:"1px solid",
                borderColor: active ? "#6366f1" : "rgba(255,255,255,0.07)",
                background:  active ? "rgba(99,102,241,0.2)" : "transparent",
                color:       active ? "#a5b4fc" : "#64748b",
                cursor:"pointer", fontSize:"13px", fontFamily:"sans-serif",
                transition:"all 0.2s", display:"flex", alignItems:"center", gap:"6px",
              }}>
                <span>{l.flag}</span>
                <span>{l.label}</span>
                {active && isListening && (
                  <span style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#6366f1", display:"inline-block", animation:"blink 1.2s infinite" }} />
                )}
              </button>
            );
          })}

          {/* Live indicator */}
          {isListening && (
            <span style={{ marginLeft:"auto", color:"#f472b6", fontSize:"12px", fontFamily:"sans-serif", display:"flex", alignItems:"center", gap:"6px", alignSelf:"center" }}>
              <span style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#f472b6", display:"inline-block", animation:"blink 1s infinite" }} />
              Live · {selectedLangInfo?.sublabel}
            </span>
          )}
        </div>

        {/* Hinglish info banner */}
        {/* {selectedLang === "hinglish" && (
          <div style={{ padding:"10px 20px", background:"rgba(245,158,11,0.06)", borderBottom:"1px solid rgba(245,158,11,0.12)", display:"flex", gap:"8px", alignItems:"flex-start" }}>
            <span style={{ fontSize:"16px", flexShrink:0 }}>🤝</span>
            <span style={{ color:"#d97706", fontSize:"12px", fontFamily:"sans-serif", lineHeight:1.5 }}>
              <strong>Hinglish mode</strong> — speak freely mixing Hindi &amp; English in the same sentence.
              e.g. <em>"Aaj main office jaaunga, but pehle coffee lena hai"</em>. Each segment is colour-coded by detected script.
            </span>
          </div>
        )} */}
        {/* {selectedLang === "auto" && (
          <div style={{ padding:"10px 20px", background:"rgba(99,102,241,0.06)", borderBottom:"1px solid rgba(99,102,241,0.1)", display:"flex", gap:"8px", alignItems:"center" }}>
            <span style={{ fontSize:"16px" }}>✨</span>
            <span style={{ color:"#818cf8", fontSize:"12px", fontFamily:"sans-serif" }}>
              Auto mode — detects Hindi, English or Hinglish per utterance and colour-codes accordingly.
            </span>
          </div>
        )} */}

        {/* Transcript area */}
        <div ref={transcriptBoxRef} style={{ padding:"24px", minHeight:"220px", maxHeight:"340px", overflowY:"auto" }}>
          {!supported ? (
            <div style={{ textAlign:"center", color:"#ef4444", fontFamily:"sans-serif", padding:"40px 0" }}>
              ⚠️ Speech Recognition not supported.<br/>
              <small style={{ color:"#64748b" }}>Please use Chrome or Edge on desktop.</small>
            </div>
          ) : segments.length === 0 && !interimText ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"160px", gap:"12px" }}>
              <div style={{ fontSize:"48px", opacity:0.12 }}>🎙️</div>
              <p style={{ color:"#334155", fontFamily:"sans-serif", fontSize:"15px", margin:0, textAlign:"center" }}>
                {isListening ? "Listening… speak now" : "Press the mic button to start"}
              </p>
            </div>
          ) : (
            <div style={{ lineHeight:1.9, fontSize:"17px" }}>
              {segments.map((seg, i) => (
                <span key={i}>
                  <span style={{
                    color: "#e2e8f0",
                    borderBottom: `2px solid ${seg.lang.color}22`,
                    paddingBottom:"1px",
                  }} title={seg.lang.label}>
                    {seg.text}
                  </span>
                  {" "}
                </span>
              ))}
              {interimText && (
                <span style={{ color:"#818cf8", opacity:0.6, fontStyle:"italic" }}>{interimText}</span>
              )}
            </div>
          )}
        </div>

        {/* Legend + Stats */}
        {segments.length > 0 && (
          <div style={{ padding:"8px 24px", borderTop:"1px solid rgba(255,255,255,0.04)", display:"flex", gap:"16px", alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ color:"#334155", fontSize:"12px", fontFamily:"sans-serif" }}>{wordCount} words · {charCount} chars</span>
            <div style={{ display:"flex", gap:"12px", marginLeft:"auto" }}>
              {[
                { label:"English",  color:"#34d399" },
                { label:"हिन्दी",   color:"#f472b6" },
                { label:"Hinglish", color:"#f59e0b" },
              ].map(item => (
                <span key={item.label} style={{ display:"flex", alignItems:"center", gap:"4px", fontSize:"11px", fontFamily:"sans-serif", color:"#475569" }}>
                  <span style={{ width:"8px", height:"8px", borderRadius:"2px", background:item.color, display:"inline-block" }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ padding:"20px 24px", borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:"12px" }}>
          {/* Mic */}
          <button onClick={toggleListening} disabled={!supported} style={{
            width:"64px", height:"64px", borderRadius:"50%", border:"none",
            background: isListening ? "linear-gradient(135deg,#f472b6,#ec4899)" : "linear-gradient(135deg,#6366f1,#818cf8)",
            cursor: supported ? "pointer" : "not-allowed", fontSize:"24px",
            transform: `scale(${isListening ? pulseSize : 1})`,
            transition: isListening ? "none" : "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: isListening ? "0 0 30px rgba(244,114,182,0.5),0 0 60px rgba(244,114,182,0.2)" : "0 4px 20px rgba(99,102,241,0.4)",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          }}>
            {isListening ? "⏹" : "🎙"}
          </button>

          <div style={{ flex:1 }}>
            <div style={{ color: statusColor, fontSize:"14px", fontFamily:"sans-serif", transition:"color 0.3s" }}>
              {statusLabel}
            </div>
            <div style={{ color:"#334155", fontSize:"12px", fontFamily:"sans-serif", marginTop:"2px" }}>
              {isListening ? "Tap to stop" : `Mode: ${selectedLangInfo?.label} — ${selectedLangInfo?.sublabel}`}
            </div>
          </div>

          <button onClick={copyText} disabled={segments.length === 0 && !interimText} style={{
            padding:"10px 20px", borderRadius:"12px", border:"1px solid rgba(99,102,241,0.3)",
            background: copied ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.1)",
            color: copied ? "#4ade80" : "#818cf8",
            cursor: (segments.length || interimText) ? "pointer" : "not-allowed",
            fontFamily:"sans-serif", fontSize:"13px", transition:"all 0.2s",
            opacity: (segments.length || interimText) ? 1 : 0.4,
          }}>
            {copied ? "✓ Copied!" : "Copy"}
          </button>

          <button onClick={clearAll} disabled={segments.length === 0 && !interimText} style={{
            padding:"10px 20px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.06)",
            background:"transparent", color:"#475569",
            cursor: (segments.length || interimText) ? "pointer" : "not-allowed",
            fontFamily:"sans-serif", fontSize:"13px", transition:"all 0.2s",
            opacity: (segments.length || interimText) ? 1 : 0.4,
          }}>
            Clear
          </button>
        </div>
      </div>

      {/* Tips */}
      <div style={{ marginTop:"20px", display:"flex", gap:"10px", flexWrap:"wrap", justifyContent:"center" }}>
        {[
          "Krï§wðrlÐ",
        ].map(tip => (
          <div key={tip} style={{ padding:"7px 14px", borderRadius:"20px", border:"1px solid rgba(255,255,255,0.05)", color:"#334155", fontSize:"12px", fontFamily:"sans-serif" }}>
            {tip}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }
      `}</style>
    </div>
  );
}