"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialSignInState: SignInState = { error: null };

/**
 * Client-side login form. Wires the email + password fields to the `signIn`
 * server action via `useActionState`, surfacing validation/credential errors
 * returned by the action and disabling the submit button while pending.
 */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    signIn,
    initialSignInState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
