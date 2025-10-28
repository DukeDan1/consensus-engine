import ForgotPasswordForm from "@/app/components/ForgotPasswordForm";
import { redirectIfLoggedIn } from "../lib/commonFunctions";

export default async function ForgotPasswordPage() {
    await redirectIfLoggedIn();
    return <ForgotPasswordForm />;
}
