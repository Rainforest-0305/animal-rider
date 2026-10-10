// _audio_test.ts — audio.ts 단독 검증 하네스(개발 전용, 번들 미포함).
//
// 두 가지를 한다.
//  (1) 버튼 클릭 = 실제 스피커로 소리 확인(사람 귀 검증)
//  (2) 「자동 검산」 = OfflineAudioContext 로 «실제 렌더된 PCM» 을 분석해
//      피크/길이/음높이 방향/온셋 개수를 숫자로 뽑는다. 헤드리스에서도 돈다.
//      window.__audioTest.run() 로 Playwright 가 그대로 호출한다.
//
// 실행: npm run dev → http://localhost:5183/src/_audio_test.html

import {
  initAudio, isAudioReady, playJumpSfx, playLandingSfx, playCrashSfx,
  playBgmLoop, stopBgm, restoreBgmVolume, scheduleBgmLoopAt, _resetAudioForTest,
  BGM_LOOP_SECONDS, BGM_STEP_SECONDS, BGM_TOTAL_STEPS, AUDIO_MIX_DEFAULT,
  setMuted, isMuted, audioNow, isBgmPlaying,
} from './audio';

// ── 분석 유틸 ───────────────────────────────────────────────────────────────

interface Metrics {
  peak: number;
  rms: number;
  /** 피크의 1% 를 넘는 구간 길이(초) — 체감 지속시간 */
  activeSeconds: number;
  /** 엔벨로프 온셋(새 음 시작) 개수 */
  onsets: number;
  /** 활성 구간 앞 15% 의 영교차 추정 주파수(Hz) */
  freqStartHz: number;
  /** 활성 구간 뒤 15% 의 영교차 추정 주파수(Hz) */
  freqEndHz: number;
  /** 상승/하강/평탄 */
  pitchDir: 'up' | 'down' | 'flat';
}

function zeroCrossFreq(d: Float32Array, from: number, to: number, sr: number): number {
  let zc = 0;
  const noiseFloor = 1e-4;
  let prev = 0;
  for (let i = from; i < to; i++) {
    const v = d[i];
    if (Math.abs(v) < noiseFloor) continue;
    if (prev !== 0 && (v > 0) !== (prev > 0)) zc++;
    prev = v;
  }
  const secs = (to - from) / sr;
  return secs > 0 ? zc / 2 / secs : 0;
}

function analyze(buf: AudioBuffer): Metrics {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;

  let peak = 0, sumSq = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sumSq += d[i] * d[i];
  }
  const rms = Math.sqrt(sumSq / d.length);

  // 활성 구간(피크 1% 초과)
  const thr = peak * 0.01;
  let first = -1, last = -1;
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) > thr) { if (first < 0) first = i; last = i; }
  }
  if (first < 0) { first = 0; last = 0; }
  const activeSeconds = (last - first) / sr;

  // 5ms 창 RMS 엔벨로프 → 온셋 카운트
  const win = Math.max(1, Math.floor(sr * 0.005));
  const env: number[] = [];
  for (let i = first; i + win <= last; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) s += d[i + k] * d[i + k];
    env.push(Math.sqrt(s / win));
  }
  const envMax = env.reduce((a, b) => Math.max(a, b), 0);
  let onsets = 0;
  let armed = true;
  for (let i = 1; i < env.length; i++) {
    const strong = env[i] > envMax * 0.28;
    const rising = env[i] > env[i - 1] * 1.5;
    if (armed && strong && rising) { onsets++; armed = false; }
    if (env[i] < envMax * 0.16) armed = true;
  }
  if (onsets === 0 && envMax > 0) onsets = 1;

  const span = last - first;
  const headTo = first + Math.max(1, Math.floor(span * 0.15));
  const tailFrom = last - Math.max(1, Math.floor(span * 0.15));
  const freqStartHz = zeroCrossFreq(d, first, headTo, sr);
  const freqEndHz = zeroCrossFreq(d, tailFrom, last, sr);
  const ratio = freqStartHz > 0 ? freqEndHz / freqStartHz : 1;
  const pitchDir: Metrics['pitchDir'] = ratio > 1.25 ? 'up' : ratio < 0.8 ? 'down' : 'flat';

  return {
    peak: +peak.toFixed(4), rms: +rms.toFixed(5),
    activeSeconds: +activeSeconds.toFixed(3), onsets,
    freqStartHz: Math.round(freqStartHz), freqEndHz: Math.round(freqEndHz), pitchDir,
  };
}

const SR = 48000;

async function renderOffline(seconds: number, fill: () => void): Promise<AudioBuffer> {
  _resetAudioForTest();
  const OC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const octx = new OC(1, Math.ceil(SR * seconds), SR);
  const ok = initAudio({ context: octx });
  if (!ok) throw new Error('initAudio(offline) 실패');
  fill();
  const buf = await octx.startRendering();
  _resetAudioForTest();
  return buf;
}

// ── 자동 검산 본체 ──────────────────────────────────────────────────────────

