import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход — zapros",
};

/**
 * Login screen. The session/role redirects (already-authenticated users, etc.)
 * are handled centrally in the middleware, so this page only renders the form.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-primary px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Вход в систему</CardTitle>
          <CardDescription>
            Введите email и пароль, выданные администратором.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
