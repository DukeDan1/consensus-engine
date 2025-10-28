import RegisterForm from "@/app/components/RegisterForm";
import { redirectIfLoggedIn } from "../lib/commonFunctions";

export default async function RegisterPage() {
  await redirectIfLoggedIn();
  return <RegisterForm />;
}
