// audio.ts — 절차생성 사운드(Web Audio API 전용). 외부 오디오 파일 0개.
//
// ★ 왜 파일이 아니라 코드로 소리를 만드나
//   외부 mp3/wav 는 출처·라이선스 리스크가 남는다. 여기 나는 소리는 전부
//   OscillatorNode / 화이트노이즈 버퍼 + GainNode 로 «런타임 합성»한 8비트풍
//   레트로 사운드라, 저작권 문제가 원천적으로 없다(에셋 0바이트, 번들 증가 0).
//
// ★ 브라우저 자동재생 정책 (중요)
//   Chrome/Safari 는 «사용자 제스처» 없이 AudioContext 를 재생시키지 않는다.
//   그래서 initAudio() 는 반드시 첫 pointerdown/keydown 핸들러 «안에서» 불려야
//   한다. 배선 방법은 파일 맨 아래 「main.ts 배선법」 주석 참조.
//   initAudio() 는 여러 번 불러도 안전하다(이미 준비됐으면 resume 만 시도).
//
// ★ 미초기화 상태에서 play*() 를 불러도 «조용히 no-op» 이다. 절대 throw 하지
//   않는다 — 사운드 때문에 게임 루프가 죽는 일은 없어야 한다.

// ── 믹스 기본값 ────────────────────────────────────────────────────────────
// BGM 은 SFX 보다 확실히 아래에 깔린다(체감 약 -13 dB).
//   SFX  실효 피크 ≈ master(0.9) × sfx(0.55) × 이벤트피크(0.5)  ≈ 0.248
//   BGM  실효 피크 ≈ master(0.9) × bgm(0.18) × 악기피크(0.35)   ≈ 0.057
export const AUDIO_MIX_DEFAULT = {
  master: 0.9,
  sfx: 0.55,
  bgm: 0.18,
} as const;

// ── 내부 상태 ──────────────────────────────────────────────────────────────
let ctx: BaseAudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
let bgmBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let visibilityHooked = false;

let mix = { ...AUDIO_MIX_DEFAULT } as { master: number; sfx: number; bgm: number };

/**
 * 실시간 컨텍스트일 때만 반환(오프라인 렌더 테스트에서는 null).
 * ★ OfflineAudioContext 에도 resume()/state 가 있다 — 그걸로 판별하면 안 된다.
 *   렌더 시작 전 offline.resume() 은 InvalidStateError 를 던진다. 판별은
 *   startRendering() 유무로 한다.
 */
function liveCtx(): AudioContext | null {
  const c = ctx as (AudioContext & { startRendering?: unknown }) | null;
  if (!c) return null;
  if (typeof c.startRendering === 'function') return null; // OfflineAudioContext
  return typeof c.resume === 'function' ? c : null;
}

// ── 초기화 ─────────────────────────────────────────────────────────────────

export interface InitAudioOptions {
  /**
   * 테스트용 주입구. OfflineAudioContext 를 넣으면 소리를 «파일로 렌더»해서
   * 파형을 직접 검산할 수 있다(src/_audio_test.html 이 이 경로를 쓴다).
   * 게임 코드에서는 넘기지 않는다.
   */
  context?: BaseAudioContext;
  /** 탭이 백그라운드로 가면 자동 suspend(기본 true). 오프라인 렌더에선 무시. */
  autoSuspendOnHidden?: boolean;
}

/**
 * 오디오 그래프를 세운다. **반드시 사용자 제스처(pointerdown/keydown) 안에서** 호출.
 * @returns 준비 완료 여부. 실패해도 throw 하지 않는다.
 */
