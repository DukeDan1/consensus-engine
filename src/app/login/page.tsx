import { Suspense } from "react";
import LoginForm from "@/app/components/LoginForm";
import { redirectIfLoggedIn } from "../lib/commonFunctions";

export default async function LoginPage() {
  await redirectIfLoggedIn();
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}