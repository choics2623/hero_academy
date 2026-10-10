# 멸망까지 10년 — 용사 아카데미

고인물이 망겜 속 엑스트라로 빙의해서, 10년 뒤의 멸망을 막기 위해 자신과 동료를 키우는 아카데미 육성 시뮬레이션.

## 문서
- [01 원작 게임 & 세계관](docs/01_원작게임_세계관.md)
- [02 캐릭터 생성 & 재능](docs/02_재능_시스템.md)
- [03 캐릭터 운명 분기](docs/03_캐릭터_운명분기.md)
- [04 재능 개화 & 스킬트리](docs/04_재능개화_스킬트리.md)
- [05 메인 스토리](docs/05_메인스토리.md)
- [06 엔진 설계 & 작가 가이드](docs/06_엔진_설계.md)

## 바로 플레이
브라우저: https://claude.ai/artifact/8M5y8XaJtJsjfj5dv323dE

## 실행
```bash
npm install
npm run build:web                   # 웹 버전을 dist/play.html 한 장으로 빌드
npm run play -- --random 1          # 터미널에서 플레이 (서장 ~ 1학년 1학기 끝)
npm run lint:story                  # 스토리 정적 분석
npm run sim -- --runs 3000          # 자동 플레이테스트 → reports/sim.md
npm run seek -- "fate.sera == 'saved'" --origin 평민장학생
npm run verify                      # 모든 갈림길 결과 도달 가능성 검증
npm run gallery                     # 도트 초상화·아이콘·삽화 전체를 dist/gallery.html로
npm test
```
