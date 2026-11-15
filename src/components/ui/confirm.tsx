/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Promise-based replacements for window.confirm / window.prompt that use an
 * accessible dialog:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete farm?', destructive: true })) { ... }
 *
 *   const prompt = usePrompt();
 *   const reason = await prompt({ title: 'Reason for rejecting' }); // null if cancelled
 */

import * as React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from './button';
import { Input, Textarea } from './input';
import { Label } from './label';

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Require typing this exact text to enable the confirm button */
  requireText?: string;
}

interface PromptOptions {
  title: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  multiline?: boolean;
  /** Reject empty answers */
  required?: boolean;
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

const Ctx = React.createContext<{ open: (r: Request) => void } | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<Request | null>(null);
  const [text, setText] = React.useState('');

  const open = React.useCallback((r: Request) => {
    setText(r.kind === 'prompt' ? r.options.defaultValue || '' : '');
    setRequest(r);
  }, []);

  const finish = (value: boolean) => {
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(value);
    else request.resolve(value ? text : null);
    setRequest(null);
  };

  const o = request?.options;
  const confirmDisabled =
    !!request &&
    ((request.kind === 'confirm' && !!request.options.requireText && text !== request.options.requireText) ||
      (request.kind === 'prompt' && !!request.options.required && !text.trim()));

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <AlertDialog.Root open={!!request} onOpenChange={isOpen => !isOpen && finish(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[301] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl focus:outline-none">
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!confirmDisabled) finish(true);
              }}
              className="flex flex-col gap-4"
            >
              <AlertDialog.Title className="text-lg font-bold">{o?.title}</AlertDialog.Title>
              {o?.description ? (
                <AlertDialog.Description asChild>
                  <div className="text-sm text-muted-foreground">{o.description}</div>
                </AlertDialog.Description>
              ) : (
                <AlertDialog.Description className="sr-only">{o?.title}</AlertDialog.Description>
              )}
              {request?.kind === 'confirm' && request.options.requireText && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm-type">
                    Type <b>{request.options.requireText}</b> to confirm
                  </Label>
                  <Input id="confirm-type" autoFocus value={text} onChange={e => setText(e.target.value)} autoComplete="off" />
                </div>
              )}
              {request?.kind === 'prompt' && (
                <div className="flex flex-col gap-2">
                  {request.options.label && <Label htmlFor="prompt-input">{request.options.label}</Label>}
                  {request.options.multiline ? (
                    <Textarea id="prompt-input" autoFocus rows={3} placeholder={request.options.placeholder} value={text} onChange={e => setText(e.target.value)} />
                  ) : (
                    <Input id="prompt-input" autoFocus placeholder={request.options.placeholder} value={text} onChange={e => setText(e.target.value)} />
                  )}
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild>
                  <Button type="button" variant="outline">{(request?.kind === 'confirm' && request.options.cancelText) || 'Cancel'}</Button>
                </AlertDialog.Cancel>
                <Button type="submit" variant={request?.kind === 'confirm' && request.options.destructive ? 'destructive' : 'default'} disabled={confirmDisabled}>
                  {o?.confirmText || (request?.kind === 'prompt' ? 'Submit' : 'Confirm')}
                </Button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Ctx.Provider>
  );
}

function useCtx() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('ConfirmProvider is missing');
  return ctx;
}

export function useConfirm() {
  const { open } = useCtx();
  return React.useCallback(
    (options: ConfirmOptions | string) =>
      new Promise<boolean>(resolve => open({ kind: 'confirm', options: typeof options === 'string' ? { title: options } : options, resolve })),
    [open]
  );
}

export function usePrompt() {
  const { open } = useCtx();
  return React.useCallback(
    (options: PromptOptions | string) =>
      new Promise<string | null>(resolve => open({ kind: 'prompt', options: typeof options === 'string' ? { title: options } : options, resolve })),
    [open]
  );
}
