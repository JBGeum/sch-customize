console.log('[chat-tailor] chat-log.js: 평가 시작');

// v13+: renderHTML(HTMLElement) / v12: getHTML(jQuery)
async function renderChatMessageElement(chat) {
  if (typeof chat.renderHTML === "function") {
    return await chat.renderHTML();
  }
  const $html = await chat.getHTML();
  return $html?.[0] ?? null;
}

// v12: renderChatMessage / v13+: renderChatMessageHTML — 두 훅 모두 호출해 다른 모듈 호환
function callRenderChatMessageHooks(chat, element, data) {
  const isV13Plus = (game?.release?.generation ?? 0) >= 13;
  if (isV13Plus) {
    Hooks.callAll("renderChatMessageHTML", chat, element, data);
  } else {
    Hooks.callAll("renderChatMessage", chat, window.jQuery ? window.jQuery(element) : element, data);
  }
}

function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadArchiveFile(chats) {

  let [htmlContent, contentImg, portraitImg] = await generateHtmlFromChats(chats);

  let zip = new JSZip();

  await zipInsideFolder(zip, contentImg, "images");
  await zipInsideFolder(zip, portraitImg, "portraits");
  zip.file("chat.html", htmlContent);

  zip.generateAsync({type:"blob"})
      .then(content => {saveAs(content, "chat.zip")}); //todo : world명_날짜_chatlog.zip 등으로 바꾸기, saveAs lib에 넣기
}

async function openChatArchive(chats){
  let [htmlContent] = await generateSimpleHtmlFromChats(chats);

  const newWindow = window.open('', '_blank');
  newWindow.document.write(htmlContent);
  newWindow.document.close();
}
async function generateSimpleHtmlFromChats(chats){
  console.time('[DEBUG] generateSimpleHtmlFromChats 전체');
  console.time('[DEBUG] 1. 템플릿 로드');

  const response = await fetch('modules/chat-tailor/template/chat-archive-template.html');
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, 'text/html');
  console.timeEnd('[DEBUG] 1. 템플릿 로드');

  const container = doc.querySelector('.foundry-chat-container');
  let prevPtFlag;
  let prevSpeaker;

  // 설정값을 루프 밖에서 한 번만 가져옴 (성능 최적화)
  const includeWhisperFlag = game.settings.get("chat-tailor", "includeWhisper");
  const hideWhisperSetting = game.settings.get("chat-tailor", "hideWhisper");

  console.time('[DEBUG] 2. 채팅 처리 루프');
  let chatCount = 0;
  let rollCount = 0;
  let privTalkCount = 0;
  for (const chat of chats) {
    // v12: whisper는 chat.whisper 배열로 확인
    let whisperFlag = chat.whisper && chat.whisper.length > 0;
    if(whisperFlag){
      if(!includeWhisperFlag || !chat.isContentVisible)
        continue;
    }
    chatCount++;
    if (chat.rolls && chat.rolls.length > 0) rollCount++;
    if (chat.flags?.priv_talk || chat.getFlag?.('chat-tailor', 'priv_talk')) privTalkCount++;
    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }
  console.timeEnd('[DEBUG] 2. 채팅 처리 루프');
  console.log(`[DEBUG] 처리된 채팅: ${chatCount}개, Roll: ${rollCount}개, PrivTalk: ${privTalkCount}개`);

  //일회성 처리
  console.time('[DEBUG] 3. 인라인 롤 처리');
  const inlineRollLinks = doc.querySelectorAll('a.inline-roll.inline-result');
  inlineRollLinks.forEach((link) => {
    const newDiv = doc.createElement('div');
    newDiv.className = 'inline-roll';
    newDiv.textContent = link.dataset.tooltip + '=>' + link.textContent;
    link.parentNode.insertBefore(newDiv, link.nextSibling);
    link.remove();
  });
  console.timeEnd('[DEBUG] 3. 인라인 롤 처리');
  /*

    let contentImg = new Set([...doc.querySelectorAll('.chat-text img')]
        .map(img => img.src ? img.src :
            window.location.href.replace('game', '') + img?.getAttribute('src')));

    let portraitImg = new Set([...doc.querySelectorAll('.chat-image img')]
        .map(img => img.src ? img.src :
            window.location.href.replace('game', '') + img?.getAttribute('src')));

  */

  //css 추가
  console.time('[DEBUG] 4. CSS 처리');
  const styleElement = doc.createElement('style');
  styleElement.type = 'text/css';
  styleElement.appendChild(doc.createTextNode(createCssList(null, false, doc)));
  console.timeEnd('[DEBUG] 4. CSS 처리');

  const headElement = doc.head || doc.getElementsByTagName('head')[0];
  headElement.appendChild(styleElement);

  console.timeEnd('[DEBUG] generateSimpleHtmlFromChats 전체');
  return [doc.documentElement.outerHTML];
}
async function generateHtmlFromChats(chats) {
  const response = await fetch('modules/chat-tailor/template/chat-archive-template.html');
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, 'text/html');

  const container = doc.querySelector('.foundry-chat-container');
  let prevPtFlag;
  let prevSpeaker;

  // 설정값을 루프 밖에서 한 번만 가져옴 (성능 최적화)
  const includeWhisperFlag = game.settings.get("chat-tailor", "includeWhisper");
  const hideWhisperSetting = game.settings.get("chat-tailor", "hideWhisper");

  for (const chat of chats) {
    let whisperFlag = chat.whisper && chat.whisper.length > 0;
    if(whisperFlag){
      if(!includeWhisperFlag || !chat.isContentVisible)
        continue;
    }
    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }

  //일회성 처리
  const inlineRollLinks = doc.querySelectorAll('a.inline-roll.inline-result');
  inlineRollLinks.forEach((link) => {
    const newDiv = doc.createElement('div');
    newDiv.className = 'inline-roll';
    newDiv.textContent = link.dataset.tooltip + '=>' + link.textContent;
    link.parentNode.insertBefore(newDiv, link.nextSibling);
    link.remove();
  });

  let contentImg = new Set([...doc.querySelectorAll('.chat-text img')]
      .map(img => img.src ? img.src :
          window.location.href.replace('game', '') + img?.getAttribute('src')));

  let portraitImg = new Set([...doc.querySelectorAll('.chat-image img')]
      .map(img => img.src ? img.src :
          window.location.href.replace('game', '') + img?.getAttribute('src')));


  //css 추가
  const styleElement = doc.createElement('style');
  styleElement.type = 'text/css';
  styleElement.appendChild(doc.createTextNode(createCssList(null, false, doc)));

  const headElement = doc.head || doc.getElementsByTagName('head')[0];
  headElement.appendChild(styleElement);

  updateImageSources(doc);
  return [doc.documentElement.outerHTML, contentImg, portraitImg];
}

