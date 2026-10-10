// physics.ts — ★ 물리 상수 단일 소스. Partner 결정 D1(안 A, 전 탈것 성능 동일).
// 이 파일 하나에만 물리 상수를 둔다. 등급(COMMON/RARE/EPIC/SPECIAL)별 물리값
// 매핑 테이블은 어디에도 존재하지 않는다 — 등급 차이는 스프라이트/이펙트
// 전용이며 이 파일이 다루는 범위가 아니다(2차 검토 grep 대상, 손대지 말 것).
//
// D1 폐기 사항: 등급별 성능 차등 수치표(안 B)와 "성능지수" 산식은 Partner
// 정정으로 전량 폐기됐다. 폐기 수치는 코드/문서 어디에도 재기재하지 않는다
// (원 근거는 1차설계서 v1.0 2.3절 안 B 표 및 venture-secretary 착수지시
// 4항 참조 - 이 파일에는 옮기지 않음). 등급별 물리값 매핑 테이블은 이
// 프로젝트 어디에도 존재하지 않는다.

export const GROUND_ACCEL = 900; // px/s^2, 터치 유지 중 지면 가속
export const MAX_SPEED = 1400; // px/s, 부스터 구간 제외 최고속
export const GRAVITY = 2200; // px/s^2
export const AIR_ROTATION_DEG_PER_SEC = 380; // deg/s, ★ 반시계 고정
export const CENTER_OF_MASS_OFFSET = { x: 0, y: 6 }; // px, 접지점 기준(착지 안정 판정 전용)
export const PERFECT_LANDING_TOLERANCE_DEG = 14; // |잔여각| 이내 = 완전착지(x2)
export const NORMAL_LANDING_TOLERANCE_DEG = 38; // 이 초과 = 전복(런 종료)
export const GROUND_FRICTION_COEFF = 0.06; // 무입력 시 감속(비율)

// 도약대(Launch Pad) — 3.1절 [확인]값. 물리 폐기 대상 아님(필드요소 스펙).
export const LAUNCH_PAD_SPEED_MULT = 1.45;
export const LAUNCH_PAD_ANGLE_DEG = 34;

// ────────────────────────────────────────────────────────────────────────────
// ★ 마일스톤① 지형추종 물리 (2026-08-06 추가)
// ★★ 위쪽 «기존» 상수는 값 하나도 바꾸지 않았다(무변경 결정 준수). 아래는 곡선
//     지형이 생기면서 «새로 필요해진» 지형 전용 상수이며, 기존 상수를 대체하거나
//     스케일하지 않는다. 등급별 물리값 매핑과도 무관하다.
// ────────────────────────────────────────────────────────────────────────────

/** 경사면 중력 성분 배율. 1.0 = 교과서값 a = GRAVITY·sin(θ) 그대로. */
export const SLOPE_ACCEL_SCALE = 1.0;

/**
 * 내리막 초과속 허용 배율. MAX_SPEED 자체는 «무변경»이고, 중력으로 얻은 속도에
 * 한해 이 배율까지만 넘도록 상한을 둔다(입력 가속은 여전히 MAX_SPEED 에서 멈춘다).
 * 이게 없으면 최고속 주행 중 내리막 가속이 전혀 체감되지 않는다.
 *
 * ★ 구조적 한계 기록(2026-08-06 실측) — 나중에 «오르막에서 왜 안 느려지냐»가 다시
 *   나올 때 같은 조사를 반복하지 않도록 남긴다.
 *   스톨 경사(= 터치를 유지해도 감속이 시작되는 경사)는 GROUND_ACCEL/GRAVITY
 *   = 900/2200 = 0.409(22.3°)로 «잠긴 상수»가 결정한다. 한편 지형 설계 요건인
 *   «언덕 높이 ≤180px, 파장 ≥1440px» 은 사인파 기울기 상한을 A·2π/L ≤ 90·2π/1440
 *   = 0.393 으로 묶는다. 즉 요건을 지키는 한 «오르막이 스톨 경사에 못 미친다»가
 *   수학적으로 강제되고, 최고속 주행 중 오르막 감속은 원리상 크게 날 수 없다.
 *   실측 결과도 이와 일치한다(경사별 접지 평균속: -11° 1489 / +17° 1418, 약 5%).
 *   속도 변화가 크게 체감되는 구간은 (a) 정지→가속, (b) 착지 시 법선성분 손실
 *   (실측 1680 -> 893), (c) 내리막 초과속(이 상수) 세 곳이다.
 *   이 이상을 원하면 지형 요건이나 GROUND_ACCEL/GRAVITY 중 하나를 바꿔야 하며,
 *   둘 다 내 임의 판단 범위가 아니라 상신 대상이다.
 */
export const DOWNHILL_OVERSPEED_MULT = 1.15;

