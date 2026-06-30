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

function attachIndicator(textarea: Element): void {
  const form = textarea.closest("form") ?? textarea.parentElement;
  if (!form) return;

  // 재렌더 대응: 기존 표시기 제거 후 재삽입(멱등)
  form.querySelector(`.${INDICATOR_CLASS}`)?.remove();

  const indicator = document.createElement("div");
  indicator.className = INDICATOR_CLASS;
  indicator.textContent = game.i18n!.localize(`${MODULE_ID}.chat.privTalkIndicator`);
  form.prepend(indicator);

  const update = () => {
    const value = (textarea as HTMLTextAreaElement).value;
    const matched = matchChitchatTrigger(value, getChitchatAliases());
    indicator.classList.toggle("visible", !!matched);
  };

  textarea.addEventListener("input", update);
  // 제출(Enter, !shift) 시 입력창이 비워지면 다음 틱에 재평가해 숨김
  textarea.addEventListener("keydown", (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter" && !ke.shiftKey) setTimeout(update, 0);
  });
  update();
}

/**
 * Foundry `setup` hook에서 호출. 입력창 (재)등장 시 표시기를 (재)부착한다.
 */
export function registerChitchatIndicator(): void {
  mountOnChatInput(
    (ta) => attachIndicator(ta),
    () => !!document.querySelector(`.${INDICATOR_CLASS}`),
  );
}