async function appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting) {
  const { flags, author } = chat;
  let speaker = chat.alias;

  // Roll이 있거나 특별 처리가 필요한 경우만 getRollResultContent 사용
  const privTalkFlag = flags?.priv_talk || chat.getFlag('chat-tailor', 'priv_talk') || false;
  const hasRolls = chat.isRoll;
  // 기존 코드의 chat.flag?.item 오타 수정 — flags 복수형이 정상
  const isItemCard = flags?.item || false;

  let text;
  if (hasRolls || isItemCard) {
    // Roll 메시지만 무거운 렌더링 필요
    text = await getRollResultContent(chat);
  } else if (privTalkFlag) {
    // PrivTalk은 chat.content에서 직접 추출 (가벼움)
    text = extractPrivTalkFromContent(chat.content);
  } else {
    // 일반 메시지
    text = chat.content;
  }

  const imageUrl = getChatImageUrl(chat);
  if(prevPtFlag !== privTalkFlag)
    chatMergeFlag = false;

  const div = createDivWithClasses(['chat-box', 'message' ,
    privTalkFlag ? 'priv-talk' : null, whisperFlag ? 'whisper': null,
    whisperFlag && hideWhisperSetting ? 'whisper-hidden' : null,
    author ? `user-${author.id}` : null]);

  if(whisperFlag){
    chatMergeFlag = false;
    let whisperTo = [];
    chat.whisper.forEach(i => whisperTo.push(game.users.get(i).name));
    speaker = `${chat.alias}\n→[${whisperTo}]`
  }

  const nameDiv = createDivWithClasses('chat-name', !chatMergeFlag ? [speaker] : null);
  const imageDiv = createDivWithClasses('chat-image');
  const imageElement = getChatImageElement(imageUrl, chatMergeFlag, privTalkFlag);
  if(imageElement){
    imageDiv.appendChild(imageElement);
  }
  const textDivClasses = ['chat-text', chatMergeFlag ? 'chat-merge' : null];
  const textDiv = createDivWithClasses(textDivClasses, text, true);

  appendChildren(div, [imageDiv, nameDiv, textDiv]);
  container.appendChild(div);

  return !!privTalkFlag;
}

