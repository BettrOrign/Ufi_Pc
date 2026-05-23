import { handleYoutubeSearch, handleYoutubePlay, handleBrowserGo } from './browser.js';
import { handleTelegramSend, handleTelegramSearchContact, handleTelegramGetRecent, handleTelegramGetUnread } from './telegram.js';
import { handleSetReminder, handleListReminders, handleDeleteReminder } from './reminders.js';
import { handleDeepResearch } from './deep-research.js';
import { handleMediaPlay, handleMediaPause, handleMediaStop, handleMediaNext, handleMediaPrevious, handleMediaVolumeUp, handleMediaVolumeDown } from './media.js';
import { handleDisplayText } from './display-text.js';
import { handleShowImage } from './show-image.js';
import { handleToggleScreenShare } from './screen-share.js';
import { handleSystemCommand } from './system-command.js';
import { handleRepoSearch } from './repo-search.js';

export const HANDLERS = {
  youtubeSearch:          handleYoutubeSearch,
  youtubePlay:            handleYoutubePlay,
  browserGo:              handleBrowserGo,
  telegramSend:           handleTelegramSend,
  telegramSearchContact:  handleTelegramSearchContact,
  telegramGetRecent:      handleTelegramGetRecent,
  telegramGetUnread:      handleTelegramGetUnread,
  setReminder:            handleSetReminder,
  listReminders:          handleListReminders,
  deleteReminder:         handleDeleteReminder,
  deepResearch:           handleDeepResearch,
  mediaPlay:              handleMediaPlay,
  mediaPause:             handleMediaPause,
  mediaStop:              handleMediaStop,
  mediaNext:              handleMediaNext,
  mediaPrevious:          handleMediaPrevious,
  mediaVolumeUp:          handleMediaVolumeUp,
  mediaVolumeDown:        handleMediaVolumeDown,
  displayText:            handleDisplayText,
  showImage:              handleShowImage,
  toggleScreenShare:      handleToggleScreenShare,
  systemCommand:          handleSystemCommand,
  repoSearch:             handleRepoSearch,
};
