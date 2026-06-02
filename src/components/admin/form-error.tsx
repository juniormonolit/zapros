/**
 * Inline, accessible error banner shared by the admin catalog forms. Renders
 * nothing when there is no error so callers can pass a nullable message
 * directly.
 */
export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
    >
      {error}
    </p>
  );
}