function createDivWithClasses(classes, content, isHtml) {
  const div = document.createElement('div');
  (Array.isArray(classes) ? classes : [classes]).forEach(cls => cls && div.classList.add(cls));

  if (isHtml) {
    const container = document.createElement('div');
    container.classList.add("container");
    container.appendChild(div);
    if (content) {
      div.innerHTML = content;
    }
    return container;
  } else if (content) {
    div.textContent = content;
  }

  return div;
}

function appendChildren(parent, children) {
  children.forEach(child => parent.appendChild(child));
}

function getChatImageUrl(chat) {
  if (chat.flags['chat-portrait']) {
    return game.actors.get(chat.speaker?.actor).img;
  } else if (game.actors.getName(chat.speaker.alias)?.img){
  return game.actors.getName(chat.speaker.alias)?.img;
  } else if (chat.flags['chat-portrait']) {
    return chat.flags['chat-portrait'].src;
  } else
  return null;
}

function getChatImageElement(imageUrl, chatMergeFlag, privTalkFlag) {
  if (imageUrl && !chatMergeFlag && !privTalkFlag) {
    const img = document.createElement('img');
    img.classList.add('chat-image');
    img.src = imageUrl;
    return img;
  }
  return null;
}

/*
// ============================================================
// CSS 처리 함수 (이전 버전 - 단순하고 빠름)
// 필요시 아래 주석을 해제하고 새 버전을 주석 처리
// ============================================================

function createCssListSimple(selectors) {
  const styleSheetObject = {};

  for (let i = 0; i < document.styleSheets.length; i++) {
    const styleSheet = document.styleSheets[i];
    try {
      const cssRules = document.styleSheets[i].cssRules;
      if (cssRules) {
        for (let j = 0; j < styleSheet.cssRules.length; j++) {
          const rule = styleSheet.cssRules[j];
          if (rule.type === CSSRule.STYLE_RULE) {
            const selectorText = rule.selectorText;
            const styleText = rule.style.cssText;
            styleSheetObject[selectorText] = styleText;
          }
        }
      }
    } catch (error) {
      console.warn(`cssRules에 접근할 수 없는 스타일시트가 발견되었습니다: ${error.message}`);
    }
  }
  const matchingStyles = [];
  function getCssBySelector(partialSelector) {
    for (const selector in styleSheetObject) {
      if (selector.includes(partialSelector)) {
        matchingStyles.push({ key: selector, value: styleSheetObject[selector] });
      }
    }
  }

  for(const selector of selectors){
    getCssBySelector(selector)
  }

  let cssRuleString = '';
  for(const user of game.users){
    cssRuleString += ` div.chat-box.user-${user._id} {background-color: ${hexToRgba(user.color, 0.3)};} \n`
  }

  for(const style of matchingStyles){
    cssRuleString += `${style.key} {${style.value}} \n`;
  }
  return cssRuleString;
}

function getSelectorsSimple(targetDoc) {
  const selectorsSet = new Set();

  function traverse(node) {
    if (node.nodeType === 1) {
      if (node.id)
        selectorsSet.add(`#${node.id}`);
      if (node.classList.length > 0) {
        node.classList.forEach(className => {
          selectorsSet.add(`.${className}`);
        });
      }
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        if (attr.name !== 'id' && attr.name !== 'class') {
          selectorsSet.add(`[${attr.name}="${attr.value}"]`);
        }
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
      }
    }
  }

  traverse(targetDoc.body);
  return [...selectorsSet];
}
*/

// ============================================================
// 새로운 CSS 처리 시스템 (CSS 변수, @media, @layer 지원)
// ============================================================

class CssVariableTracker {
  constructor() {
    this.definitions = new Map();
    this.usages = new Set();
  }

