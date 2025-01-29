document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggleSwitch');

    // Load saved state
    chrome.storage.local.get(['enabled'], (result) => {
        toggleSwitch.checked = result.enabled !== false; // Default to true if not set
    });

    // Save state when changed
    toggleSwitch.addEventListener('change', () => {
        const enabled = toggleSwitch.checked;
        chrome.storage.local.set({ enabled });

        // Send message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleQR', enabled });
        });
    });
}); 