/**
 * 잡담 트리거 매칭(순수). 제출 핸들러(command.ts)와 타이핑 표시기(indicator.ts)가
 * 공유하는 단일 정의 — "이 입력이 잡담인가?"의 유일한 출처.
 *
 * 규칙:
 *  - 트리거가 "/"로 시작하면 `트리거 + 공백` 접두를 요구한다(슬래시 커맨드 형태).
 *  - 그 외(기호/백틱/비슬래시 커스텀)는 트리거 접두만으로 즉시 매칭한다.
 *  - 매칭돼도 body(트리거 제거 후 나머지)가 공백뿐이면 트리거하지 않는다(빈 잡담 방지).
 *  - 긴 트리거 우선(예: "/pt" > "/p", "!!" > "!")으로 접두 모호성을 제거한다.
 */
export function matchChitchatTrigger(message: string, aliases: string[]): { body: string } | null {
  const triggers = [...new Set(aliases.filter((a) => a && a.length > 0))]
    .sort((a, b) => b.length - a.length);

  for (const trigger of triggers) {
    const prefix = trigger.startsWith("/") ? `${trigger} ` : trigger;
    if (!message.startsWith(prefix)) continue;
    const body = message.slice(prefix.length);
    if (body.trim().length === 0) return null;
    return { body };
  }
  return null;
}
