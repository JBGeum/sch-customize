import { DownloadChatArchive, openChatArchiveWindow } from "./chat-log.js";
import { registerSpeakerBar } from "./speaker-bar.js";

let lastPrivTalkMsg;
let lastBaseMsg;
let privTalkIndex = 0;

Hooks.once("setup", function () {
  const commands = game.chatCommands;
  if (game.settings.get("sch-customize", "enableSpeakerBar")) {
    registerSpeakerBar();
  }
  lastPrivTalkMsg = null;
  lastBaseMsg = null;
  privTalkIndex = 0;
  commands.register({
    name: "/pt",
    module: "core",
    aliases: [`${game.settings.get('sch-customize', 'customPrivTalkAlias')}`,"`", "!"],
    icon: "<i class='fas fa-dice-d20'></i>",
    requiredRole: "NONE",
    callback: async function (chat, parameters, messageData){
      if (!game.settings.get("sch-customize", "markdownDelUse"))
        parameters = parameters.replace(/<\s*\/?\s*del\s*>/g, '~');

      const speakUser = (messageData.user instanceof User ? messageData.user : game.users.get(messageData.user));
      messageData.speaker.actor = speakUser.id;
      messageData.speaker.token = null;
      messageData.speaker.alias = speakUser.name;
      messageData.type = game.settings.get("sch-customize", "privTalkAsOOC") ? CONST.CHAT_MESSAGE_TYPES.OOC : CONST.CHAT_MESSAGE_TYPES.OTHER;

      return {
        content: parameters,
        flags: {
          'sch-customize':
              {'priv_talk': true}
        }
      }
    },
    autocompleteCallback: (menu, alias, parameters) => [game.chatCommands.createInfoElement("잡담")],
    closeOnComplete: true
  });
});


Hooks.on("renderChatMessage", (message, html, messageData) => {
  const privTalkMergeEnabled = game.settings.get("sch-customize", "privTalkMerge");
  const baseMessageMergeEnabled = game.settings.get("sch-customize", "baseMessageMerge");
  const privFlag = message.flags.priv_talk || message.getFlag('sch-customize', 'priv_talk');
  if (privFlag) {
    html.addClass('priv_talk');
    html.addClass(`user-${message.user.id}`);
    if (privTalkMergeEnabled) {
      if (privTalkIndex > 0 && lastPrivTalkMsg) {
        const prevHtml = lastPrivTalkMsg;
        if (prevHtml.hasClass('end')) {
          prevHtml.removeClass('end');
          prevHtml.addClass('middle');
          html.addClass('end');
        } else {
          prevHtml.addClass('top');
          html.addClass('end');
        }
      }
      lastPrivTalkMsg = html;
    }
    privTalkIndex++;
    html.find('header').css("display", "none");
    html.find('.message-content').html(`<div class="pt priv_user">${message.speaker.alias}</div> <div class="pt">${message.content}</div>`);
    if (!game.settings.get("sch-customize", "privTalkSpeakerLineChange"))
      html.addClass('line-change');
  }
  else {
    if (baseMessageMergeEnabled && lastBaseMsg) {
      const lastMsgEl = lastBaseMsg.html;
      const lastMessage = lastBaseMsg.msg;
      const lastMsgPrivTalkFlag = privTalkIndex > 0;
      const lastMsgTypeSame = lastMessage.style == message.style;
      const sameAutherChat = lastMessage.author == message.author;
      if (!sameAutherChat || lastMsgPrivTalkFlag || !lastMsgTypeSame) {

      } else if (sameAutherChat && lastMsgEl.hasClass('end')) {
        lastMsgEl.removeClass('end');
        lastMsgEl.addClass('middle');
        html.addClass('end');
      } else {
        lastMsgEl.addClass('top');
        html.addClass('end');
      }
    }
    lastBaseMsg = { msg: message, html: html };
    privTalkIndex = 0;
  }
});


