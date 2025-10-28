import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

export async function redirectIfLoggedIn() {
    if (await isLoggedIn()) {
        redirect("/app");
    }
};

export async function redirectIfLoggedOut() {
    if (!(await isLoggedIn())) {
        redirect("/login?unauthed=true");
    }
};

export async function isLoggedIn(): Promise<boolean> {
    const session = await getServerSession();
    return !!session?.user;
}
