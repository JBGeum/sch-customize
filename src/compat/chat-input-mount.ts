/**
 * 채팅 입력창(textarea)이 (재)등장할 때마다 mountFn을 호출하는 공유 헬퍼.
 *
 * v12(jQuery renderChatLog) / v13(moveChatInput) / v14(renderChatInput) DOM 차이와
 * 재렌더·재배치 재부착을 한 곳에 모은다. speaker-bar와 chitchat 타이핑 표시기가 공유한다.
 *
 * - mountFn은 멱등이어야 한다(자기 요소 remove 후 재삽입).
 * - isMounted: 빈번한 폴백 훅(메시지 렌더/ready)에서 이미 마운트됐는지 검사해
 *   불필요한 재마운트를 막는다(기존 speaker-bar 동작 보존).
 */
import { toElement, getRenderChatMessageHook } from "./foundry";

function findChatTextarea(root: Element | Document): Element | null {
  // v13+/v14: 활성 입력 폼(form.chat-form) 내부의 #chat-message를 *우선* 앵커로 선택한다.
  // 전역 검색은 활성 폼이 아닌(또는 재배치 전) #chat-message를 골라, 바가 채팅창 왼쪽에
  // 박히는 v13/v14 버그를 유발했다 → 폼 스코프 우선으로 한정.
  const form = (root as Element).closest?.("form.chat-form")
      ?? root.querySelector?.("form.chat-form")
      ?? document.querySelector("form.chat-form");
  const scoped = form?.querySelector("#chat-message")
      ?? form?.querySelector("textarea[name='message']");
  if (scoped) return scoped;
  // form.chat-form이 없는 경우(v12 등) 폴백 — 기존 동작 보존.
  return root.querySelector("#chat-message")
      ?? root.querySelector("textarea[name='message']")
      ?? document.querySelector("#chat-message")
      ?? document.querySelector("textarea[name='message']");
}

export function mountOnChatInput(
  mountFn: (textarea: Element) => void,
  isMounted: () => boolean,
): void {
  const tryMount = (htmlRoot: HTMLElement | JQuery | null): void => {
    const root: Element | Document = toElement(htmlRoot) ?? document;
    const textarea = findChatTextarea(root);
    if (textarea) {
      mountFn(textarea);
      return;
    }
    // 아직 DOM에 없음 → MutationObserver로 등장 대기(폴백, 10초 후 자동 해제)
    const observer = new MutationObserver(() => {
      const ta = findChatTextarea(document);
      if (ta) {
        observer.disconnect();
        mountFn(ta);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  };

  // v12: chat log 렌더 시 input part 포함
  Hooks.on("renderChatLog", (_app: any, html: any) => tryMount(html));
  // v13: input part가 별도 이동/렌더
  (Hooks as any).on("moveChatInput", () => tryMount(null));
  // v14: 입력부가 다른 DOM 요소로 재배치(re-parent)된 직후 발화. 재배치된 입력부를
  // 스코프로 재마운트해 정위치를 유지한다.
  (Hooks as any).on("renderChatInput", (_app: any, element: any) => tryMount(element));
  // 폴백: 메시지 렌더 시 마운트가 빠졌으면 재시도
  (Hooks as any).on(getRenderChatMessageHook(), () => {
    if (!isMounted()) tryMount(null);
  });
  // 최후 폴백
  Hooks.once("ready", () => {
    if (!isMounted()) tryMount(null);
  });
}
