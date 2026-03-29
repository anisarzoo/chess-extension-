/**
 * Background Service Worker
 * Handles opening the side panel when the toolbar icon is clicked.
 */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:', error));

// Optional: Initial game setup or persistence management
chrome.runtime.onInstalled.addListener(() => {
    console.log('Chess vs Bot extension installed.');
});
