import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

export async function redirectIfLoggedIn() {
    if (await isLoggedIn()) {
        redirect("/topics");
    }
}

export async function isLoggedIn(): Promise<boolean> {
    const session = await getServerSession();
    return !!session?.user;
}

export function timeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const intervals: [number, string][] = [
        [60, "second"],
        [60, "minute"],
        [24, "hour"],
        [30, "day"],
        [12, "month"],
        [Number.POSITIVE_INFINITY, "year"],
    ];

    let i = 0, value = seconds;
    while (i < intervals.length && value >= intervals[i][0]) {
        value = Math.floor(value / intervals[i][0]);
        i++;
    }
    const unit = intervals[i][1];
    const output = `${value} ${unit}${value !== 1 ? "s" : ""} ago`;
    return output == "0 seconds ago" ? "just now" : output;
}
