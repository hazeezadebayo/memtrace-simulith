// background.js - downloads handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'download') return false;
  try {
    const filename = request.filename || 'download.json';
    const payload = request.log || '';
    let url;
    if (typeof payload === 'string' && payload.startsWith('data:')) {
      url = payload;
    } else {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext === 'txt' || ext === 'md') {
        url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(payload);
      } else if (ext === 'json') {
        url = 'data:application/json;charset=utf-8,' + encodeURIComponent(payload);
      } else {
        url = 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(payload);
      }
    }
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true, downloadId });
    });
  } catch (err) {
    sendResponse({ success: false, error: String(err) });
  }
  return true;
});