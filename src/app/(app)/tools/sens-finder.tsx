"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { candidates, cmPer360, compositeScore, edpi, narrow, pxPerCount, round3 } from "@/lib/tools/sens";
import { saveMySensitivityAction } from "@/server/actions/prefs";
import type { ActionResult } from "@/server/actions/auth";

/**
 * 감도 찾기 — 조준 테스트로 자기 감도 범위를 좁힌다 (기획서 7절 "브라우저 구현 방식").
 *
 * 1. DPI 입력(브라우저는 DPI를 모른다 — 이동량만 받는다) → 시작 구간(기본: 현재 감도 ±40%, 없으면 0.2~0.8)
 * 2. Pointer Lock으로 커서를 숨기고 movementX/Y로 조준점을 움직인다. 조준점은 화면 중앙에 고정되고 "세계"가 반대로 움직인다(FPS와 같게)
 * 3. 라운드마다 후보 A·B를 번갈아 테스트: 플릭(표적 8개 클릭) + 트래킹(움직이는 표적 6초 따라가기)
 * 4. 더 나은 쪽으로 구간을 좁힌다(이분 탐색, 5회) → 결과를 감도·eDPI로 표시하고 프로필에 저장
 */
const ROUNDS = 5;
const FLICK_TARGETS = 8;
const TRACK_SECONDS = 6;
const W = 960;
const H = 540;
const TARGET_R = 18;

type Phase = "idle" | "ready" | "flick" | "track" | "between" | "done" | "paused";
type Round = { index: number; low: number; high: number; a: number; b: number; scoreA: number | null; scoreB: number | null };

type Flick = { hits: number; misses: number; startedAt: number; target: { x: number; y: number } | null };
type Track = { startedAt: number; frames: number; onTarget: number };

