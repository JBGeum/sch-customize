// 모듈 전역 상수. 식별자 변경은 여기 한 곳만 고치면 된다.
export const MODULE_ID = "sch-customize";

// 템플릿 fetch 경로의 베이스. Foundry 는 모듈을 Data/modules/<id>/ 에 설치하므로
// 경로가 MODULE_ID 를 추종해야 설치 위치와 일치한다.
export const TEMPLATE_BASE = `modules/${MODULE_ID}/template`;
