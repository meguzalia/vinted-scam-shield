document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const lensSection = document.getElementById('lens-section');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url ?? '';
    const onVinted = url.includes('vinted.');
    const onItem   = url.includes('/items/');

    if (onItem) {
      // Ask content script if it finished and found anything
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          // Content script not ready yet — show neutral active state
          setStatus('active', 'Active on this page');
        } else if (response.warned) {
          setStatus('warned', 'Warning shown on this listing');
        } else {
          setStatus('active', 'No issues found on this listing');
        }
      });

      // Show Google Lens button on item pages
      if (lensSection) lensSection.style.display = 'block';

      // Wire up lens button
      document.getElementById('lens-btn').addEventListener('click', () => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getLensUrl' }, (response) => {
          if (response?.url) {
            chrome.tabs.create({ url: 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(response.url) });
          }
        });
      });

    } else if (onVinted) {
      setStatus('active', 'Active — open an item to scan');
    } else {
      setStatus('inactive', 'Go to Vinted to activate');
    }
  });

  function setStatus(type, text) {
    const dot = statusEl.querySelector('.dot');
    const label = statusEl.querySelector('span:last-child');
    if (label) label.textContent = text;

    if (type === 'inactive') {
      statusEl.style.background = '#F9FAFB';
      statusEl.style.borderColor = '#E5E7EB';
      statusEl.style.color = '#9CA3AF';
      if (dot) { dot.style.background = '#D1D5DB'; dot.style.animation = 'none'; }
    } else if (type === 'warned') {
      statusEl.style.background = '#FFF5F5';
      statusEl.style.borderColor = '#FFCDD2';
      statusEl.style.color = '#E53935';
      if (dot) { dot.style.background = '#E53935'; }
    } else {
      // active / clean
      statusEl.style.background = '#F0FDF9';
      statusEl.style.borderColor = '#BBF7F0';
      statusEl.style.color = '#0E9A82';
      if (dot) { dot.style.background = '#10B981'; }
    }
  }
});
