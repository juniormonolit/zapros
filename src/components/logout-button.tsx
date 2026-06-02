import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Submits the `signOut` server action. Rendered as a plain `<form>` so it works
 * without client-side JavaScript.
 */
export function LogoutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        Выйти
      </Button>
    </form>
  );
}