export interface AudioTestReport {
  sfx: Record<string, Metrics>;
  bgm: {
    scheduledNotes: number;
    loopSeconds: number;
    stepSeconds: number;
    totalSteps: number;
    peak: number;
    rms: number;
    /** 1초 구간별 RMS — 루프 전체에 소리가 고르게 있는지 */
    perSecondRms: number[];
    /** 무음(RMS<0.001) 1초 구간 수 — 0 이어야 정상 */
    silentSeconds: number;
    /** 루프 마지막 0.3s RMS (루프 이음매에 큰 구멍이 없는지) */
    tailRms: number;
  };
  mixCheck: {
    sfxPeak: number;
    bgmPeak: number;
    ratio: number;
    bgmQuieterThanSfx: boolean;
  };
  verdict: string[];
}

async function run(): Promise<AudioTestReport> {
  const sfx: Record<string, Metrics> = {};
  sfx.jump = analyze(await renderOffline(1.0, () => playJumpSfx(0)));
  sfx.perfect = analyze(await renderOffline(1.2, () => playLandingSfx('perfect', 0)));
  sfx.normal = analyze(await renderOffline(1.0, () => playLandingSfx('normal', 0)));
  sfx.crash = analyze(await renderOffline(1.2, () => playLandingSfx('crash', 0)));
  sfx.crashDirect = analyze(await renderOffline(1.2, () => playCrashSfx(0)));

  // BGM 루프 한 바퀴 오프라인 렌더
  let scheduledNotes = 0;
  const bgmBuf = await renderOffline(BGM_LOOP_SECONDS + 0.5, () => {
    scheduledNotes = scheduleBgmLoopAt(0);
  });
  const bd = bgmBuf.getChannelData(0);
  let bpeak = 0, bsum = 0;
  for (let i = 0; i < bd.length; i++) {
    const a = Math.abs(bd[i]); if (a > bpeak) bpeak = a; bsum += bd[i] * bd[i];
  }
  const brms = Math.sqrt(bsum / bd.length);
  const perSecondRms: number[] = [];
  for (let s = 0; s < Math.floor(BGM_LOOP_SECONDS); s++) {
    let acc = 0;
    const from = s * SR, to = Math.min(bd.length, from + SR);
    for (let i = from; i < to; i++) acc += bd[i] * bd[i];
    perSecondRms.push(+Math.sqrt(acc / (to - from)).toFixed(5));
  }
  const silentSeconds = perSecondRms.filter((v) => v < 0.001).length;
  let tailAcc = 0;
  const tFrom = Math.floor((BGM_LOOP_SECONDS - 0.3) * SR), tTo = Math.floor(BGM_LOOP_SECONDS * SR);
  for (let i = tFrom; i < tTo; i++) tailAcc += bd[i] * bd[i];
  const tailRms = +Math.sqrt(tailAcc / (tTo - tFrom)).toFixed(5);

  const sfxPeak = Math.max(sfx.jump.peak, sfx.perfect.peak, sfx.normal.peak, sfx.crash.peak);
  const report: AudioTestReport = {
    sfx,
    bgm: {
      scheduledNotes,
      loopSeconds: +BGM_LOOP_SECONDS.toFixed(4),
      stepSeconds: +BGM_STEP_SECONDS.toFixed(6),
      totalSteps: BGM_TOTAL_STEPS,
      peak: +bpeak.toFixed(4), rms: +brms.toFixed(5),
      perSecondRms, silentSeconds, tailRms,
    },
    mixCheck: {
      sfxPeak, bgmPeak: +bpeak.toFixed(4),
      ratio: +(sfxPeak / Math.max(1e-9, bpeak)).toFixed(2),
      bgmQuieterThanSfx: bpeak < sfxPeak,
    },
    verdict: [],
  };

  // 판정 — DoD 기준
  const v = report.verdict;
  const ok = (c: boolean, msg: string) => v.push(`${c ? 'PASS' : 'FAIL'} ${msg}`);
  ok(sfx.jump.peak > 0.05, `점프 SFX 소리남 peak=${sfx.jump.peak}`);
  ok(sfx.jump.pitchDir === 'up', `점프=상승 스윕 ${sfx.jump.freqStartHz}→${sfx.jump.freqEndHz}Hz`);
  ok(sfx.perfect.onsets >= 3, `perfect=다음(多音) 아르페지오 onsets=${sfx.perfect.onsets}`);
  ok(sfx.perfect.pitchDir === 'up', `perfect=상승 ${sfx.perfect.freqStartHz}→${sfx.perfect.freqEndHz}Hz`);
  ok(sfx.normal.onsets <= 2, `normal=단발 비프 onsets=${sfx.normal.onsets}`);
  ok(sfx.normal.activeSeconds < sfx.perfect.activeSeconds,
     `normal(${sfx.normal.activeSeconds}s) < perfect(${sfx.perfect.activeSeconds}s) 길이 구분`);
  ok(sfx.crash.pitchDir === 'down', `crash=하강 ${sfx.crash.freqStartHz}→${sfx.crash.freqEndHz}Hz`);
  ok(sfx.crash.activeSeconds > sfx.normal.activeSeconds,
     `crash(${sfx.crash.activeSeconds}s) > normal(${sfx.normal.activeSeconds}s) 길이 구분`);
  ok(JSON.stringify(sfx.crash) === JSON.stringify(sfx.crashDirect),
     `playLandingSfx('crash') === playCrashSfx()`);
  ok(sfx.perfect.freqStartHz > sfx.normal.freqStartHz * 1.4,
     `perfect(${sfx.perfect.freqStartHz}Hz) 가 normal(${sfx.normal.freqStartHz}Hz) 보다 확실히 높음`);
  ok(BGM_LOOP_SECONDS >= 10 && BGM_LOOP_SECONDS <= 20, `BGM 루프 ${BGM_LOOP_SECONDS.toFixed(2)}s ∈ [10,20]`);
  // 리드 68(A8+B8+C8+D10+A8+B8+E7+F11) + 베이스 32 + 하이햇 64 + 스네어 16 = 180
  ok(scheduledNotes === 180, `BGM 스케줄 노트수=${scheduledNotes} (예상 180)`);
  ok(silentSeconds === 0, `BGM 무음 구간 ${silentSeconds}개`);
  ok(tailRms > 0.001, `BGM 루프 끝 RMS=${tailRms} (이음매 구멍 없음)`);
  ok(report.mixCheck.bgmQuieterThanSfx,
     `믹스: BGM peak ${report.mixCheck.bgmPeak} < SFX peak ${sfxPeak} (배율 ${report.mixCheck.ratio}x)`);
  return report;
}

