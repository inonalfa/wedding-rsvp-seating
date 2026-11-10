"use client";

import { useEffect, useRef, useState } from "react";
import { heartHomeFrame, heartHomeLoopTime, LOVE_DURATION, LOVE_LOOP_DURATION, LOVE_PHRASE } from "../lib/heart-home-geometry";
import { Icon } from "./wedding-icons";

type AnimationStatus = "loading" | "playing" | "paused" | "static" | "unavailable";
type SceneHandle = Awaited<ReturnType<typeof import("../lib/heart-home-scene").createHeartHomeScene>>;

export default function HeartHome() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<AnimationStatus>("loading");
  const [characters, setCharacters] = useState(LOVE_PHRASE.length);

  useEffect(() => {
    const element = canvas.current, container = stage.current;
    if (!element || !container) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scene: SceneHandle | undefined;
    let cancelled = false, initializing = false, failed = false;
    let frameId = 0, lastTimestamp = 0, elapsed = 0, loadingTimer = 0;
    let inView = true, lastCharacters = -1;
    let openingFinished = !document.querySelector(".opening-scene");
    const updateText = (count: number) => { if (count !== lastCharacters) { lastCharacters = count; setCharacters(count); } };
    function stopClock() { window.cancelAnimationFrame(frameId); frameId = 0; lastTimestamp = 0; }
    function fallback() {
      if (cancelled) return;
      failed = true;
      stopClock();
      scene?.dispose();
      scene = undefined;
      setStatus("unavailable");
      updateText(LOVE_PHRASE.length);
    }
    function tick(timestamp: number) {
      frameId = 0;
      if (cancelled || !scene || !inView || document.hidden || reduced.matches || !openingFinished) return;
      // A background tab never jumps to a different point in the story.
      if (lastTimestamp) elapsed = (elapsed + Math.min(64, timestamp - lastTimestamp)) % LOVE_LOOP_DURATION;
      lastTimestamp = timestamp;
      const sceneTime = heartHomeLoopTime(elapsed);
      try { scene.render(sceneTime); } catch { fallback(); return; }
      const current = heartHomeFrame(sceneTime);
      updateText(current.characters);
      frameId = window.requestAnimationFrame(tick);
    }
    function syncPlayback() {
      stopClock();
      if (!scene || cancelled) return;
      if (reduced.matches) {
        elapsed = LOVE_DURATION;
        scene.render(elapsed);
        updateText(LOVE_PHRASE.length);
        setStatus("static");
      } else if (!inView || document.hidden || !openingFinished) {
        setStatus("paused");
      } else {
        setStatus("playing");
        frameId = window.requestAnimationFrame(tick);
      }
    }
    async function initialize() {
      if (cancelled || initializing || scene || failed || !inView || document.hidden) return;
      initializing = true;
      loadingTimer = window.setTimeout(fallback, 8_000);
      try {
        const { createHeartHomeScene } = await import("../lib/heart-home-scene");
        if (cancelled || failed) return;
        const result = await createHeartHomeScene(element!);
        if (cancelled || failed) { result.dispose(); return; }
        scene = result;
        elapsed = reduced.matches ? LOVE_DURATION : 0;
        scene.render(elapsed);
        updateText(reduced.matches ? LOVE_PHRASE.length : 0);
        syncPlayback();
      } catch { fallback(); }
      finally { initializing = false; window.clearTimeout(loadingTimer); }
    }
    function visibility() { if (!scene) void initialize(); else syncPlayback(); }
    function preference() {
      if (!scene) void initialize();
      else {
        if (!reduced.matches) { elapsed = 0; updateText(0); scene.render(0); }
        syncPlayback();
      }
    }
    function resize() { try { scene?.resize(); } catch { fallback(); } }
    function contextLost(event: Event) { event.preventDefault(); fallback(); }
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!scene) void initialize(); else syncPlayback();
    }, { threshold: .12 }) : undefined;
    observer?.observe(container);
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(container);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    element.addEventListener("webglcontextlost", contextLost);
    // Let the primary hero content and RSVP controls paint before loading 3D.
    const startTimer = window.setTimeout(() => { void initialize(); }, 250);
    const openingTimer = window.setTimeout(() => { openingFinished = true; syncPlayback(); }, 1_450);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(openingTimer);
      window.clearTimeout(loadingTimer);
      stopClock();
      observer?.disconnect(); resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      element.removeEventListener("webglcontextlost", contextLost);
      scene?.dispose();
    };
  }, []);

  const ready = status !== "loading" && status !== "unavailable";
  return <figure className="love-story" data-status={status}>
    <div className="love-stage" ref={stage}>
      <div className="love-stage-glow" aria-hidden="true" />
      <canvas ref={canvas} className={`love-canvas${ready ? " is-ready" : ""}`} aria-hidden="true" />
      {!ready && <div className="love-fallback" aria-hidden="true"><Icon name="heart" /></div>}
    </div>
    <figcaption className="love-caption">
      <span className="sr-only">{LOVE_PHRASE}</span>
      <span className="love-typewriter" dir="rtl" aria-hidden="true">
        <span className="love-type-reserve">{LOVE_PHRASE}</span>
        <span className="love-type-line"><span>{Array.from(LOVE_PHRASE).slice(0, characters).join("")}</span><span className={`love-caret${status === "playing" && characters > 0 && characters < LOVE_PHRASE.length ? " is-typing" : ""}`} /></span>
      </span>
    </figcaption>
  </figure>;
}
