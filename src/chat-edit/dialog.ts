/**
 * 전송된 채팅 메시지 편집 다이얼로그 (v13+ DialogV2).
 *
 * 컨텍스트 메뉴 "편집"이 호출한다. Foundry v13+ 기본 리치 텍스트 에디터인 ProseMirror
 * (`<prose-mirror>` 커스텀 엘리먼트)에 현재 content를 프리필해 수정받고, 내용이 바뀐
 * 경우에만 message.update로 반영 + edited flag를 남긴다.
 *
 * 순수 부분(buildEditFormHtml/readEditFormValue/buildEditUpdate)은 테스트하고,
 * DialogV2·ProseMirror 상호작용은 라이브 스모크로 검증한다(커스텀 엘리먼트는 jsdom 미커버).
 *
 * 취소/닫기 구분: save 버튼 callback은 객체 { content }를 반환하고, 취소·닫기는
 * 문자열("cancel")/undefined를 반환하므로 typeof 결과로 구분한다(export 다이얼로그와 동일 관례).
 */
import { MODULE_ID } from "../constants";

/** ProseMirror 에디터(form-associated)의 name 속성 값. */
export const EDIT_FIELD_NAME = "sch-edit-content";

/** 편집 폼 HTML(에디터 마운트 컨테이너만; 에디터는 render 콜백에서 생성해 붙인다). */
export function buildEditFormHtml(): string {
  return `<div class="sch-edit-form"></div>`;
}

/**
 * 편집 폼의 현재 값을 읽는다. ProseMirror 엘리먼트(`<prose-mirror>`)는 form-associated라
 * 편집된 HTML을 `.value` getter로 노출한다.
 */
export function readEditFormValue(root: Element | Document): string {
  const editor = root.querySelector("prose-mirror") as (Element & { value?: string }) | null;
  return editor?.value ?? "";
}

/** message.update에 넘길 payload: 새 content + edited flag(dotted key). */
export function buildEditUpdate(newContent: string): Record<string, unknown> {
  return { content: newContent, [`flags.${MODULE_ID}.edited`]: true };
}

/** 편집 다이얼로그를 띄우고, 저장 시 message.update로 반영한다. */
export async function showEditMessageDialog(message: any): Promise<void> {
  const DialogV2 = (foundry as any).applications.api.DialogV2;
  let root: any = null;
  try {
    const result = await DialogV2.wait({
      classes: ["sch-edit-dialog"],
      window: { title: game.i18n!.localize("sch-customize.edit.dialogTitle"), resizable: true },
      position: { width: 520, height: 420 },
      content: buildEditFormHtml(),
      rejectClose: false,
      default: "save",
      buttons: [
        {
          action: "save",
          label: game.i18n!.localize("sch-customize.edit.save"),
          icon: "fas fa-check",
          callback: (_e: any, _b: any, dialog: any) => ({
            content: readEditFormValue(root ?? dialog?.element ?? document),
          }),
        },
        {
          action: "cancel",
          label: game.i18n!.localize("sch-customize.edit.cancel"),
          icon: "fas fa-times",
        },
      ],
      render: (_app: any, html: any) => {
        const el = html instanceof HTMLElement ? html : (html?.[0] ?? html?.element ?? html);
        root = el ?? null;
        const mount = el?.querySelector?.(".sch-edit-form");
        if (!mount) return;
        // v13+ 기본 리치 에디터. toggled=false면 토글 없이 항상 편집 모드로 뜬다.
        const ProseMirrorElement = (foundry as any).applications.elements.HTMLProseMirrorElement;
        const editor = ProseMirrorElement.create({
          name: EDIT_FIELD_NAME,
          value: message.content ?? "",
          toggled: false,
          button: false,
        });
        mount.appendChild(editor);
      },
    });

    // 취소/닫기 → 객체 아님. 저장만 { content } 객체를 돌려준다.
    if (!result || typeof result !== "object") return;
    const newContent = (result as { content: string }).content;
    if (newContent === message.content) return; // 무변경 → no-op(배지 안 붙음)
    await message.update(buildEditUpdate(newContent));
  } catch (error) {
    console.error("[sch-customize] 메시지 편집 실패:", error);
    ui.notifications?.error(game.i18n!.localize("sch-customize.edit.errorNoPermission"));
  }
}
