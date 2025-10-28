import { redirectIfLoggedIn } from "./lib/commonFunctions";

export default async function Home() {
  await redirectIfLoggedIn();
  return (
    <div className="container">
      <h1>Welcome</h1>
      <p>Please <a href="/login">log in</a> or <a href="/register">register</a> to continue.</p>
    </div>
  );
}