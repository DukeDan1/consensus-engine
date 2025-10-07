"use client";
import { useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
	const [loading, setLoading] = useState(false);

	const handleLogout = async () => {
		setLoading(true);
		try {
			await signOut({redirect: true, callbackUrl: "/login?logged_out=true" });
        } catch(err) {
            console.error(err);
            toast.error("Logout failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<button onClick={handleLogout} disabled={loading} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600">
				{loading ? "Logging out..." : "Log out"}
			</button>
			<ToastContainer />
		</>
	);
}