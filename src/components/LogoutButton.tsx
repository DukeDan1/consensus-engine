"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast, ToastContainer } from "react-toastify";

export default function LogoutButton() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const handleLogout = async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/logout", { method: "POST" });
			if (res.ok) {
				router.push("/login?logged_out=true");
			} else {
				toast.error("Logout failed");
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<button onClick={handleLogout} disabled={loading} className="btn btn-secondary">
				{loading ? "Logging out..." : "Log out"}
			</button>
			<ToastContainer />
		</>
	);
}