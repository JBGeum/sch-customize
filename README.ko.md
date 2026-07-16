# sch-customize

Foundry VTT를 좀 더 편하게 사용하기 위한 작은 기능 모음입니다.

> Foundry VTT v13 호환 · 🇬🇧 [English](./README.md)

---

<img width="526" height="575" alt="sch-customize 전체 화면" src="https://raw.githubusercontent.com/JBGeum/sch-customize/master/docs/image/1.png" />

## 기능

### 잡담 (Chitchat)
<img width="309" height="425" alt="잡담 예시" src="https://raw.githubusercontent.com/JBGeum/sch-customize/master/docs/image/2.png" />

캐릭터 대사·굴림과 구분되는 사담을 입력합니다. 같은 사용자의 연속 잡담은 자동으로 묶입니다.
- 트리거: `/pt`, `!`, `` ` ``, 또는 커스텀 문자(기본 `/p`) 등록 가능. 잡담은 OOC 또는 기타 타입으로 취급됩니다.
- 이어지는 잡담 그룹화, 유저별 색상 옵션이 존재합니다.
- 폰트 크기·진하기·여백·밝기 조절, 이름 뒤 줄바꿈 옵션이 존재합니다.

### 메시지 그룹화
<img width="297" height="514" alt="메시지 그룹화 예시" src="https://raw.githubusercontent.com/JBGeum/sch-customize/master/docs/image/3.png" />

같은 플레이어의 연속되는 메시지를 한 박스로 묶어서 표시합니다. 일반 채팅·잡담 모두 지원하며 설정에서 토글 가능합니다.

### 발화자 바 (Speaker Bar)
입력창 위에 표시되며, 현재 어떤 화자로 발화될지 표시합니다.
- **발화자 고정(lock)** — 토큰 선택을 바꿔도 화자가 유지됩니다.
- **발화자 즐겨찾기** — 자주 쓰는 화자를 즐겨찾기로 등록해 원클릭 전환. 초상화 또는 이름으로 간이 표시. 복귀 칩으로 고정 해제 가능합니다.

### 채팅 로그 아카이브
<img width="423" height="443" alt="채팅 로그 아카이브 다이얼로그" src="https://raw.githubusercontent.com/JBGeum/sch-customize/master/docs/image/4.png" />

- **다운로드** — 채팅 로그를 간단한 구조의 세션 로그로 내보내기(단독 / 폴더 / zip 모드). 초상화 등 이미지가 포함된 zip 파일로 다운로드됩니다.
  - **단독모드** - 한 HTML 파일에 CSS가 내장되어 있습니다. 단편 세션 로그 다운로드에 적합합니다.
  - **폴더모드** - 파일피커에서 폴더를 지정하고, 해당 폴더로 업데이트된 CSS 파일과 새 HTML 파일을 씁니다.
  - **zip모드** - 이미지, CSS, HTML 파일을 zip 파일로 다운받습니다. CSS 파일을 공용으로 사용할 경우 업로드해서 누적 CSS를 재다운로드 가능합니다.
- **표시** — 현재까지 기록된 전체 로그를 새 창에서 표시합니다. 표시 내용은 다운로드와 같습니다.
- 귓속말 포함 / 가리기(클릭 시 표시), GM 전용 콘텐츠(대미지 지정 등 주로 버튼) 정리 옵션이 있습니다.

> 내보낸 아카이브에는 단독으로 표시되도록 Foundry와 사용 중인 시스템·모듈의 CSS가 포함됩니다. 외부에 공개할 경우 각 저작권자의 라이선스를 따릅니다.

### 메시지 편집
<img width="298" height="179" alt="메시지 편집 다이얼로그" src="https://raw.githubusercontent.com/JBGeum/sch-customize/master/docs/image/5.png" />

이미 보낸 채팅 메시지를 우클릭-편집 후 에디터로 수정합니다. 수정된 메시지엔 "(수정)" 배지가 붙습니다.

### 외관 조정
기본 채팅 글자 크기와, 모듈의 잡담 글자 크기 / 진하기 / 여백 / 배경 밝기를 슬라이더로 조절합니다.

---

## 설치

**Manifest URL**
```
https://github.com/JBGeum/sch-customize/releases/latest/download/module.json
```

---

## 크레딧 · 라이선스

원작자 **Scheree** · 유지보수 [JBGeum/sch-customize](https://github.com/JBGeum/sch-customize) · [JSZip](https://stuk.github.io/jszip/) 사용 · [MIT License](LICENSE).

버그 제보·기능 제안: [GitHub Issues](https://github.com/JBGeum/sch-customize/issues).
