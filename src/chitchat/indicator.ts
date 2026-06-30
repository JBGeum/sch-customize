/**
 * 잡담 타이핑 표시기.
 *
 * 채팅 입력창에 입력 중인 텍스트가 잡담 트리거를 만족하면 '잡담' 라벨을 켜
 * 일반 채팅과 시각적으로 구분한다. 제출 핸들러(command.ts)와 같은 파서를 공유한다.
 *
 * 표시기는 채팅 폼 최상단에 prepend된다(speaker-bar+textarea 인접 레이아웃과
 * 충돌하지 않도록). 숨김 시 공간을 차지하지 않는다.
 */
import { mountOnChatInput } from "../compat/chat-input-mount";
import { matchChitchatTrigger } from "./trigger";
import { getChitchatAliases } from "./aliases";
import { MODULE_ID } from "../constants";

const INDICATOR_CLASS = "sch-chitchat-indicator";
const BOUND_FLAG = "schIndicatorBound"; // textarea.dataset 플래그(노드당 1회 바인딩)

/**
 * 현재(전역 단일) 표시기를 textarea 값에 맞춰 토글한다.
 * 리스너가 특정 표시기 요소를 capture하지 않고 매번 현재 요소를 조회하므로,
 * 표시기를 재생성해도(재렌더/이동) 항상 살아있는 요소를 갱신한다.
 */
function updateIndicatorFor(textarea: HTMLTextAreaElement): void {
  const indicator = document.querySelector(`.${INDICATOR_CLASS}`);
  if (!indicator) return;
  const matched = matchChitchatTrigger(textarea.value, getChitchatAliases());
  indicator.classList.toggle("visible", !!matched);
}

function attachIndicator(textarea: Element): void {
  const ta = textarea as HTMLTextAreaElement;
  const form = ta.closest("form") ?? ta.parentElement;
  if (!form) return;

  // 표시기 요소는 전역 단일 — 기존 것을 document 전역에서 제거 후(다른 form으로 이동한
  // 잔재 포함) 현재 form 최상단에 재삽입. speaker-bar+textarea 인접 CSS와 충돌 없음.
  document.querySelector(`.${INDICATOR_CLASS}`)?.remove();

  const indicator = document.createElement("div");
  indicator.className = INDICATOR_CLASS;
  indicator.textContent = game.i18n!.localize(`${MODULE_ID}.chat.privTalkIndicator`);
  form.prepend(indicator);

  // 리스너는 textarea 노드당 1회만 부착(재마운트 시 누적 방지). 콜백은 현재 표시기를
  // 동적 조회하므로 표시기 재생성과 무관하게 안전.
  if (!ta.dataset[BOUND_FLAG]) {
    ta.dataset[BOUND_FLAG] = "1";
    ta.addEventListener("input", () => updateIndicatorFor(ta));
    ta.addEventListener("keydown", (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" && !ke.shiftKey) setTimeout(() => updateIndicatorFor(ta), 0);
    });
  }

  updateIndicatorFor(ta);
}

/**
 * Foundry `setup` hook에서 호출. 입력창 (재)등장 시 표시기를 (재)부착한다.
 */
export function registerChitchatIndicator(): void {
  mountOnChatInput(
    attachIndicator,
    () => !!document.querySelector(`.${INDICATOR_CLASS}`),
  );
}
