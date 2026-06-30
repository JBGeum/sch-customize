/**
 * 잡담 타이핑 표시기.
 *
 * 채팅 입력창에 입력 중인 텍스트가 잡담 트리거를 만족하면 '잡담' 라벨을 켜
 * 일반 채팅과 시각적으로 구분한다. 제출 핸들러(command.ts)와 같은 파서를 공유한다.
 *
 * 표시기는 speaker-bar 자리를 대체하도록 그 바로 앞(없으면 입력창 바로 위)에 삽입되며,
 * 활성 시 speaker-bar를 숨겨 레이아웃 리사이즈 없이 자리를 교체한다(scss). 잡담은 항상
 * 본인 명의로 나가므로 본인 user색 배경 + "잡담" 라벨로 표시한다. 숨김 시 공간 미점유.
 */
import { mountOnChatInput } from "../compat/chat-input-mount";
import { matchChitchatTrigger } from "./trigger";
import { getChitchatAliases } from "./aliases";
import { hexToRgba } from "../archive/util";
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
  if (!ta.parentElement) return; // DOM에 없으면 스킵

  // 표시기 요소는 전역 단일 — 기존 것을 document 전역에서 제거 후 입력창 바로 위에 재삽입.
  document.querySelector(`.${INDICATOR_CLASS}`)?.remove();

  const indicator = document.createElement("div");
  indicator.className = INDICATOR_CLASS;
  // 잡담은 항상 본인 명의 → 본인 user색 배경. speaker-bar처럼 배경이 비쳐 보이도록
  // 반투명 rgba로 깐다(불투명한 .user-<id> 주입 규칙 대신; 어두운 틴트는 scss ::before).
  indicator.style.background = hexToRgba(String(game.user?.color ?? "#000000"), 0.3);

  const label = document.createElement("span");
  label.className = "sch-chitchat-indicator-label";
  label.textContent = game.i18n!.localize(`${MODULE_ID}.chat.privTalkIndicator`);
  indicator.append(label);

  // speaker-bar가 있으면 그 자리를 대체하도록 바로 앞에 삽입(활성 시 speaker-bar는
  // CSS로 숨겨 리사이즈 없이 자리 교체). 없으면 입력창 바로 위.
  const speakerBar = document.querySelector(".sch-speaker-bar");
  (speakerBar ?? ta).before(indicator);

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
