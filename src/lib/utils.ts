/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatNaira = (n: number | string | null | undefined) => `₦${Number(n || 0).toLocaleString('en-NG')}`;


/** Tracks the portal's dark-mode class on <html>. */
export function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Chart colours, validated for contrast/chroma against each theme's card surface. */
export const chartTheme = (dark: boolean) => ({
  series: dark ? '#40A872' : '#2E7D52',
  grid: dark ? '#33302d' : '#ebe8e0',
  axis: dark ? '#a8a29e' : '#5b6b62',
  surface: dark ? '#1c1917' : '#ffffff'
});

/** Auto-generated farm numbers (e.g. "P-AB12-3") mean nothing to people, so hide them. */
export const plotLabel = (n: string | null | undefined) => (!n || /^P-[A-Z0-9]{1,6}-\d+(-\d+)?$/i.test(n) ? '—' : n);
