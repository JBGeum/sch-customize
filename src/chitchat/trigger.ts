/**
 * 잡담 트리거 매칭(순수). 제출 핸들러(command.ts)와 타이핑 표시기(indicator.ts)가
 * 공유하는 단일 정의 — "이 입력이 잡담인가?"의 유일한 출처.
 *
 * 규칙:
 *  - 트리거가 "/"로 시작하면 `트리거 + 공백` 접두를 요구한다(슬래시 커맨드 형태).
 *  - 그 외(기호/백틱/비슬래시 커스텀)는 트리거 접두만으로 즉시 매칭한다.
 *  - 매칭돼도 body(트리거 제거 후 나머지)의 텍스트가 공백뿐이면 트리거하지 않는다(빈 잡담 방지).
 *  - 긴 트리거 우선(예: "/pt" > "/p", "!!" > "!")으로 접두 모호성을 제거한다.
 *
 * v14 호환: Foundry v14의 채팅 입력이 textarea에서 인라인 ProseMirror 에디터로 바뀌면서
 * `chatMessage` 훅에 전달되는 message가 HTML로 감싸진다(예: "<p>`안녕</p>"). 트리거는 항상
 * 선행 텍스트이므로, 여는 태그·공백을 트리거 앞의 "lead"로 흡수해 v12/v13 평문("`안녕")과
 * v14 HTML을 모두 인식한다. body는 트리거만 제거하고 감싼 태그·서식은 보존한다.
 */
export function matchChitchatTrigger(message: string, aliases: string[]): { body: string } | null {
  const triggers = [...new Set(aliases.filter((a) => a && a.length > 0))]
    .sort((a, b) => b.length - a.length);

  // 선행 여는 태그/공백(v14 ProseMirror 래퍼). 트리거는 어떤 것도 "<"로 시작하지 않으므로
  // lead가 트리거 문자를 삼키지 않는다. 평문(v12/v13)에서는 lead가 빈 문자열이다.
  const lead = /^(?:\s|<[^>]*>)*/.exec(message)?.[0] ?? "";
  const afterLead = message.slice(lead.length);

  for (const trigger of triggers) {
    const prefix = trigger.startsWith("/") ? `${trigger} ` : trigger;
    if (!afterLead.startsWith(prefix)) continue;
    const body = lead + afterLead.slice(prefix.length);
    // 태그를 제거한 실제 텍스트가 공백뿐이면 트리거하지 않는다(빈 잡담 방지).
    if (body.replace(/<[^>]*>/g, "").trim().length === 0) return null;
    return { body };
  }
  return null;
}