export function SensFinder({ dpi: initialDpi, sens: initialSens }: { dpi: number | null; sens: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpi, setDpi] = useState(String(initialDpi ?? 800));
  const [low, setLow] = useState(String(initialSens ? round3(initialSens * 0.6) : 0.2));
  const [high, setHigh] = useState(String(initialSens ? round3(initialSens * 1.4) : 0.8));
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState<Round | null>(null);
  const [candidate, setCandidate] = useState<"a" | "b">("a");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<{ sens: number; low: number; high: number } | null>(null);
  const [saveResult, saveAction, savePending] = useActionState<ActionResult | null, FormData>(saveMySensitivityAction, null);

  // 테스트 중 바뀌는 값은 ref로 들고 캔버스 루프에서 읽는다 (state로 두면 매 프레임 리렌더가 난다)
  const world = useRef({ x: 0, y: 0 }); // 조준점 기준 세계 오프셋(px)
  const flick = useRef<Flick>({ hits: 0, misses: 0, startedAt: 0, target: null });
  const track = useRef<Track>({ startedAt: 0, frames: 0, onTarget: 0 });
  const phaseRef = useRef<Phase>("idle");
  const sensRef = useRef(0.4);
  const flickResult = useRef<{ hits: number; seconds: number; misses: number } | null>(null);
  const raf = useRef<number>(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const randomTarget = () => ({ x: (Math.random() - 0.5) * W * 0.7, y: (Math.random() - 0.5) * H * 0.6 });

  const startCandidate = useCallback(
    (r: Round, which: "a" | "b") => {
      sensRef.current = which === "a" ? r.a : r.b;
      world.current = { x: 0, y: 0 };
      flick.current = { hits: 0, misses: 0, startedAt: performance.now(), target: randomTarget() };
      flickResult.current = null;
      setCandidate(which);
      setMessage(`${r.index + 1}/${ROUNDS} 라운드 · 후보 ${which.toUpperCase()} (감도 ${sensRef.current}) — 표적을 클릭하세요`);
      setPhaseBoth("flick");
    },
    [],
  );

  const finishCandidate = useCallback(
    (score: number) => {
      setRound((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [candidate === "a" ? "scoreA" : "scoreB"]: score } as Round;
        if (candidate === "a") {
          // B 테스트로
          setTimeout(() => startCandidate(next, "b"), 0);
          return next;
        }
        // 라운드 종료 → 구간 좁히기
        const aBetter = (next.scoreA ?? 0) >= (next.scoreB ?? 0);
        const nr = narrow(next.low, next.high, aBetter);
        if (next.index + 1 >= ROUNDS) {
          const sens = round3((nr.low + nr.high) / 2);
          setResult({ sens, ...nr });
          setMessage(`완료 — 추천 감도 ${sens}`);
          setPhaseBoth("done");
          document.exitPointerLock?.();
          return next;
        }
        const c = candidates(nr.low, nr.high);
        const following: Round = { index: next.index + 1, low: nr.low, high: nr.high, a: c.a, b: c.b, scoreA: null, scoreB: null };
        setTimeout(() => startCandidate(following, "a"), 0);
        return following;
      });
    },
    [candidate, startCandidate],
  );

  // ----- 입력: Pointer Lock 이동·클릭 -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const k = pxPerCount(W, sensRef.current);
      // 조준점이 고정이므로 세계는 마우스 반대 방향으로 움직인다
      world.current = { x: world.current.x - e.movementX * k, y: world.current.y - e.movementY * k };
    };
    const onClick = () => {
      if (document.pointerLockElement !== canvas) {
        if (phaseRef.current === "flick" || phaseRef.current === "track" || phaseRef.current === "ready") canvas.requestPointerLock();
        return;
      }
      if (phaseRef.current === "ready") {
        setPhaseBoth("flick");
        return;
      }
      if (phaseRef.current !== "flick") return;
      const f = flick.current;
      if (!f.target) return;
      const sx = f.target.x + world.current.x;
      const sy = f.target.y + world.current.y;
      if (Math.hypot(sx, sy) <= TARGET_R) {
        f.hits += 1;
        if (f.hits >= FLICK_TARGETS) {
          flickResult.current = { hits: f.hits, seconds: (performance.now() - f.startedAt) / 1000, misses: f.misses };
          track.current = { startedAt: performance.now(), frames: 0, onTarget: 0 };
          setMessage("트래킹 — 움직이는 표적 위에 조준점을 유지하세요 (6초)");
          setPhaseBoth("track");
        } else {
          f.target = randomTarget();
        }
      } else {
        f.misses += 1;
      }
    };
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas && (phaseRef.current === "flick" || phaseRef.current === "track")) {
        setMessage("포인터 잠금이 풀렸습니다 — 캔버스를 클릭하면 이어서 진행합니다");
      }
    };
    document.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  // ----- 렌더 루프 -----
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const p = phaseRef.current;
      ctx.fillStyle = "#0a1017";
      ctx.fillRect(0, 0, W, H);
      // 격자 (이동감)
      ctx.strokeStyle = "#182430";
      ctx.lineWidth = 1;
      const gx = ((world.current.x % 60) + 60) % 60;
      const gy = ((world.current.y % 60) + 60) % 60;
      for (let x = gx; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = gy; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const cx = W / 2;
      const cy = H / 2;
      if (p === "flick" && flick.current.target) {
        const t = flick.current.target;
        ctx.fillStyle = "#ff4655";
        ctx.beginPath();
        ctx.arc(cx + t.x + world.current.x, cy + t.y + world.current.y, TARGET_R, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p === "track") {
        const el = (performance.now() - track.current.startedAt) / 1000;
        // 리사주 곡선으로 부드럽게 움직이는 표적
        const tx = Math.sin(el * 1.3) * W * 0.3 + Math.sin(el * 0.7) * W * 0.1;
        const ty = Math.sin(el * 1.9 + 1) * H * 0.25;
        const sx = cx + tx + world.current.x;
        const sy = cy + ty + world.current.y;
        const on = Math.hypot(sx - cx, sy - cy) <= TARGET_R + 4;
        track.current.frames += 1;
        if (on) track.current.onTarget += 1;
        ctx.fillStyle = on ? "#3ddc97" : "#ffc857";
        ctx.beginPath();
        ctx.arc(sx, sy, TARGET_R + 4, 0, Math.PI * 2);
        ctx.fill();
        if (el >= TRACK_SECONDS && flickResult.current) {
          const score = compositeScore(flickResult.current, { onTargetFraction: track.current.onTarget / Math.max(1, track.current.frames) });
          phaseRef.current = "between";
          setPhase("between");
          finishCandidate(score);
        }
      }
      // 조준점 (중앙 고정)
      ctx.strokeStyle = "#ece8e1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 10);
      ctx.stroke();
      if (p === "idle" || p === "done") {
        ctx.fillStyle = "#9da6ae";
        ctx.font = "16px Pretendard, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p === "idle" ? "DPI와 구간을 확인하고 '테스트 시작'을 누르세요" : "완료 — 아래 결과를 확인하세요", cx, H - 24);
      }
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [finishCandidate]);

  const start = () => {
    const l = Number(low);
    const h = Number(high);
    if (!(Number(dpi) > 0) || !(l > 0) || !(h > l)) {
      setMessage("DPI와 구간(하한 < 상한)을 확인하세요");
      return;
    }
    const c = candidates(l, h);
    const r: Round = { index: 0, low: l, high: h, a: c.a, b: c.b, scoreA: null, scoreB: null };
    setResult(null);
    setRound(r);
    startCandidate(r, "a");
    canvasRef.current?.requestPointerLock();
  };
  const stop = () => {
    document.exitPointerLock?.();
    setPhaseBoth("idle");
    setRound(null);
    setMessage("");
  };

  const dpiNum = Number(dpi) || 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_1fr] sm:items-end">
        <label className="block">
          <span className="label">마우스 DPI</span>
          <input value={dpi} onChange={(e) => setDpi(e.target.value)} inputMode="numeric" className="input w-28 font-mono" disabled={phase !== "idle" && phase !== "done"} />
        </label>
        <label className="block">
          <span className="label">감도 하한</span>
          <input value={low} onChange={(e) => setLow(e.target.value)} inputMode="decimal" className="input w-28 font-mono" disabled={phase !== "idle" && phase !== "done"} />
        </label>
        <label className="block">
          <span className="label">감도 상한</span>
          <input value={high} onChange={(e) => setHigh(e.target.value)} inputMode="decimal" className="input w-28 font-mono" disabled={phase !== "idle" && phase !== "done"} />
        </label>
        <div className="flex gap-2">
          {phase === "idle" || phase === "done" ? (
            <button type="button" onClick={start} className="btn-primary">
              테스트 시작 ({ROUNDS}라운드)
            </button>
          ) : (
            <button type="button" onClick={stop} className="btn-danger">
              중단
            </button>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-md border border-line" style={{ aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} className="block h-full w-full cursor-crosshair" aria-label="조준 테스트 캔버스" />
        {message ? <div className="pointer-events-none absolute left-3 top-3 rounded-sm bg-base/80 px-2 py-1 text-xs text-primary">{message}</div> : null}
        {round ? (
          <div className="pointer-events-none absolute right-3 top-3 rounded-sm bg-base/80 px-2 py-1 font-mono text-xs text-secondary">
            구간 {round.low}–{round.high} · A {round.a}
            {round.scoreA != null ? ` (${round.scoreA})` : ""} · B {round.b}
            {round.scoreB != null ? ` (${round.scoreB})` : ""}
          </div>
        ) : null}
      </div>

      {result ? (
        <form action={saveAction} className="card flex flex-wrap items-center gap-4 p-4">
          <input type="hidden" name="dpi" value={dpiNum} />
          <input type="hidden" name="sens" value={result.sens} />
          <div className="font-mono text-sm">
            추천 감도 <span className="text-lg font-bold text-primary">{result.sens}</span>
            <span className="text-secondary"> · eDPI {edpi(dpiNum, result.sens)} · 360° {cmPer360(dpiNum, result.sens)}cm</span>
          </div>
          <span className="text-xs text-secondary">
            좁혀진 구간 {result.low}–{result.high}
          </span>
          <button type="submit" className="btn-primary ml-auto min-h-9 px-3 text-xs" data-testid="save-sens" disabled={savePending}>
            {savePending ? "저장 중…" : "내 프로필에 저장"}
          </button>
          {saveResult?.ok ? <span className="text-xs text-success">저장했습니다.</span> : null}
          {saveResult && !saveResult.ok ? <span className="text-xs text-accent-hover">{saveResult.error}</span> : null}
        </form>
      ) : null}
      <p className="text-xs text-muted">
        캔버스 폭을 시야각 103°로 보고 마우스 1카운트 = 0.07° × 감도로 옮깁니다. 3D 투영이 없어 게임과 완전히 같지는 않으며, 범위를 좁히는 용도입니다. 포인터 잠금은 Esc로 풀립니다.
      </p>
    </div>
  );
}