/**
 * 역주행 하한. 급경사에서 속도가 0이 되면 그대로 굳어 «영구 스톨»이 되므로,
 * 뒤로 미끄러져 내려가 다시 시도할 수 있게 음수 접선속도를 허용한다.
 */
export const MIN_TANGENT_SPEED = -MAX_SPEED * 0.35;

/**
 * 이함 판정용 시험 시간(s). 지형이 요구하는 낙하율과 자유낙하율을 비교할 때 쓴다.
 * 1차항이 상쇄되어 조건식은 사실상 H''·vx² < -GRAVITY 로 수렴하므로 프레임률과 무관하다.
 */
export const LIFTOFF_PROBE_DT = 1 / 60;

/** 이 속도 미만에서는 자연 이함을 시키지 않는다(저속 미세 진동 방지). */
export const LIFTOFF_MIN_SPEED = 240;

/**
 * 공중 회전 입력이 «먹기 시작하는» 최소 지상고(px).
 * 마루를 넘을 때 생기는 수 px짜리 미세 이함에서까지 회전이 걸리면, 가속하려고
 * 터치를 유지한 것만으로 몸이 돌아가 억울한 전복이 난다. 실제 점프는 15ms 안에
 * 이 높이를 넘으므로 회전량 손실은 무시할 수준이다.
 */
export const AIR_ROTATION_MIN_CLEARANCE = 16;

/**
 * 공중에서 «회전 입력이 없을 때» 자세가 «발밑 지형각» 쪽으로 정렬되는 속도(deg/s).
 * 미세 이함이나 무입력 점프에서 이함 지형각과 착지 지형각이 달라 생기는 오판정을 막는다.
 *
 * ★ 정렬 목표를 «속도벡터»로 잡았다가 되돌린 이력(2026-08-06 헤드리스 실측):
 *   속도벡터로 잡으면 높이 떨어질수록 기수가 아래를 향해, 회전을 «한 번도 안 걸어도»
 *   평지 착지에서 상대각이 -60도까지 벌어져 전복이 났다(60초에 11회). 지형각을
 *   목표로 바꾼 뒤 같은 조건에서 0회.
 */
export const AIR_SETTLE_DEG_PER_SEC = 260;

/**
 * 위 정렬이 «구제»가 되지 않도록 하는 상한. 자세와 속도벡터의 최단호 차이가
 * 이 값을 넘으면(=회전 도중) 정렬을 아예 적용하지 않는다.
 */
export const AIR_SETTLE_MAX_DEG = 45;

// ★ 회전 보너스 상한 - Partner 결정 2 확정(2026-08-05): 물리 상수는 «무변경»,
// 회전 상한 관련 상수/캡 코드는 두지 않는다(옵션 a/b/c 전량 기각 - 완전착지
// 판정을 흔들 위험이 크다는 이유). 실도달 범위는 해석적 추정과 인게임
// 실측이 유효숫자 3자리까지 독립 수렴한 값이며, 그 근거로 스테이지 설계
// (stages.ts)의 회전 목표 티어를 그 범위에 맞춰 새로 잡는다(옵션 d).
// 원 설계서 각주가 제안했던 상한값(이 파일에는 재기재하지 않는다 - 도달
// 불가능한 죽은 값이라 문자열 자체를 남기지 않는 게 결정사항이다)은 코드
// 어디에도 없다. score.ts는 무캡으로 남는다.

// ────────────────────────────────────────────────────────────────────────────
// 지형추종 물리 함수 (순수 함수 — 상태·DOM·전역 없음, 노드에서 그대로 검산 가능)
// 지형은 «샘플러»로 주입받는다. track.ts 를 직접 import 하지 않아 이 파일은 여전히
// 물리 단일 소스로만 남고, 테스트에서 임의 지형을 꽂아 볼 수 있다.
// ────────────────────────────────────────────────────────────────────────────

export interface TerrainSampler {
  /** 월드 높이 H(x), 위쪽 + */
  heightAt(worldX: number): number;
  /** 기울기 dH/dx */
  slopeAt(worldX: number): number;
}

/** 기울기 s 에서 접선 방향 중력 성분(px/s^2). 오르막(+s)이면 음수 = 감속. */
export function slopeTangentAccel(slope: number): number {
  const sinTheta = slope / Math.sqrt(1 + slope * slope); // sin(atan(s))
  return -GRAVITY * sinTheta * SLOPE_ACCEL_SCALE;
}

/**
 * 접지 상태의 접선속도 1스텝 적분.
 * @param tangentSpeed 지표면을 따라가는 속도(+ = 전진)
 * @returns 갱신된 접선속도
 */
