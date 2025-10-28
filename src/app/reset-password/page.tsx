import ResetPasswordForm from "@/app/components/ResetPasswordForm";
import { redirectIfLoggedIn } from "../lib/commonFunctions";

export default async function ResetPasswordPage() {
    await redirectIfLoggedIn();
    return <ResetPasswordForm />;
}
