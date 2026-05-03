import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultListLike }) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionErrorLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
};

function getRecognitionCtor(): (new () => RecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function formatSpeechError(code: string): string {
  if (code === "not-allowed") {
    return "Microphone access was blocked. Allow the microphone for this site in the browser address bar.";
  }
  if (code === "network") {
    return [
      "Speech recognition could not reach Google's speech servers (network error).",
      "Chrome sends your audio to Google over the internet; guest Wi-Fi, hospital firewalls, VPNs, or strict ad blockers often block this.",
      "Try a phone hotspot, home network, turn VPN off, or another browser. You can always type the visit in the box instead."
    ].join(" ");
  }
  if (code === "no-speech") {
    return "";
  }
  if (code === "audio-capture") {
    return "No microphone was found or it is in use by another app.";
  }
  if (code === "service-not-allowed") {
    return "Speech service is not allowed in this context (try https:// or localhost, or another browser).";
  }
  return `Speech recognition stopped: ${code}`;
}

export type SpeechCaptionOptions = {
  getBaseline: () => string;
  setLiveTranscript: (value: string) => void;
};

const NETWORK_RETRIES = 3;
const NETWORK_RETRY_MS = 1200;

/**
 * Browser speech-to-text (Chrome / Edge). Uses the vendor speech service (requires network).
 */
export function useSpeechCaption({ getBaseline, setLiveTranscript }: SpeechCaptionOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [caption, setCaption] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recRef = useRef<RecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const sessionFinalRef = useRef("");
  const baselineRef = useRef("");
  const optsRef = useRef({ getBaseline, setLiveTranscript });
  optsRef.current = { getBaseline, setLiveTranscript };

  const lastErrorCodeRef = useRef<string | null>(null);
  const networkRetryCountRef = useRef(0);
  const networkRetryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      if (networkRetryTimerRef.current != null) {
        window.clearTimeout(networkRetryTimerRef.current);
      }
    };
  }, []);

  const applyResults = useCallback((event: { resultIndex: number; results: SpeechRecognitionResultListLike }) => {
    lastErrorCodeRef.current = null;
    networkRetryCountRef.current = 0;

    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const alt = result[0];
      if (!alt) continue;
      if (result.isFinal) {
        sessionFinalRef.current += alt.transcript;
      } else {
        interim += alt.transcript;
      }
    }

    const base = baselineRef.current.trimEnd();
    const spoken = (sessionFinalRef.current + interim).replace(/\s+/g, " ");
    const full = spoken.trim() ? (base ? `${base}\n${spoken.trim()}` : spoken.trim()) : base;

    optsRef.current.setLiveTranscript(full);
    setCaption(interim.trim());
    setSpeechError(null);
  }, []);

  const wireRecognition = useCallback(
    (rec: RecognitionLike) => {
      rec.onresult = (event) => {
        applyResults(event);
      };

      rec.onerror = (event) => {
        const code = event.error ?? "unknown";
        lastErrorCodeRef.current = code;

        if (code === "no-speech" && keepListeningRef.current) {
          setSpeechError(null);
          return;
        }
        if (code === "aborted" && !keepListeningRef.current) {
          return;
        }

        if (code === "network" && keepListeningRef.current && networkRetryCountRef.current < NETWORK_RETRIES) {
          networkRetryCountRef.current += 1;
          setSpeechError(
            `Could not reach speech servers. Retrying (${networkRetryCountRef.current}/${NETWORK_RETRIES})…`
          );
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          recRef.current = null;

          if (networkRetryTimerRef.current != null) {
            window.clearTimeout(networkRetryTimerRef.current);
          }
          networkRetryTimerRef.current = window.setTimeout(() => {
            networkRetryTimerRef.current = null;
            if (!keepListeningRef.current) return;
            const Ctor = getRecognitionCtor();
            if (!Ctor) return;
            try {
              const next = new Ctor();
              next.continuous = true;
              next.interimResults = true;
              next.lang = "en-US";
              if ("maxAlternatives" in next) {
                next.maxAlternatives = 1;
              }
              wireRecognition(next);
              lastErrorCodeRef.current = null;
              next.start();
              recRef.current = next;
            } catch {
              keepListeningRef.current = false;
              setListening(false);
              setCaption("");
              setSpeechError(formatSpeechError("network"));
            }
          }, NETWORK_RETRY_MS);
          return;
        }

        if (code === "network") {
          networkRetryCountRef.current = 0;
        }

        keepListeningRef.current = false;
        setListening(false);
        setCaption("");
        setSpeechError(formatSpeechError(code) || null);
        recRef.current = null;
      };

      rec.onend = () => {
        if (lastErrorCodeRef.current === "network") {
          return;
        }
        if (!keepListeningRef.current) {
          recRef.current = null;
          setListening(false);
          setCaption("");
          return;
        }
        window.setTimeout(() => {
          if (!keepListeningRef.current) return;
          const Ctor = getRecognitionCtor();
          if (!Ctor) return;
          try {
            const next = new Ctor();
            next.continuous = true;
            next.interimResults = true;
            next.lang = "en-US";
            if ("maxAlternatives" in next) {
              next.maxAlternatives = 1;
            }
            wireRecognition(next);
            lastErrorCodeRef.current = null;
            next.start();
            recRef.current = next;
          } catch {
            keepListeningRef.current = false;
            recRef.current = null;
            setListening(false);
            setCaption("");
          }
        }, 150);
      };
    },
    [applyResults]
  );

  const stop = useCallback(() => {
    keepListeningRef.current = false;
    lastErrorCodeRef.current = null;
    networkRetryCountRef.current = 0;
    if (networkRetryTimerRef.current != null) {
      window.clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    }
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
    setCaption("");
    setSpeechError(null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    if (networkRetryTimerRef.current != null) {
      window.clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    }

    keepListeningRef.current = true;
    lastErrorCodeRef.current = null;
    networkRetryCountRef.current = 0;
    sessionFinalRef.current = "";
    baselineRef.current = optsRef.current.getBaseline();
    setSpeechError(null);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    if ("maxAlternatives" in rec) {
      rec.maxAlternatives = 1;
    }
    wireRecognition(rec);
    recRef.current = rec;

    try {
      rec.start();
      setListening(true);
    } catch {
      keepListeningRef.current = false;
      recRef.current = null;
      setListening(false);
      setSpeechError("Could not start speech recognition. Try Chrome or Edge on https:// or http://localhost.");
    }
  }, [wireRecognition]);

  return { supported, listening, caption, speechError, start, stop };
}