export function initAudio(opts: InitAudioOptions = {}): boolean {
  try {
    if (ctx) {
      // 이미 세워져 있으면 «깨우기»만. iOS 는 전화/알림 후 임의로 suspend 시킨다.
      const live = liveCtx();
      if (live && live.state === 'suspended') void live.resume();
      return true;
    }

    if (opts.context) {
      ctx = opts.context;
    } else {
      const Ctor: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
    }

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : mix.master;
    masterGain.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = mix.sfx;
    sfxBus.connect(masterGain);

    bgmBus = ctx.createGain();
    bgmBus.gain.value = mix.bgm;
    bgmBus.connect(masterGain);

    noiseBuf = makeNoiseBuffer(ctx);

    const live = liveCtx();
    if (live && live.state === 'suspended') void live.resume();

    if (opts.autoSuspendOnHidden !== false && live && !visibilityHooked
        && typeof document !== 'undefined') {
      visibilityHooked = true;
      document.addEventListener('visibilitychange', () => {
        const c = liveCtx();
        if (!c) return;
        if (document.hidden) void c.suspend();
        else void c.resume();
      });
    }
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

export function isAudioReady(): boolean {
  return !!ctx && !!sfxBus && !!bgmBus;
}

/** 현재 컨텍스트 시각(초). 미초기화면 0. 스케줄 계산·테스트용. */
export function audioNow(): number {
  return ctx ? ctx.currentTime : 0;
}

// ── 볼륨/뮤트 ──────────────────────────────────────────────────────────────

export function setMuted(v: boolean): void {
  muted = v;
  if (masterGain && ctx) {
    // 클릭 노이즈 방지용 20ms 램프.
    masterGain.gain.setTargetAtTime(v ? 0 : mix.master, ctx.currentTime, 0.02);
  }
}
export function isMuted(): boolean { return muted; }
export function toggleMuted(): boolean { setMuted(!muted); return muted; }

export function setMasterVolume(v: number): void {
  mix.master = clamp01(v);
  if (masterGain && !muted && ctx) masterGain.gain.setTargetAtTime(mix.master, ctx.currentTime, 0.02);
}
export function setSfxVolume(v: number): void {
  mix.sfx = clamp01(v);
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(mix.sfx, ctx.currentTime, 0.02);
}
export function setBgmVolume(v: number): void {
  mix.bgm = clamp01(v);
  if (bgmBus && ctx) bgmBus.gain.setTargetAtTime(mix.bgm, ctx.currentTime, 0.02);
}
export function getMix(): { master: number; sfx: number; bgm: number } { return { ...mix }; }

/** 탭 전환·일시정지 등에서 수동으로 쓸 수 있는 훅. */
export function suspendAudio(): void { const c = liveCtx(); if (c) void c.suspend(); }
export function resumeAudio(): void { const c = liveCtx(); if (c) void c.resume(); }

// ── 저수준 합성 헬퍼 ───────────────────────────────────────────────────────

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function makeNoiseBuffer(c: BaseAudioContext): AudioBuffer {
  // 0.5초짜리 화이트노이즈 1개를 만들어 크래시/하이햇에서 재사용(매번 만들면 GC 부담).
  // ★ Math.random() 이 아니라 «고정 시드 xorshift32» 를 쓴다. 이유는 두 가지:
  //   (1) 실행마다 크래시음 피크가 달라지면 재현 가능한 검산이 불가능하다
  //       (실측: 같은 코드가 peak 0.3626 / 0.4402 로 갈렸다).
  //   (2) 플레이어마다 같은 소리가 나야 한다.
  const len = Math.floor(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let x = 0x9e3779b9 >>> 0; // 고정 시드
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    d[i] = (x / 0xffffffff) * 2 - 1;
  }
  return buf;
}

interface ToneOpts {
  type: OscillatorType;
  /** 시작 주파수(Hz) */
  freq: number;
  /** 끝 주파수(Hz). 주면 freq→freqTo 로 지수 스윕. */
  freqTo?: number;
  /** 스윕에 쓰는 시간(초). 기본 dur */
  sweep?: number;
  /** 게인 피크(0~1) */
  peak: number;
  /** 총 길이(초) */
  dur: number;
  /** 어택(초) */
  attack?: number;
  /** 시작 시각(컨텍스트 절대시각). 기본 now */
  at?: number;
  /** 출력 버스. 기본 sfxBus */
  bus?: GainNode | null;
  /** 디튠(cents) */
  detune?: number;
}

/** 오실레이터 1개 + ADSR 1개. 스케줄만 걸고 즉시 반환한다. */
function tone(o: ToneOpts): void {
  if (!ctx) return;
  const bus = o.bus === undefined ? sfxBus : o.bus;
  if (!bus) return;

  const t0 = o.at === undefined ? ctx.currentTime : o.at;
  const atk = o.attack === undefined ? 0.004 : o.attack;
  const end = t0 + o.dur;

  const osc = ctx.createOscillator();
  osc.type = o.type;
  if (o.detune) osc.detune.value = o.detune;
  osc.frequency.setValueAtTime(Math.max(1, o.freq), t0);
  if (o.freqTo !== undefined) {
    const sw = o.sweep === undefined ? o.dur : o.sweep;
    // exponentialRamp 는 0/음수 불가 → 하한 1Hz.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), t0 + sw);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(end + 0.02);
}

interface NoiseOpts {
  peak: number;
  dur: number;
  /** 로우패스 시작 컷오프(Hz) */
  cutoff: number;
  /** 로우패스 끝 컷오프(Hz). 주면 스윕. */
  cutoffTo?: number;
  at?: number;
  bus?: GainNode | null;
  /** 노이즈 재생속도(음색 거칠기) */
  rate?: number;
}

/** 화이트노이즈 버스트(크래시·하이햇). */
function noise(o: NoiseOpts): void {
  if (!ctx || !noiseBuf) return;
  const bus = o.bus === undefined ? sfxBus : o.bus;
  if (!bus) return;

  const t0 = o.at === undefined ? ctx.currentTime : o.at;
  const end = t0 + o.dur;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(o.cutoff, t0);
  if (o.cutoffTo !== undefined) {
    lp.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffTo), end);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.peak, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(lp); lp.connect(g); g.connect(bus);
  src.start(t0);
  src.stop(end + 0.02);
}

/** MIDI 노트번호 → Hz. A4(69) = 440. */
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── SFX ────────────────────────────────────────────────────────────────────
//
// 3종 착지음은 «음높이 방향 / 음 개수 / 음색 / 길이» 네 축이 전부 다르게
// 설계돼 있다. 헷갈릴 수 없게 하는 게 목적이다.
//
//   perfect : 4음 상승 아르페지오 C6→C7 (1046→2093Hz) · square · 0.47s
//   normal  : 단일 비프 C5 (523Hz)                     · triangle · 0.16s
//   crash   : 하강 스윕 420→60Hz + 노이즈              · saw+noise · 0.60s

/** 점프(이함): 상승 스윕 블립. */
export function playJumpSfx(at?: number): void {
  if (!isAudioReady()) return;
  const t = at === undefined ? audioNow() : at;
  tone({ type: 'square', freq: 240, freqTo: 780, sweep: 0.11, peak: 0.50, dur: 0.14, at: t });
  // 살짝 위 옥타브를 얇게 겹쳐 «톡» 하는 어택을 만든다.
  tone({ type: 'triangle', freq: 480, freqTo: 1560, sweep: 0.11, peak: 0.16, dur: 0.12, at: t });
}

/** 완전착지: 밝은 4음 상승 아르페지오(C6-E6-G6-C7). */
export function playPerfectLandingSfx(at?: number): void {
  if (!isAudioReady()) return;
  const t = at === undefined ? audioNow() : at;
  const notes = [84, 88, 91, 96]; // C6 E6 G6 C7
  for (let i = 0; i < notes.length; i++) {
    const f = midiToFreq(notes[i]);
    const start = t + i * 0.055;
    const dur = i === notes.length - 1 ? 0.30 : 0.13;
    tone({ type: 'square', freq: f, peak: 0.34, dur, at: start, attack: 0.003 });
    // 한 옥타브 아래 삼각파를 얇게 깔아 «찢어지는» 느낌을 죽인다.
    tone({ type: 'triangle', freq: f / 2, peak: 0.12, dur, at: start, attack: 0.003 });
  }
}

/** 보통착지: 단일 중음 비프 + 짧은 흙먼지 노이즈. */
export function playNormalLandingSfx(at?: number): void {
  if (!isAudioReady()) return;
  const t = at === undefined ? audioNow() : at;
  tone({ type: 'triangle', freq: midiToFreq(72), peak: 0.40, dur: 0.10, at: t, attack: 0.003 }); // C5 523.25Hz
  noise({ peak: 0.16, dur: 0.07, cutoff: 700, cutoffTo: 220, at: t, rate: 0.8 }); // 착지 «툭»
}

/** 크래시(전복): 하강 스윕 + 노이즈 파열 + 저역 쿵. */
export function playCrashSfx(at?: number): void {
  if (!isAudioReady()) return;
  const t = at === undefined ? audioNow() : at;
  tone({ type: 'sawtooth', freq: 420, freqTo: 60, sweep: 0.55, peak: 0.40, dur: 0.58, at: t });
  noise({ peak: 0.50, dur: 0.45, cutoff: 3000, cutoffTo: 300, at: t, rate: 1 });
  tone({ type: 'square', freq: 90, freqTo: 45, sweep: 0.25, peak: 0.30, dur: 0.28, at: t });
}

/**
 * 착지 품질별 SFX 디스패처.
 * main.ts 의 judgeLanding() 결과(LandingQuality)를 그대로 넘기면 된다.
 */
export function playLandingSfx(quality: 'perfect' | 'normal' | 'crash', at?: number): void {
  if (quality === 'perfect') playPerfectLandingSfx(at);
  else if (quality === 'crash') playCrashSfx(at);
  else playNormalLandingSfx(at);
}

// ── BGM (절차생성 8마디 루프) ───────────────────────────────────────────────
//
// 132 BPM, 16분음표 스텝 = 60/132/4 = 0.113636s.
// 8마디 × 16스텝 = 128스텝 → 루프 길이 14.545s (요구 10~20s 구간).
// 화성은 I-IV-V-I(C-F-G-C). 멜로디는 C장조 안에서만 움직인다.

export const BGM_TEMPO_BPM = 132;
export const BGM_STEPS_PER_BAR = 16;
export const BGM_BARS = 8;
export const BGM_STEP_SECONDS = 60 / BGM_TEMPO_BPM / 4;
export const BGM_TOTAL_STEPS = BGM_BARS * BGM_STEPS_PER_BAR;
export const BGM_LOOP_SECONDS = BGM_TOTAL_STEPS * BGM_STEP_SECONDS;

type Bar = (number | null)[]; // 16칸, MIDI 노트 or 쉼표

const BAR_A: Bar = [72, null, 76, null, 79, null, 76, null, 81, null, 79, null, 76, null, 74, null];
const BAR_B: Bar = [74, null, 77, null, 81, null, 77, null, 84, null, 81, null, 79, null, 76, null];
const BAR_C: Bar = [71, null, 74, null, 79, null, 74, null, 83, null, 79, null, 77, null, 74, null];
const BAR_D: Bar = [72, 74, 76, 79, 81, null, 79, 76, 74, null, 72, null, 67, null, null, null];
const BAR_E: Bar = [79, null, 76, null, 72, null, 74, null, 76, null, 79, null, 84, null, null, null];
// ★ 마지막 마디는 «루프 이음매» 전용이다. BAR_D 로 끝내면 12스텝 이후가 전부
//   쉼표라 루프가 도는 지점에 0.25초짜리 «구멍»이 생긴다(실측 tailRms 0.00046
//   = 사실상 무음). 14스텝에 이끔음 B4(71) 를 두어 다음 바퀴 첫 음 C5(72) 로
//   자연스럽게 넘어가게 하고, 동시에 이음매를 소리로 메운다.
const BAR_F: Bar = [72, 74, 76, 79, 81, null, 79, 76, 74, null, 72, null, 67, null, 71, null];

/** 8마디 멜로디(마디 배열). */
export const BGM_MELODY_BARS: Bar[] = [BAR_A, BAR_B, BAR_C, BAR_D, BAR_A, BAR_B, BAR_E, BAR_F];
/** 마디별 베이스 근음(MIDI). C3-F3-G3-C3 × 2 */
export const BGM_BASS_ROOTS: number[] = [48, 53, 55, 48, 48, 53, 55, 48];

/** 악기별 피크(버스 입력 기준). BGM 버스 게인(0.18)이 다시 곱해진다. */
const BGM_LEVEL = { lead: 0.30, bass: 0.35, hat: 0.06, snare: 0.10 } as const;

/**
 * 루프 «한 바퀴»를 절대시각 t0 부터 통째로 스케줄한다.
 * 라이브 재생기와 오프라인 검산이 같은 함수를 쓴다(소리가 갈라지지 않게).
 * @returns 스케줄된 노트 수(검산용)
 */
export function scheduleBgmLoopAt(t0: number): number {
  if (!isAudioReady() || !bgmBus) return 0;
  let n = 0;

  for (let bar = 0; bar < BGM_BARS; bar++) {
    const barT = t0 + bar * BGM_STEPS_PER_BAR * BGM_STEP_SECONDS;
    const pattern = BGM_MELODY_BARS[bar];
    const root = BGM_BASS_ROOTS[bar];

    // 리드(스퀘어) — 8비트 특유의 «삑삑»
    for (let s = 0; s < BGM_STEPS_PER_BAR; s++) {
      const m = pattern[s];
      if (m === null || m === undefined) continue;
      tone({
        type: 'square', freq: midiToFreq(m), peak: BGM_LEVEL.lead,
        dur: BGM_STEP_SECONDS * 1.7, at: barT + s * BGM_STEP_SECONDS,
        attack: 0.005, bus: bgmBus,
      });
      n++;
    }

    // 베이스(삼각파) — 4분음표 root/root/5th/root
    const bassSteps = [0, 4, 8, 12];
    const bassNotes = [root, root, root + 7, root];
    for (let i = 0; i < 4; i++) {
      tone({
        type: 'triangle', freq: midiToFreq(bassNotes[i]), peak: BGM_LEVEL.bass,
        dur: BGM_STEP_SECONDS * 3.2, at: barT + bassSteps[i] * BGM_STEP_SECONDS,
        attack: 0.006, bus: bgmBus,
      });
      n++;
    }

    // 드럼 — 8비트 하이햇 + 2·4박 스네어
    for (let s = 0; s < BGM_STEPS_PER_BAR; s += 2) {
      noise({
        peak: BGM_LEVEL.hat, dur: 0.035, cutoff: 9000, cutoffTo: 5000,
        at: barT + s * BGM_STEP_SECONDS, bus: bgmBus, rate: 1.6,
      });
      n++;
    }
    for (const s of [4, 12]) {
      noise({
        peak: BGM_LEVEL.snare, dur: 0.12, cutoff: 2600, cutoffTo: 700,
        at: barT + s * BGM_STEP_SECONDS, bus: bgmBus, rate: 1,
      });
      n++;
    }
  }
  return n;
}

// 라이브 루프 재생기.
// ★ 16분음표마다 깨는 «lookahead 스케줄러»를 쓰지 않는다. 백그라운드 탭에서
//   setTimeout 이 1초로 스로틀되면 그런 스케줄러는 음이 끊긴다. 대신 루프
//   한 바퀴(14.5s)를 통째로 미리 걸고, 다음 바퀴만 1.5초 전에 예약한다.
const BGM_SCHEDULE_AHEAD = 1.5; // 초
let bgmPlaying = false;
let bgmNextLoopStart = 0;
let bgmTimer: ReturnType<typeof setTimeout> | null = null;

function bgmTick(): void {
  if (!bgmPlaying || !ctx) return;
  const now = ctx.currentTime;

  // 스로틀/suspend 로 크게 밀렸으면 «따라잡기» 대신 현재 시각으로 재동기화.
  // (안 하면 밀린 만큼의 루프가 한꺼번에 쏟아져 소리가 뭉갠다.)
  if (bgmNextLoopStart < now - 0.25) bgmNextLoopStart = now + 0.05;

  if (bgmNextLoopStart - now <= BGM_SCHEDULE_AHEAD) {
    scheduleBgmLoopAt(bgmNextLoopStart);
    bgmNextLoopStart += BGM_LOOP_SECONDS;
  }

  const waitMs = Math.max(200, (bgmNextLoopStart - ctx.currentTime - BGM_SCHEDULE_AHEAD) * 1000);
  bgmTimer = setTimeout(bgmTick, waitMs);
}

/** BGM 루프 시작(이미 재생 중이면 무시). initAudio() 이후에만 동작. */
export function playBgmLoop(): void {
  if (!isAudioReady() || bgmPlaying || !ctx) return;
  bgmPlaying = true;
  bgmNextLoopStart = ctx.currentTime + 0.08; // 첫 노트가 잘리지 않게 살짝 뒤에서 시작
  bgmTick();
}

/** BGM 정지. 이미 스케줄된 잔여음(최대 루프 1바퀴)은 페이드로 눌러 끈다. */
export function stopBgm(): void {
  bgmPlaying = false;
  if (bgmTimer !== null) { clearTimeout(bgmTimer); bgmTimer = null; }
  if (bgmBus && ctx) {
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
}

/** stopBgm() 이후 다시 켤 때 버스 게인을 되돌린다. */
export function restoreBgmVolume(): void {
  if (bgmBus && ctx) bgmBus.gain.setTargetAtTime(mix.bgm, ctx.currentTime, 0.05);
}

export function isBgmPlaying(): boolean { return bgmPlaying; }

/** 테스트/재초기화용. 게임 코드에서는 쓰지 않는다. */
export function _resetAudioForTest(): void {
  stopBgm();
  ctx = null; masterGain = null; sfxBus = null; bgmBus = null; noiseBuf = null;
  mix = { ...AUDIO_MIX_DEFAULT };
}

// ─────────────────────────────────────────────────────────────────────────────
// main.ts 배선법 (이 파일은 main.ts 를 직접 건드리지 않는다 — 배선은 main.ts
// 담당자가 아래를 그대로 붙이면 된다)
//
//   import {
//     initAudio, playBgmLoop, playJumpSfx, playLandingSfx,
//   } from './audio';
//
//   // 1) 첫 사용자 제스처에서 초기화 + BGM 시작 (필수: 제스처 «안»)
//   let audioStarted = false;
//   function startAudioOnce() {
//     if (audioStarted) return;
//     if (!initAudio()) return;   // 실패해도 게임은 그대로 진행
//     audioStarted = true;
//     playBgmLoop();
//   }
//   // 기존 canvas pointerdown 핸들러 «맨 앞»에 startAudioOnce(); 한 줄,
//   // 기존 window keydown(Space) 핸들러 «맨 앞»에도 startAudioOnce(); 한 줄.
//
//   // 2) update() 안 — 이함
//   if (ev.liftoff === 'pad') { ... playJumpSfx(); }
//   else if (ev.liftoff === 'natural') { ... playJumpSfx(); }
//
//   // 3) update() 안 — 착지(quality 는 judgeLanding() 결과 그대로)
//   const quality = judgeLanding(relDeg);
//   playLandingSfx(quality);     // 'perfect' | 'normal' | 'crash' 자동 분기
//
// 모든 play* 는 initAudio() 전이면 조용히 no-op 이므로 호출 순서를 신경 쓸
// 필요가 없다(오디오 때문에 게임 루프가 죽지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
