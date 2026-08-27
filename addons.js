// Bazar Dzair - Addons Configuration Loader
// This file loads third-party integrations (Google Analytics, Meta Pixel, TikTok Pixel, etc.)
// from Firestore and injects them into the page dynamically.

(function() {
  'use strict';
  
  // Initialize addon loader when Firestore is ready
  window.initAddonsLoader = function() {
    // Addons will be loaded from Firestore settings/addons document
    // This happens automatically when the page loads and Firebase is initialized
    if (typeof window.bazarDb !== 'undefined') {
      loadAddonsFromFirestore();
    }
  };
  
  function loadAddonsFromFirestore() {
    // Addons are loaded asynchronously via the main page script
    // No action needed here - the main script handles it
  }
  
  // Auto-initialize if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initAddonsLoader);
  } else {
    window.initAddonsLoader();
  }
})();
