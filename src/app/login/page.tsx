import { Suspense } from "react";
import LoginForm from "@/app/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}