export function stepGroundSpeed(
  tangentSpeed: number, slope: number, touching: boolean, dt: number,
): number {
  let s = tangentSpeed;
  // 입력 가속은 MAX_SPEED 까지만 밀어준다(초과분은 오직 중력의 몫).
  const inputAccel = touching && s < MAX_SPEED ? GROUND_ACCEL : 0;
  s += (inputAccel + slopeTangentAccel(slope)) * dt;

  if (!touching) {
    const fric = GROUND_FRICTION_COEFF * MAX_SPEED * dt;
    if (s > 0) s = Math.max(0, s - fric);
    else if (s < 0) s = Math.min(0, s + fric);
  }
  // 중력으로 얻은 초과속은 상한을 두고, 평지에 오면 서서히 되돌아온다.
  if (s > MAX_SPEED) {
    s = Math.max(MAX_SPEED, s - GROUND_FRICTION_COEFF * MAX_SPEED * dt);
    s = Math.min(s, MAX_SPEED * DOWNHILL_OVERSPEED_MULT);
  }
  if (s < MIN_TANGENT_SPEED) s = MIN_TANGENT_SPEED;
  return s;
}

/**
 * 이함 판정. «지형이 요구하는 낙하율»과 «중력만으로 가능한 자유낙하율»을 비교한다.
 * 지형이 중력보다 더 급하게 꺼지면 접지를 유지할 수 없다 → 공중 전환.
 * 1차항(H'·vx·dt)이 양변에서 상쇄되므로 조건은 사실상 H''·vx² < -GRAVITY 이고,
 * 따라서 dt 선택(프레임률)에 둔감하다.
 */
export function checkLiftOff(
  worldX: number, vx: number, terrain: TerrainSampler, probeDt: number = LIFTOFF_PROBE_DT,
): boolean {
  if (Math.abs(vx) < LIFTOFF_MIN_SPEED) return false;
  const vy0 = terrain.slopeAt(worldX) * vx;                  // 지형을 따라갈 때의 수직속도
  const dyTerrain = terrain.heightAt(worldX + vx * probeDt) - terrain.heightAt(worldX);
  const dyFall = vy0 * probeDt - 0.5 * GRAVITY * probeDt * probeDt;
  return dyTerrain < dyFall;
}

/** 착지 시 속도의 접선 성분만 남긴다(법선 성분은 지면이 흡수 — 비탄성). */
export function projectOntoSlope(vx: number, vy: number, slope: number): number {
  const inv = 1 / Math.sqrt(1 + slope * slope);
  return vx * inv + vy * (slope * inv);
}