  extractUsages(styleText) {
    const matches = styleText.matchAll(/var\(\s*(--[a-zA-Z0-9-_]+)/g);
    for (const match of matches) {
      this.usages.add(match[1]);
    }
  }

  collectDefinitions(styleText) {
    const matches = styleText.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+)/g);
    for (const match of matches) {
      this.definitions.set(match[1], match[2].trim());
    }
  }

  resolveTransitiveDependencies() {
    let changed = true;
    let iteration = 0;
    while (changed && iteration < 10) {
      changed = false;
      iteration++;
      for (const [varName, value] of this.definitions) {
        if (!this.usages.has(varName) && value) {
          for (const usedVar of this.usages) {
            const usedValue = this.definitions.get(usedVar);
            if (usedValue && usedValue.includes(`var(${varName}`)) {
              this.usages.add(varName);
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  generateRootCss() {
    this.resolveTransitiveDependencies();
    const vars = [];
    for (const varName of this.usages) {
      if (this.definitions.has(varName)) {
        vars.push(`${varName}: ${this.definitions.get(varName)}`);
      }
    }
    return vars.length ? `:root { ${vars.join('; ')}; }` : '';
  }
}

class StructuredCssCollector {
  constructor() {
    this.rootRules = [];
    this.mediaRules = new Map();
    this.layerRules = new Map();
    this.keyframeRules = [];
    this.fontFaceRules = [];
  }

  addRule(selector, styles, context = null) {
    const rule = { selector, styles };
    if (!context) {
      this.rootRules.push(rule);
    } else if (context.type === 'media') {
      if (!this.mediaRules.has(context.condition)) {
        this.mediaRules.set(context.condition, []);
      }
      this.mediaRules.get(context.condition).push(rule);
    } else if (context.type === 'layer') {
      if (!this.layerRules.has(context.name)) {
        this.layerRules.set(context.name, []);
      }
      this.layerRules.get(context.name).push(rule);
    }
  }

  generateCss(domSelectors, variableTracker) {
    let output = variableTracker.generateRootCss() + '\n';
    this.fontFaceRules.forEach(r => output += r + '\n');
    this.keyframeRules.forEach(r => output += r + '\n');

    for (const [name, rules] of this.layerRules) {
      const matched = rules.filter(r => selectorMatchesDom(r.selector, domSelectors));
      if (matched.length) {
        output += `@layer ${name} {\n`;
        matched.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
        output += '}\n';
      }
    }

    this.rootRules
      .filter(r => selectorMatchesDom(r.selector, domSelectors))
      .forEach(r => output += `${r.selector} { ${r.styles} }\n`);

    for (const [condition, rules] of this.mediaRules) {
      const matched = rules.filter(r => selectorMatchesDom(r.selector, domSelectors));
      if (matched.length) {
        output += `@media ${condition} {\n`;
        matched.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
        output += '}\n';
      }
    }

    return output;
  }
}

function selectorMatchesDom(cssSelector, domSelectors) {
  const alwaysIncludePatterns = [
    /\.chat-/, /\.message/, /\.dice-/, /\.roll/, /\.midi-/,
    /\.card-/, /\.dnd5e/, /\.activation/, /\.tooltip/,
    /\.flexrow/, /\.flexcol/, /\.pill/, /\.gold-icon/,
    /\.name-stacked/, /\.roboto/, /\.fa-/, /\.fas\b/, /\.far\b/,
    /\.collapsible/, /\.wrapper/, /\.summary/, /\.details/,
    /\.evaluation/, /\.targets/, /\.effects/, /\.apply/
  ];

  if (alwaysIncludePatterns.some(pattern => pattern.test(cssSelector))) {
    return true;
  }

  const selectorParts = cssSelector.split(',').map(s => s.trim());

  return selectorParts.some(part => {
    const cleanPart = part.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '').trim();
    if (!cleanPart) return true;

    const tokens = cleanPart.split(/\s+/).filter(t => t && !/^[>+~]$/.test(t));

    return tokens.every(token => {
      const cleanToken = token.replace(/^[>+~]/, '').trim();
      if (!cleanToken) return true;

      const parts = cleanToken.match(/[.#]?[a-zA-Z0-9_-]+|\[[^\]]+\]/g) || [];

      return parts.every(p => {
        if (!p.startsWith('.') && !p.startsWith('#') && !p.startsWith('[')) {
          return true;
        }
        return domSelectors.has(p);
      });
    });
  });
}

function getSelectorsWithAncestors(targetDoc) {
  const selectorsSet = new Set([':root', '*', 'html', 'body']);

  function getElementSelector(element) {
    const selectors = [];
    if (element.tagName) selectors.push(element.tagName.toLowerCase());
    if (element.id) selectors.push(`#${element.id}`);

    const classes = [...(element.classList || [])];
    classes.forEach(cls => selectors.push(`.${cls}`));

    if (classes.length >= 2) {
      for (let i = 0; i < classes.length; i++) {
        for (let j = i + 1; j < classes.length; j++) {
          selectors.push(`.${classes[i]}.${classes[j]}`);
        }
      }
      if (classes.length <= 5) selectors.push('.' + classes.join('.'));
    }

    for (const attr of (element.attributes || [])) {
      if (attr.name.startsWith('data-')) {
        selectors.push(`[${attr.name}]`);
        selectors.push(`[${attr.name}="${attr.value}"]`);
      }
    }

    return selectors;
  }

  function traverse(element, ancestors = []) {
    if (!element || element.nodeType !== 1) return;

    const elementSelectors = getElementSelector(element);
    elementSelectors.forEach(sel => selectorsSet.add(sel));

    for (let depth = 1; depth <= Math.min(ancestors.length, 3); depth++) {
      const ancestor = ancestors[ancestors.length - depth];
      const ancestorSelectors = getElementSelector(ancestor);

      const keyAncestorSelectors = ancestorSelectors.filter(s =>
        s.startsWith('.') || s.startsWith('#')
      ).slice(0, 3);

      keyAncestorSelectors.forEach(ancSel => {
        elementSelectors.forEach(elemSel => {
          if (elemSel.startsWith('.') || elemSel.startsWith('#')) {
            selectorsSet.add(`${ancSel} ${elemSel}`);
          }
        });
      });
    }

    for (const child of (element.children || [])) {
      traverse(child, [...ancestors, element]);
    }
  }

  if (targetDoc.body) traverse(targetDoc.body, []);

  return selectorsSet;
}

function extractStyles(rule) {
  const text = rule.cssText;
  return text.substring(text.indexOf('{') + 1, text.lastIndexOf('}')).trim();
}

function processStyleSheetStructured(sheet, collector, variableTracker, processedSheets, depth = 0) {
  if (depth > 10) return;

  try {
    if (sheet.href && processedSheets.has(sheet.href)) return;
    if (sheet.href) processedSheets.add(sheet.href);

    const rules = sheet.cssRules || sheet.rules;
    if (!rules) return;

    for (const rule of rules) {
      try {
        switch (rule.type) {
          case CSSRule.STYLE_RULE: {
            const styles = extractStyles(rule);
            collector.addRule(rule.selectorText, styles);
            variableTracker.extractUsages(styles);
            if (rule.selectorText.includes(':root') || rule.selectorText === 'html') {
              variableTracker.collectDefinitions(styles);
            }
            break;
          }
          case CSSRule.IMPORT_RULE:
            if (rule.styleSheet) {
              processStyleSheetStructured(rule.styleSheet, collector, variableTracker, processedSheets, depth + 1);
            }
            break;
          case CSSRule.MEDIA_RULE: {
            const condition = rule.conditionText || rule.media?.mediaText || '';
            for (const r of rule.cssRules) {
              if (r.type === CSSRule.STYLE_RULE) {
                const styles = extractStyles(r);
                collector.addRule(r.selectorText, styles, { type: 'media', condition });
                variableTracker.extractUsages(styles);
              }
            }
            break;
          }
          case 12:
          case 13: {
            const layerName = rule.name || 'anonymous';
            if (rule.cssRules) {
              for (const r of rule.cssRules) {
                if (r.type === CSSRule.STYLE_RULE) {
                  const styles = extractStyles(r);
                  collector.addRule(r.selectorText, styles, { type: 'layer', name: layerName });
                  variableTracker.extractUsages(styles);
                }
              }
            }
            break;
          }
          case CSSRule.FONT_FACE_RULE:
            collector.fontFaceRules.push(rule.cssText);
            break;
          case CSSRule.KEYFRAMES_RULE:
            collector.keyframeRules.push(rule.cssText);
            break;
          case CSSRule.SUPPORTS_RULE:
            for (const r of rule.cssRules) {
              if (r.type === CSSRule.STYLE_RULE) {
                const styles = extractStyles(r);
                collector.addRule(r.selectorText, styles);
                variableTracker.extractUsages(styles);
              }
            }
            break;
        }
      } catch (ruleError) {}
    }
  } catch (e) {
    console.warn(`스타일시트 처리 오류: ${e.message}`);
  }
}

function createCssList(selectors, includeAll = false, targetDoc = null) {
  const collector = new StructuredCssCollector();
  const variableTracker = new CssVariableTracker();
  const processedSheets = new Set();

  const domSelectors = targetDoc
    ? getSelectorsWithAncestors(targetDoc)
    : new Set(selectors);

  for (const sheet of document.styleSheets) {
    try {
      const testAccess = sheet.cssRules || sheet.rules;
      if (!testAccess) continue;
      processStyleSheetStructured(sheet, collector, variableTracker, processedSheets);
    } catch (e) {
      if (sheet.href) processedSheets.add(sheet.href);
    }
  }

  let css = collector.generateCss(domSelectors, variableTracker);

  // 사용자별 배경색 스타일 추가
  for (const user of game.users) {
    const bgColor = hexToRgba(user.color.toString(), 0.3);
    css += `div.chat-box.user-${user._id} { background-color: ${bgColor} !important; }\n`;
  }

  return css;
}

// ============================================================

// 디버그용 카운터
let _debugRollCount = 0;
let _debugRollTotalTime = 0;

async function getRollResultContent(chat) {
  const startTime = performance.now();
  _debugRollCount++;

  const isPrivTalk = chat.flags?.priv_talk || chat.getFlag?.('chat-tailor', 'priv_talk') || false;

/*  // 화면에 이미 렌더링된 메시지가 있으면 직접 사용 (모듈 처리 완료 상태)
  const rendered = document.querySelector(`[data-message-id="${chat.id}"]`);
  if (rendered) {
    return extractMessageContent(rendered, isPrivTalk);
  }*/

  // 화면에 없으면 임시 컨테이너에 렌더링
  const element = await renderChatMessageElement(chat);
  if (!element) return '';

  const tempContainer = document.createElement('div');
  tempContainer.style.display = 'none';
  document.body.appendChild(tempContainer);
  tempContainer.appendChild(element);

  // 다른 모듈이 후처리할 수 있도록 버전에 맞춰 hook 호출
  callRenderChatMessageHooks(chat, element, chat.toObject());

  const result = extractMessageContent(element, isPrivTalk);
  tempContainer.remove();

  const elapsed = performance.now() - startTime;
  _debugRollTotalTime += elapsed;

  // 10번째마다 또는 100ms 이상 걸리면 로그 출력
  if (_debugRollCount % 10 === 0 || elapsed > 100) {
    console.log(`[DEBUG] getRollResultContent #${_debugRollCount}: ${elapsed.toFixed(1)}ms (누적: ${_debugRollTotalTime.toFixed(0)}ms)`);
  }

  return result;
}

// PrivTalk 내용을 chat.content에서 직접 추출 (가벼운 처리)
function extractPrivTalkFromContent(htmlContent) {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  const ptContent = temp.querySelector('div.pt:not(.priv_user)');
  return ptContent ? ptContent.innerHTML : htmlContent;
}

function extractMessageContent(messageElement, isPrivTalk) {
  // priv_talk 메시지인 경우 div.pt 내용만 추출 (div.pt.priv_user 제외)
  if (isPrivTalk) {
    const ptContent = messageElement.querySelector('.message-content div.pt:not(.priv_user)');
    if (ptContent) {
      return ptContent.cloneNode(true).innerHTML;
    }
  }

  let result = '';

  // flavor-text 추출 (Roll 메시지의 헤더)
  const flavorText = messageElement.querySelector('.message-header .flavor-text');
  if (flavorText) {
    result += `<div class="flavor-text">${flavorText.innerHTML}</div>`;
  }

  // message-content 추출
  const content = messageElement.querySelector('.message-content');
  if (content) {
    const clone = content.cloneNode(true);

    // 제외할 선택자 목록 - 필요시 여기에 추가
    const excludeSelectors = [
      'h4.chat-portrait-text-content-name-generic.chat-portrait-flexrow'
    ];

    excludeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    result += clone.innerHTML;
  }

  return result || messageElement.cloneNode(true).outerHTML;
}


function hexToRgba(hex, opacity) {
  hex = hex.toString().replace(/^#/, '');

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  opacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

async function zipInsideFolder(zip, imgSet, folderName) {
  let imgFolder = zip.folder(folderName);

  for (let url of imgSet) {
    try{
      let response = await fetch(url);
      let blob = await response.blob();
      let imageName = url.split('/').pop();
      imgFolder.file(cleanImageFilename(imageName), blob);
    } catch (e) {
      console.error(`Failed to fetch or process the image from URL: ${url}. Error: ${e.message} `);
    }
  }
}

function updateImageSources(document) {
  let images = document.querySelectorAll('.chat-text img');
  images.forEach(img => {
    let src = img.getAttribute('src');
    if (!src) return;  // null 체크 추가
    let parts = src.split('/');
    let filename = parts[parts.length - 1];
    img.src = 'images/' + cleanImageFilename(filename);
  });
  let portraits = document.querySelectorAll('img.chat-image');
  portraits.forEach(img => {
    let src = img.getAttribute('src');
    if (!src) return;  // null 체크 추가
    let parts = src.split('/');
    let filename = parts[parts.length - 1];
    img.src = 'portraits/' + cleanImageFilename(filename);
  });
}


function cleanImageFilename(filename) {
  const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif', '.ico'];
  for (let ext of extensions) {
    if (filename.includes(ext)) {
      return filename.split(ext)[0] + ext;
    }
  }
  return filename;
}

console.log('[chat-tailor] chat-log.js: 클래스 정의 직전');

// v13+ DialogV2 우선, 없으면 v12 Dialog V1로 폴백
async function showConfirmDialog({ title, content, confirmLabel, confirmIcon = "fas fa-check", onConfirm }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    try {
      const ok = await DialogV2.confirm({
        window: { title },
        content: `<p>${content}</p>`,
        yes: { label: confirmLabel, icon: confirmIcon },
        no:  { label: game.i18n.localize("chat-tailor.dialog.download.button.cancel") }
      });
      if (ok) await onConfirm();
    } catch (e) {
      // 사용자가 닫음 등 — 조용히 무시
    }
    return;
  }
  // v12 폴백
  new Dialog({
    title,
    content,
    buttons: {
      confirm: {
        icon: `<i class="${confirmIcon}"></i>`,
        label: confirmLabel,
        callback: async () => { await onConfirm(); },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("chat-tailor.dialog.download.button.cancel"),
      },
    },
    default: "cancel",
  }).render(true);
}

// settings.registerMenu가 클래스를 요구하므로 클래스 래퍼는 유지하되 내부에서 DialogV2 사용
class DownloadChatArchive extends FormApplication {
  constructor() {
    super();
    showConfirmDialog({
      title: game.i18n.localize("chat-tailor.dialog.download.title"),
      content: game.i18n.localize("chat-tailor.dialog.download.content"),
      confirmLabel: game.i18n.localize("chat-tailor.dialog.download.button.download"),
      onConfirm: async () => {
        const chats = [...(game.messages.contents)];
        await downloadArchiveFile(chats);
      },
    });
  }
  getData() {}
  async _updateObject(event, formData) {}
}

class openChatArchiveWindow extends FormApplication {
  constructor() {
    super();
    showConfirmDialog({
      title: game.i18n.localize("chat-tailor.dialog.open.title"),
      content: game.i18n.localize("chat-tailor.dialog.open.content"),
      confirmLabel: game.i18n.localize("chat-tailor.dialog.open.button.open"),
      onConfirm: async () => {
        const chats = [...(game.messages.contents)];
        await openChatArchive(chats);
      },
    });
  }
  getData() {}
  async _updateObject(event, formData) {}
}

console.log('[chat-tailor] chat-log.js: 클래스 정의 완료, globalThis.DownloadChatArchive =', globalThis.DownloadChatArchive);

async function getDFchatArchive(filepath) {
  try {
    const response = await fetch(filepath);
    if (response.ok) {
      const jsonDataArray = await response.json();
      const chats = await jsonDataArray.map(data => new ChatMessage(data));
      await downloadArchiveFile(chats);
    } else {
      throw new Error('Could not access the archive from server side: ' + filepath);
    }
  } catch (error) {
    console.error(`Failed to read JSON for archive ${filepath}\n${error}`);
    throw error;
  } finally {
    game.settings.set("chat-tailor", "convertDFchatArchive", "");
  }
}

export { DownloadChatArchive, openChatArchiveWindow };