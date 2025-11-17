"use client";
import React from 'react';

/**
 * A skip link that becomes visible on focus and allows keyboard users
 * to jump to the main content area (#main-content).
 */
export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      onClick={(e) => {
        // Improve robustness: if #main-content missing, focus first <main>
        const target = document.getElementById('main-content') || document.querySelector('main') as HTMLElement | null;
        if (target) {
          e.preventDefault();
          target.setAttribute('tabindex', '-1');
          (target as HTMLElement).focus({ preventScroll: false });
        }
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary-600 focus:text-white"
    >
      Skip to content
    </a>
  );
}