/** 두 각도의 최단호 차이(deg), (-180, 180] */
export function shortestAngleDiffDeg(fromDeg: number, toDeg: number): number {
  let d = (toDeg - fromDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * 회전 입력이 없는 동안 자세를 목표각(=발밑 지형각)으로 정렬(레이트 제한).
 * 차이가 AIR_SETTLE_MAX_DEG 를 넘으면(=회전 도중) 손대지 않는다 — 전복 구제가 되면 안 된다.
 */
export function settleAttitudeDeg(attitudeDeg: number, targetDeg: number, dt: number): number {
  const diff = shortestAngleDiffDeg(attitudeDeg, targetDeg);
  if (Math.abs(diff) > AIR_SETTLE_MAX_DEG) return attitudeDeg;
  const step = AIR_SETTLE_DEG_PER_SEC * dt;
  return attitudeDeg + Math.sign(diff) * Math.min(Math.abs(diff), step);
}

// ────────────────────────────────────────────────────────────────────────────
// 라이더 1스텝 적분 — ★ «게임이 실제로 도는 코드»가 여기 하나뿐이다.
// main.ts 는 이 함수를 호출만 하고, 헤드리스 검산 스크립트도 같은 함수를 호출한다.
// (검산이 update 로직을 재구현하면 «테스트가 틀린 값을 고정»하는 함정에 빠진다.)
// 점수/전복 처리는 여기서 하지 않는다 — 착지 이벤트만 돌려주고 판정은 호출자 몫.
// 그래야 score.ts 와의 순환 import 가 생기지 않는다.
// ────────────────────────────────────────────────────────────────────────────

export interface RiderState {
  worldX: number;
  worldY: number; // 월드 절대 높이(위쪽 +)
  vx: number;
  vy: number;
  tangentSpeed: number; // 접지 시 지표면 접선 속도
  airborne: boolean;
  rotationDeg: number; // 라이더 자세(절대각, 반시계 +)
  airRotationDeg: number; // 이번 점프에서 «입력으로» 돌린 각도(점수용)
  takeoffAngleDeg: number; // 이함 시점 지형각
  groundY: number; // 현재 worldX 의 지형 높이(캐시)
  slope: number; // 현재 worldX 의 지형 기울기(캐시)
}

export interface RiderInput {
  touching: boolean;
  /** 지금 위치가 «아직 안 쓴» 도약대인가 */
  launchPadHere: boolean;
}

export interface RiderStepResult {
  liftoff: 'none' | 'natural' | 'pad';
  landing: null | {
    /** 지형 대비 «상대각». 착지 판정은 반드시 이 값으로 한다. */
    relDeg: number;
    slopeDeg: number;
    airRotationDeg: number;
  };
}

function enterAir(s: RiderState, takeoffSlopeDeg: number) {
  s.airborne = true;
  s.takeoffAngleDeg = takeoffSlopeDeg;
  s.rotationDeg = takeoffSlopeDeg; // 자세는 이함하던 경사를 그대로 이어받는다
  s.airRotationDeg = 0;
}

export function stepRider(
  s: RiderState, dt: number, terrain: TerrainSampler, input: RiderInput,
): RiderStepResult {
  const out: RiderStepResult = { liftoff: 'none', landing: null };

  if (!s.airborne) {
    // ── 접지: 지표면을 «따라간다» ──────────────────────────────────────────
    const slope0 = terrain.slopeAt(s.worldX);
    s.tangentSpeed = stepGroundSpeed(s.tangentSpeed, slope0, input.touching, dt);
    const cosTheta = 1 / Math.sqrt(1 + slope0 * slope0);
    s.vx = s.tangentSpeed * cosTheta;
    s.worldX += s.vx * dt;

    s.groundY = terrain.heightAt(s.worldX);
    s.slope = terrain.slopeAt(s.worldX);
    s.worldY = s.groundY;
    s.vy = s.slope * s.vx;
    s.rotationDeg = (Math.atan(s.slope) * 180) / Math.PI; // 경사에 맞춰 기운다
    s.airRotationDeg = 0;

    if (input.launchPadHere && s.tangentSpeed > 0) {
      // 도약대: 발사 방향 = «지형 접선각 + 도약대 각도»
      const slopeDeg = s.rotationDeg;
      const speed = s.tangentSpeed * LAUNCH_PAD_SPEED_MULT;
      const dir = ((slopeDeg + LAUNCH_PAD_ANGLE_DEG) * Math.PI) / 180;
      s.vx = speed * Math.cos(dir);
      s.vy = speed * Math.sin(dir);
      s.worldY = s.groundY + 0.5; // 같은 스텝 재착지 방지
      enterAir(s, slopeDeg);
      out.liftoff = 'pad';
    } else if (checkLiftOff(s.worldX, s.vx, terrain)) {
      // 자연 이함: 지형이 중력보다 급하게 꺼져 접지를 유지할 수 없다.
      enterAir(s, s.rotationDeg);
      out.liftoff = 'natural';
    }
  } else {
    // ── 공중 ───────────────────────────────────────────────────────────────
    s.vy -= GRAVITY * dt;
    s.worldX += s.vx * dt;
    s.worldY += s.vy * dt;

    s.groundY = terrain.heightAt(s.worldX);
    s.slope = terrain.slopeAt(s.worldX);
    const clearance = s.worldY - s.groundY;

    if (input.touching) {
      // 마루를 스치는 수 px짜리 미세 이함에서는 회전을 걸지 않는다(억울한 전복 방지).
      if (clearance > AIR_ROTATION_MIN_CLEARANCE) {
        const d = AIR_ROTATION_DEG_PER_SEC * dt;
        s.rotationDeg += d;
        s.airRotationDeg += d;
      }
    } else {
      // 목표는 «발밑 지형각». 착지점에 가까워질수록 실제 착지 지형각으로 수렴한다.
      const groundAngleDeg = (Math.atan(s.slope) * 180) / Math.PI;
      s.rotationDeg = settleAttitudeDeg(s.rotationDeg, groundAngleDeg, dt);
    }

    if (clearance <= 0) {
      // ── 착지 ────────────────────────────────────────────────────────────
      s.worldY = s.groundY;
      const slopeDeg = (Math.atan(s.slope) * 180) / Math.PI;
      out.landing = {
        relDeg: s.rotationDeg - slopeDeg,
        slopeDeg,
        airRotationDeg: s.airRotationDeg,
      };
      s.airborne = false;
      // 법선 성분은 지면이 흡수, 접선 성분만 남긴다(비탄성).
      // ★ 여기서 상한을 안 걸면 높은 낙하 후 급경사 착지가 초과속 상한을 «우회»한다
      //   (실측 1819 px/s — 상한 1540 을 훌쩍 넘겨 도약대 체공이 1.67s까지 부풀었다).
      s.tangentSpeed = Math.min(
        MAX_SPEED * DOWNHILL_OVERSPEED_MULT,
        Math.max(0, projectOntoSlope(s.vx, s.vy, s.slope)),
      );
      s.vy = 0;
      s.rotationDeg = slopeDeg;
      s.airRotationDeg = 0;
    }
  }

  return out;
}
