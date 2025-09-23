import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function AppPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token).catch(() => null) : null;

  return (
    <div className="container mt-5">
      <h1>My App</h1>
      {session ? (
        <>
          <p>Logged in as <strong>{session.email}</strong></p>
          <LogoutButton />
        </>
      ) : (
        <p>You are not logged in (middleware should have redirected you here only if logged in).</p>
      )}
    </div>
  );
}
