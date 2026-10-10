// brand.ts - 브랜드 문자열 단일 소스.
//
// ★ 2026-08-05 3차 전환: «동물 라이더 / Animal Rider» - President 직접 결정.
//   경위: Partner 가 「Rider 는 원작(Ketchapp Rider) 상표라 못 쓴다」고 «확인 없이»
//   단정해 Critterloop -> Hoofloop 으로 갔다. President 지적을 받고 실제 조회한
//   결과 그 전제가 틀렸다 - KIPRIS 에 「OO라이더」 결합상표가 여러 권리자로
//   공존한다(카트라이더 넥슨 9·41 / 마트라이더 쿠팡 9 / 타임라이더 경주월드 41 /
//   가면라이더 토에이 28). 「라이더」는 독점돼 있지 않다.
//
//   다만 「Animal Rider」 «정확 일치»는 존재한다 [확인, KIPRIS 2026-08-05]:
//     출원중 28류 주식회사 알파모빌리티 4020250176116 (2025.09.18)
//     소멸   28류 천현준               4020140061343 (2014.09.14)
//   28류는 완구·게임용구다. 모바일 게임이 쓰는 9류(소프트웨어)·41류(게임서비스)
//   에는 0건. 한글 「동물라이더」 정확일치도 0건.
//   ★ Partner 가 위 사실을 표면화했고 President 가 «그래도 이 이름으로 간다»고
//     결정했다. 이 주석은 그 결정 시점에 무엇을 알고 있었는지의 기록이다.
//     되돌리자는 얘기가 나오면 새 사실을 갖고 와라 - 위 내용은 이미 검토됐다.
//
// «단일 소스» 원칙 절대 불가침 - 이 파일 2줄 밖 리터럴 금지(코드 파일 한정).
//   해외 조회 결과 [확인, 2026-08-05]:
//     USPTO(Justia 미러) · Steam(86건) · App Store(23건) · Google Play  정확일치 0건
//     ★ Ketchapp 「Rider」 미국 상표 «없음» - UBISOFT MOBILE GAMES SARL 보유는
//       `2048`·`KETCHAPP` 2건뿐. Partner 의 「Rider 는 원작 상표」 단정이 «틀렸다».
//     최근접 동명: iOS `Wild Animal Rider`(Rajat Ujawane) - 다른 이름
//     도메인: animalrider.com 선점(2014~, 만료 2026-10-14) / animal-rider.com 미등록
//   [미확인]: 2026-07-18 이후 미국 출원분(TSDR 시리얼 프론티어 측정) · TMview/EUIPO
//            (POST 전용이라 조회 수단 없음). 사각이 «있다»는 사실 자체를 기록해 둔다.
//
// ★ 한글명은 «애니멀 라이더» - President 직접 지정(2026-08-05). 「동물 라이더」가 아니다.
export const BRAND_EN = 'Animal Rider';
export const BRAND_KO = '애니멀 라이더';

export function applyDocumentTitle(): void {
  if (typeof document !== 'undefined') {
    document.title = `${BRAND_KO} / ${BRAND_EN}`;
  }
}
