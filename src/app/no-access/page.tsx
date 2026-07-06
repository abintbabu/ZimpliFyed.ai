export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
      <h1 className="text-2xl font-semibold text-ink">No workspace access</h1>
      <p className="text-sm text-muted">
        Your account isn&apos;t a member of this workspace yet. Ask an admin to invite you.
      </p>
    </main>
  );
}
