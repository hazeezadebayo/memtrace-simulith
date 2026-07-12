// content.js - exporter content script
console.log('Threadlet AI exporter content script loaded on', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'export') return;

  const dedupeThreshold = Number(request.dedupeThreshold ?? 90);
  const simThreshold = Math.max(0, Math.min(100, dedupeThreshold)) / 100.0;

  let attempts = 0;
  const maxAttempts = 20;
  const interval = setInterval(() => {
    attempts++;
    const chatContainer = document.querySelector('main, article, section, div[role="main"], div[role="article"]');
    if (chatContainer || attempts >= maxAttempts) {
      clearInterval(interval);
      if (!chatContainer) {
        alert('No chat container found. Ensure you are on a chat page.');
        sendResponse({ success: false });
        return;
      }
      scrollAndExtract(chatContainer);
    }
  }, 1000);

  function textSimilarity(a, b) {
    if (!a || !b) return 0;
    const ta = a.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const tb = b.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const freqa = {};
    const freqb = {};
    ta.forEach(t => freqa[t] = (freqa[t] || 0) + 1);
    tb.forEach(t => freqb[t] = (freqb[t] || 0) + 1);
    const all = new Set([...Object.keys(freqa), ...Object.keys(freqb)]);
    let dot = 0, na = 0, nb = 0;
    for (const k of all) {
      const va = freqa[k] || 0;
      const vb = freqb[k] || 0;
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
    return dot / denom;
  }

  function scrollAndExtract(container) {
    let lastHeight = document.body.scrollHeight;
    function scrollToBottom(cb) {
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => {
        const nh = document.body.scrollHeight;
        if (nh > lastHeight) {
          lastHeight = nh;
          scrollToBottom(cb);
        } else {
          cb();
        }
      }, 1500);
    }

    function extractChat() {
      const walker = document.createTreeWalker(container, Node.TEXT_NODE, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p || !p.offsetParent) return NodeFilter.FILTER_REJECT;
          if (p.closest('script, style, nav, footer, header, button, input')) return NodeFilter.FILTER_REJECT;

          // Exclude Hidden Accessibility Content
          if (p.closest('.sr-only, .visually-hidden, .hidden, [aria-hidden="true"], [style*="display: none"]')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const messages = [];
      const seen = new Set();

      // Sliding Window Buffer (concatenated string of recent outputs)
      let historyBuffer = "";
      const MAX_HISTORY = 3000;

      const aiBuzzwords = ['certainly', 'let\'s', 'here\'s how', 'assist', 'please', 'hope this helps', 'in summary', 'recommend', 'moreover', 'technical'];
      const humanBuzzwords = ['i think', 'i guess', 'maybe', 'lol', 'thanks', 'please', 'why', 'how', 'what', 'when', 'where'];

      function tagMessage(text) {
        const lower = text.toLowerCase();
        let assistantScore = 0, humanScore = 0;
        const words = lower.split(/\s+/).filter(Boolean);
        const punctuationCount = (text.match(/[,.!?;:\-\•\*\|\t]/g) || []).length;
        const ratio = punctuationCount / (words.length || 1);
        if (ratio > 0.1) assistantScore += 0.3; else humanScore += 0.1;
        const iCount = (lower.match(/\b(i|me|my)\b/gi) || []).length;
        const youCount = (lower.match(/\b(you|your)\b/gi) || []).length;
        if (iCount > 1) humanScore += 0.25;
        if (youCount > 1 && iCount === 0) assistantScore += 0.2;
        const aiHits = aiBuzzwords.reduce((s, w) => s + ((new RegExp(`\\b${w}\\b`).test(lower)) ? 1 : 0), 0);
        const humanHits = humanBuzzwords.reduce((s, w) => s + ((new RegExp(`\\b${w}\\b`).test(lower)) ? 1 : 0), 0);
        if (aiHits + humanHits > 0) {
          assistantScore += 0.5 * (aiHits / (aiHits + humanHits));
          humanScore += 0.5 * (humanHits / (aiHits + humanHits));
        } else {
          humanScore += 0.25; assistantScore += 0.25;
        }
        return assistantScore > humanScore ? 'Assistant' : 'Human';
      }

      function isTranscriptNode(text) {
        // Heuristic: If a single text node contains multiple turn-taking markers, it's likely a hidden transcript.
        // e.g. "You said hi Copilot said Hello!"
        const lower = text.toLowerCase();
        // Relaxed regex: match 'you said', 'copilot said' etc even if stuck to other words (e.g. TodayYou said)
        const matches = (lower.match(/(you|copilot|assistant|user|human)\s*said/g) || []).length;
        // If we see 2 or more speaker labels in one block, it's suspicious, unless it's a very long block?
        // Usually individual messages don't contain "You said" unless quoting.
        // But a transcript summary often has them.
        if (matches >= 2) return true;

        return false;
      }

      while (walker.nextNode()) {
        let txt = walker.currentNode.textContent.trim().replace(/\s+/g, ' ');
        if (!txt || txt.length < 20) continue;

        // --- NEW: Heuristic for Transcript / Summary Nodes ---
        if (isTranscriptNode(txt)) {
          continue;
        }

        const norm = txt.toLowerCase();
        if (seen.has(norm)) continue;

        // --- NEW: Sliding Window Deduplication ---
        // Instead of just checking previousMessage, check if this text is already PRESENT in the recent history.
        // This handles "Summary" (if missed by heuristic) -> "Msg 1" where Msg 1 is inside Summary.
        // Also handles "A", "B", "A" (interleaved).

        // 1. Fuzzy Sim against last added message (standard check)
        // (We can skip this if we rely on window, but keeping it for near-duplicates)

        // 2. Strict Substring Check in History Buffer
        if (historyBuffer.includes(norm) && norm.length > 30) {
          // It's already been properly output recently. Skip.
          seen.add(norm);
          continue;
        }

        // Reversed: If the NEW text contains the ENTIRE history buffer? Unlikely but possible if we found "Start" then "Start + End".
        // In that case, we probably want to output the "End" part only? Too complex.
        // Let's stick to: If we have seen this CONTENT recently, don't show it again.

        if (txt.length > 60) {
          const tag = tagMessage(txt);
          messages.push(`**${tag}**: ${txt}`);
        } else {
          messages.push(txt);
        }

        messages.push('', '---');
        seen.add(norm);

        // Update History Buffer
        historyBuffer += norm + " ";
        if (historyBuffer.length > MAX_HISTORY) {
          historyBuffer = historyBuffer.slice(historyBuffer.length - MAX_HISTORY);
        }
      }

      if (messages.length <= 1) {
        alert('No messages extracted. Try scrolling manually and re-run.');
        sendResponse({ success: false });
        return;
      }

      const joined = messages.join('\n');
      sendResponse({ success: true, text: joined });
    }

    scrollToBottom(extractChat);
  }

  return true;
});