Hooks.once('init', () => {

  game.settings.register("sch-customize", "enableSpeakerBar", {
    name: "sch-customize.settings.enableSpeakerBar.name",
    hint: "sch-customize.settings.enableSpeakerBar.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.registerMenu("sch-customize", "downloadChatArchiveMenu", {
    name: "sch-customize.settings.downloadChatArchiveMenu.name",
    hint: "sch-customize.settings.downloadChatArchiveMenu.hint",
    icon: "fas fa-download",
    type: DownloadChatArchive
  });

  game.settings.registerMenu("sch-customize", "openChatArchiveWindow", {
    name: "sch-customize.settings.openChatArchiveWindow.name",
    hint: "sch-customize.settings.openChatArchiveWindow.hint",
    icon: "fas fa-arrow-up-right-from-square",
    type: openChatArchiveWindow
  });

  game.settings.register("sch-customize", "includeWhisper", {
    name: "sch-customize.settings.includeWhisper.name",
    hint: "sch-customize.settings.includeWhisper.hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("sch-customize", "hideWhisper", {
    name: "sch-customize.settings.hideWhisper.name",
    hint: "sch-customize.settings.hideWhisper.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("sch-customize", "convertDFchatArchive", {
    name: "sch-customize.settings.convertDFchatArchive.name",
    restricted: true,
    config: true,
    type: String,
    filePicker: "any",
    default: "",
    onChange: value => {
      if (value.endsWith(".json"))
        getDFchatArchive(value);
      else if (value.length > 0)
        alert(game.i18n.localize("sch-customize.settings.convertDFchatArchive.alert"));
    }
  });

  game.settings.register("sch-customize", "customPrivTalkAlias", {
    name: "sch-customize.settings.customPrivTalkAlias.name",
    hint: "sch-customize.settings.customPrivTalkAlias.hint",
    scope: "client",
    config: true,
    default: "/p",
    type: String,
    onChange: _ => window.location.reload()
  });

  game.settings.register("sch-customize", "markdownDelUse", {
    name: "sch-customize.settings.markdownDelUse.name",
    hint: "sch-customize.settings.markdownDelUse.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("sch-customize", "privTalkAsOOC", {
    name: "sch-customize.settings.privTalkAsOOC.name",
    hint: "sch-customize.settings.privTalkAsOOC.hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  game.settings.register("sch-customize", "privTalkSpeakerLineChange", {
    name: "sch-customize.settings.privTalkSpeakerLineChange.name",
    hint: "sch-customize.settings.privTalkSpeakerLineChange.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("sch-customize", "baseMessageMerge", {
    name: "sch-customize.settings.baseMessageMerge.name",
    hint: "sch-customize.settings.baseMessageMerge.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("sch-customize", "privTalkMerge", {
    name: "sch-customize.settings.privTalkMerge.name",
    hint: "sch-customize.settings.privTalkMerge.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("sch-customize", "setChatLogFontSize", {
    name: "sch-customize.settings.setChatLogFontSize.name",
    hint: "sch-customize.settings.setChatLogFontSize.hint",
    config: true,
    type: Number,
    scope: 'client',
    range: {
      min: 14,
      max: 30,
      step: 0.5
    },
    default: 14,
    onChange: (value) => this.updateCssProperty('clFontSize', `${value}px`)
  });

  game.settings.register("sch-customize", "setPrivTalkFontSize", {
    name: "sch-customize.settings.setPrivTalkFontSize.name",
    hint: "sch-customize.settings.setPrivTalkFontSize.hint",
    config: true,
    type: Number,
    scope: 'client',
    range: {
      min: 10,
      max: 30,
      step: 0.5
    },
    default: 12,
    onChange: (value) => this.updateCssProperty('ptFontSize', `${value}px`)
  });

  game.settings.register("sch-customize", "setPrivTalkFontOpacity", {
    name: "sch-customize.settings.setPrivTalkFontOpacity.name",
    hint: "sch-customize.settings.setPrivTalkFontOpacity.hint",
    config: true,
    type: Number,
    scope: 'client',
    range: {
      min: 0,
      max: 1,
      step: 0.05
    },
    default: 0.8,
    onChange: (value) => this.updateCssProperty('fontColor', `rgba(0,0,0,${value})`)
  });

  game.settings.register("sch-customize", "setPrivTalkMarginLeft", {
    name: "sch-customize.settings.setPrivTalkMarginLeft.name",
    hint: "sch-customize.settings.setPrivTalkMarginLeft.hint",
    config: true,
    type: Number,
    scope: 'client',
    range: {
      min: 0,
      max: 40,
      step: 1
    },
    default: 10,
    onChange: (value) => updateCssProperty('marginLeft', `${value}px`)
  });

  game.settings.register("sch-customize", "setPrivTalkBgBrightness", {
    name: "sch-customize.settings.setPrivTalkBgBrightness.name",
    hint: "sch-customize.settings.setPrivTalkBgBrightness.hint",
    config: true,
    type: Number,
    scope: 'client',
    range: {
      min: 0,
      max: 1,
      step: 0.05
    },
    default: 0.7,
    onChange: (value) => updateCssProperty('brightness', `${value}`)
  });


  updateCssProperty('fontColor', `rgba(0,0,0,${(game.settings.get("sch-customize", "setPrivTalkFontOpacity"))})` );
  updateCssProperty('clFontSize',`${game.settings.get("sch-customize", "setChatLogFontSize")}px`);
  updateCssProperty('ptFontSize',`${game.settings.get("sch-customize", "setPrivTalkFontSize")}px`);
  updateCssProperty('marginLeft',`${game.settings.get("sch-customize", "setPrivTalkMarginLeft")}px`);
  updateCssProperty('brightness',`${game.settings.get("sch-customize", "setPrivTalkBgBrightness")}`);
});

Hooks.once('ready', () => setUserColorBg());

const cssProperty = {
  ptFontSize : '--priv-talk-font-size',
  fontColor : '--priv-talk-font-color',
  marginLeft : '--priv-talk-margin-left',
  brightness : '--priv-talk-bg-brightness',
  clFontSize : '--sch-cus-chat-font-size'
}


function updateCssProperty(property,value){
  if(value)
    document.querySelector(':root').style.setProperty(cssProperty[property], value);
}


function setUserColorBg(){
  const style = document.createElement('style');
  style.type = 'text/css';
  let cssText = '';

  game.users.forEach(user => {
    cssText += `.user-${user.id} { background: ${user.color} !important;}`
  });

  if (style.styleSheet) {
    style.styleSheet.cssText = cssText;
  } else {
    style.appendChild(document.createTextNode(cssText));
  }
  document.head.appendChild(style);
}