(window as any).__audioTest = {
  run, analyze,
  // 라이브(실시간) 경로 스모크용 — 오프라인 렌더로는 못 잡는 부분
  // (실제 AudioContext 기동 / BGM 루프 재무장 타이머)을 밖에서 찔러본다.
  mod: {
    initAudio, isAudioReady, audioNow, isBgmPlaying,
    playBgmLoop, stopBgm, restoreBgmVolume,
    playJumpSfx, playLandingSfx, BGM_LOOP_SECONDS,
  },
};

// ── 수동 확인 UI ───────────────────────────────────────────────────────────

const log = document.getElementById('log') as HTMLPreElement;
const out = document.getElementById('out') as HTMLPreElement;
function say(s: string) { log.textContent = `${s}\n${log.textContent}`.slice(0, 4000); }

const harness = document.getElementById('harness') as HTMLDivElement;
function btn(label: string, fn: () => void) {
  const b = document.createElement('button');
  b.className = 'hbtn'; b.textContent = label;
  b.addEventListener('click', () => { fn(); });
  harness.appendChild(b);
}

// ★ 첫 버튼 클릭(= 사용자 제스처) 안에서 initAudio() 를 부른다. 게임에서도 동일.
function ensure(): boolean {
  const ok = initAudio();
  if (!ok) { say('initAudio() 실패 — AudioContext 없음'); return false; }
  return isAudioReady();
}

btn('initAudio()', () => { say(`initAudio → ready=${ensure()} mix=${JSON.stringify(AUDIO_MIX_DEFAULT)}`); });
btn('점프', () => { if (ensure()) { playJumpSfx(); say('playJumpSfx()'); } });
btn('착지 perfect', () => { if (ensure()) { playLandingSfx('perfect'); say("playLandingSfx('perfect')"); } });
btn('착지 normal', () => { if (ensure()) { playLandingSfx('normal'); say("playLandingSfx('normal')"); } });
btn('착지 crash', () => { if (ensure()) { playLandingSfx('crash'); say("playLandingSfx('crash')"); } });
btn('3종 연속', () => {
  if (!ensure()) return;
  playLandingSfx('perfect');
  setTimeout(() => playLandingSfx('normal'), 900);
  setTimeout(() => playLandingSfx('crash'), 1800);
  say('perfect → normal → crash (0.9s 간격)');
});
btn('BGM 시작', () => { if (ensure()) { restoreBgmVolume(); playBgmLoop(); say(`playBgmLoop() loop=${BGM_LOOP_SECONDS.toFixed(2)}s`); } });
btn('BGM 정지', () => { stopBgm(); say('stopBgm()'); });
btn('뮤트 토글', () => { if (ensure()) { setMuted(!isMuted()); say(`muted=${isMuted()}`); } });
btn('자동 검산(오프라인 렌더)', () => {
  out.textContent = '렌더 중…';
  run().then((r) => {
    out.textContent = r.verdict.join('\n') + '\n\n' + JSON.stringify(r, null, 1);
    say(`검산 완료: ${r.verdict.filter((x) => x.startsWith('PASS')).length}/${r.verdict.length} PASS`);
  }).catch((e) => { out.textContent = 'ERROR ' + e; });
});

say('준비됨. 버튼을 눌러라(자동재생 정책상 첫 클릭이 있어야 소리가 난다).');
