import type { Metadata } from "next";

import { BrandLogo } from "@/components/brand/brand-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход",
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
          <div className="mb-5 flex w-full justify-center">
            <BrandLogo variant="login" />
          </div>
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
