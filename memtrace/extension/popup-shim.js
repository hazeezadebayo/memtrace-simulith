if (!window.chrome) window.chrome = {};
if (!window.chrome.tabs) {
  window.chrome.tabs = {
    query: async () => [{ url: window.location.href, id: 'workspace-tab' }],
    sendMessage: (id, msg, handler) => { if (handler) handler({ success: false, error: 'Please use the Bookmarklet to extract content from other pages.' }); }
  };
}
if (!window.chrome.storage) {
  window.chrome.storage = {
    local: {
      get: async (key) => {
        if (typeof key === 'string') return { [key]: localStorage.getItem(key) };
        return {};
      },
      set: async (obj) => {
        for (const [k, v] of Object.entries(obj)) {
          localStorage.setItem(k, v);
        }
      }
    }
  };
}
if (!window.chrome.runtime) {
  window.chrome.runtime = {
    getURL: (path) => '/extension/' + path,
    lastError: null,
    sendMessage: (msg, handler) => {
      if (msg && msg.action === 'download') {
        const blob = new Blob([msg.log], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.filename || 'download.json';
        a.click();
        URL.revokeObjectURL(url);
        if (handler) handler({ success: true });
        return;
      }
      if (handler) handler({ success: false });
    }
  };
}
if (!window.chrome.scripting) {
  window.chrome.scripting = {
    executeScript: (opts, cb) => { if (cb) cb(); }
  };
}
