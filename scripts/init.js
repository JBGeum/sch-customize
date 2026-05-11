import { DownloadChatArchive, openChatArchiveWindow } from "./chat-log.js";
import { registerSpeakerBar } from "./speaker-bar.js";

let lastPrivTalkMsg;
let lastBaseMsg;
let privTalkIndex = 0;

Hooks.once("setup", function () {
  const commands = game.chatCommands;
  if (game.settings.get("chat-tailor", "enableSpeakerBar")) {
    registerSpeakerBar();
  }
  lastPrivTalkMsg = null;
  lastBaseMsg = null;
  privTalkIndex = 0;
  commands.register({
    name: "/pt",
    module: "core",
    aliases: [`${game.settings.get('chat-tailor', 'customPrivTalkAlias')}`,"`", "!"],
    icon: "<i class='fas fa-dice-d20'></i>",
    requiredRole: "NONE",
    callback: async function (chat, parameters, messageData){
      if (!game.settings.get("chat-tailor", "markdownDelUse"))
        parameters = parameters.replace(/<\s*\/?\s*del\s*>/g, '~');

      const speakUser = (messageData.user instanceof User ? messageData.user : game.users.get(messageData.user));
      messageData.speaker.actor = speakUser.id;
      messageData.speaker.token = null;
      messageData.speaker.alias = speakUser.name;
      messageData.type = game.settings.get("chat-tailor", "privTalkAsOOC") ? CONST.CHAT_MESSAGE_TYPES.OOC : CONST.CHAT_MESSAGE_TYPES.OTHER;

      return {
        content: parameters,
        flags: {
          'chat-tailor':
              {'priv_talk': true}
        }
      }
    },
    autocompleteCallback: (menu, alias, parameters) => [game.chatCommands.createInfoElement("잡담")],
    closeOnComplete: true
  });
});


Hooks.on("renderChatMessage", (message, html, messageData) => {
  const privTalkMergeEnabled = game.settings.get("chat-tailor", "privTalkMerge");
  const baseMessageMergeEnabled = game.settings.get("chat-tailor", "baseMessageMerge");
  const privFlag = message.flags.priv_talk || message.getFlag('chat-tailor', 'priv_talk');
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
    if (!game.settings.get("chat-tailor", "privTalkSpeakerLineChange"))
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

  game.settings.register("chat-tailor", "enableSpeakerBar", {
    name: "chat-tailor.settings.enableSpeakerBar.name",
    hint: "chat-tailor.settings.enableSpeakerBar.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.registerMenu("chat-tailor", "downloadChatArchiveMenu", {
    name: "chat-tailor.settings.downloadChatArchiveMenu.name",
    hint: "chat-tailor.settings.downloadChatArchiveMenu.hint",
    icon: "fas fa-download",
    type: DownloadChatArchive
  });

  game.settings.registerMenu("chat-tailor", "openChatArchiveWindow", {
    name: "chat-tailor.settings.openChatArchiveWindow.name",
    hint: "chat-tailor.settings.openChatArchiveWindow.hint",
    icon: "fas fa-arrow-up-right-from-square",
    type: openChatArchiveWindow
  });

  game.settings.register("chat-tailor", "includeWhisper", {
    name: "chat-tailor.settings.includeWhisper.name",
    hint: "chat-tailor.settings.includeWhisper.hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("chat-tailor", "hideWhisper", {
    name: "chat-tailor.settings.hideWhisper.name",
    hint: "chat-tailor.settings.hideWhisper.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("chat-tailor", "convertDFchatArchive", {
    name: "chat-tailor.settings.convertDFchatArchive.name",
    restricted: true,
    config: true,
    type: String,
    filePicker: "any",
    default: "",
    onChange: value => {
      if (value.endsWith(".json"))
        getDFchatArchive(value);
      else if (value.length > 0)
        alert(game.i18n.localize("chat-tailor.settings.convertDFchatArchive.alert"));
    }
  });

  game.settings.register("chat-tailor", "customPrivTalkAlias", {
    name: "chat-tailor.settings.customPrivTalkAlias.name",
    hint: "chat-tailor.settings.customPrivTalkAlias.hint",
    scope: "client",
    config: true,
    default: "/p",
    type: String,
    onChange: _ => window.location.reload()
  });

  game.settings.register("chat-tailor", "markdownDelUse", {
    name: "chat-tailor.settings.markdownDelUse.name",
    hint: "chat-tailor.settings.markdownDelUse.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("chat-tailor", "privTalkAsOOC", {
    name: "chat-tailor.settings.privTalkAsOOC.name",
    hint: "chat-tailor.settings.privTalkAsOOC.hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  game.settings.register("chat-tailor", "privTalkSpeakerLineChange", {
    name: "chat-tailor.settings.privTalkSpeakerLineChange.name",
    hint: "chat-tailor.settings.privTalkSpeakerLineChange.hint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("chat-tailor", "baseMessageMerge", {
    name: "chat-tailor.settings.baseMessageMerge.name",
    hint: "chat-tailor.settings.baseMessageMerge.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("chat-tailor", "privTalkMerge", {
    name: "chat-tailor.settings.privTalkMerge.name",
    hint: "chat-tailor.settings.privTalkMerge.hint",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: _ => window.location.reload()
  });

  game.settings.register("chat-tailor", "setChatLogFontSize", {
    name: "chat-tailor.settings.setChatLogFontSize.name",
    hint: "chat-tailor.settings.setChatLogFontSize.hint",
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

  game.settings.register("chat-tailor", "setPrivTalkFontSize", {
    name: "chat-tailor.settings.setPrivTalkFontSize.name",
    hint: "chat-tailor.settings.setPrivTalkFontSize.hint",
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

  game.settings.register("chat-tailor", "setPrivTalkFontOpacity", {
    name: "chat-tailor.settings.setPrivTalkFontOpacity.name",
    hint: "chat-tailor.settings.setPrivTalkFontOpacity.hint",
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

  game.settings.register("chat-tailor", "setPrivTalkMarginLeft", {
    name: "chat-tailor.settings.setPrivTalkMarginLeft.name",
    hint: "chat-tailor.settings.setPrivTalkMarginLeft.hint",
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

  game.settings.register("chat-tailor", "setPrivTalkBgBrightness", {
    name: "chat-tailor.settings.setPrivTalkBgBrightness.name",
    hint: "chat-tailor.settings.setPrivTalkBgBrightness.hint",
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


  updateCssProperty('fontColor', `rgba(0,0,0,${(game.settings.get("chat-tailor", "setPrivTalkFontOpacity"))})` );
  updateCssProperty('clFontSize',`${game.settings.get("chat-tailor", "setChatLogFontSize")}px`);
  updateCssProperty('ptFontSize',`${game.settings.get("chat-tailor", "setPrivTalkFontSize")}px`);
  updateCssProperty('marginLeft',`${game.settings.get("chat-tailor", "setPrivTalkMarginLeft")}px`);
  updateCssProperty('brightness',`${game.settings.get("chat-tailor", "setPrivTalkBgBrightness")}`);
});

Hooks.once('ready', () => setUserColorBg());

const cssProperty = {
  ptFontSize : '--priv-talk-font-size',
  fontColor : '--priv-talk-font-color',
  marginLeft : '--priv-talk-margin-left',
  brightness : '--priv-talk-bg-brightness',
  clFontSize : '--ct-chat-font-size'
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
