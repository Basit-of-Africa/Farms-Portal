/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sprout, LogIn, Loader2 } from 'lucide-react';
import { loginSchema, LoginInput } from '../lib/schemas';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormField, FormError } from './ui/form';

interface LoginProps {
  onLoginSuccess: (token: string, user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sign-in failed. Please try again.');
      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setServerError(err.message || 'Sign-in failed. Please try again.');
    }
  };

  return (
    <div id="login-stage" className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-premium overflow-hidden border border-border">
        <div className="bg-gradient-to-b from-[#143427] to-[#0E251B] px-8 py-10 text-center text-white">
          <div className="mx-auto w-14 h-14 bg-brand/10 border border-brand/20 rounded-2xl flex items-center justify-center mb-4">
            <Sprout className="h-8 w-8 text-brand" aria-hidden="true" />
          </div>
          <h1 className="font-bold text-2xl tracking-wide">Adubiaro Farms</h1>
          <p className="text-brand text-sm font-semibold mt-1">Investor Portal</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 flex flex-col gap-4" noValidate>
          <FormError message={serverError} />
          <FormField id="id-username" label="Username" error={errors.username}>
            <Input autoComplete="username" autoCapitalize="none" placeholder="Your username" {...register('username')} />
          </FormField>
          <FormField id="id-password" label="Password" error={errors.password}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </FormField>
          <Button id="btn-submit" type="submit" size="lg" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            Sign in
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Forgotten your password? Contact the Adubiaro team and we will send you new login details.
          </p>
        </form>
      </div>

      <a href="/privacy" className="mt-6 text-sm font-semibold text-primary underline underline-offset-4">
        Privacy notice
      </a>
    </div>
  );
}
