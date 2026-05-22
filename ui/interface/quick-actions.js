import { dom } from './dom.js';
import { sendTextMessage } from './chat.js';

export function initChips() {
  if (!dom.chipsBar) return;
  
  dom.chipsBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const action = chip.dataset.action;
    const prompts = {
      weather: "Проверь погоду в Москве",
      search: "Найди в интернете информацию о ",
      'tg-send': "Отправь сообщение в избранные: ",
      'tg-read': "Покажи последние сообщения из Telegram",
      youtube: "Найди на YouTube видео: ",
      browse: "Открой сайт: ",
    };
    const text = prompts[action] || action;
    if (text.endsWith(': ')) {
      dom.userInput.value = text;
      dom.userInput.focus();
    } else {
      sendTextMessage(text);
    }
  });
}
