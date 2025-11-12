import { redirectIfLoggedIn } from "./lib/commonFunctions";
import Link from "next/link";

export default async function Home() {
  await redirectIfLoggedIn();
  return (
    <div className="container">
      <h1>Welcome</h1>
      <p>Please <Link href="/login">log in</Link> or <Link href="/register">register</Link> to continue.</p>
    </div>
  );
}