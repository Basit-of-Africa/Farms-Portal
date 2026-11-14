/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

/** App-wide notification area. Follows the portal's light/dark setting. */
export function Toaster() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return (
    <Sonner
      theme={dark ? 'dark' : 'light'}
      position="top-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'rounded-2xl text-sm', description: 'text-sm' } }}
    />
  );
}
