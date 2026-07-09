/**
 * HTML 문자열을 평문 텍스트로 변환한다(태그 제거 + 엔티티 디코드 + 앞뒤 트림).
 *
 * v14부터 채팅 입력이 인라인 ProseMirror 에디터로 바뀌면서 잡담 본문이 HTML로 감싸진다
 * (예: "<p>안녕</p>"). 잡담은 태그 없는 평문으로만 출력해야 한다:
 *  - 블록 <p> 래퍼가 렌더 시(잡담 본문 div 안) 불필요한 세로 여백을 만든다.
 *  - "~" 등 문자는 마크다운으로 해석되지 않고 리터럴로 보존돼야 한다(원치 않는 취소선 방지).
 *
 * DOM 기반이라 엔티티까지 정확히 디코드된다(jsdom/브라우저 공통). 결과를 textContent로
 * 넣으면 특수문자(<, & 등)도 안전하게 이스케이프된다.
 */
export function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").trim();
}
