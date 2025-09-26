import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import LoginForm from "./LoginForm";

// Mock next/navigation useSearchParams
vi.mock("next/navigation", () => ({
    useSearchParams: () => ({
        get: vi.fn((key: string) => null),
    }),
}));

// Mock react-toastify
vi.mock("react-toastify", () => ({
    toast: {
        success: vi.fn(),
        info: vi.fn(),
    },
    ToastContainer: () => <div data-testid="toast-container" />,
}));

describe("LoginForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders email and password inputs", () => {
        render(<LoginForm />);
        expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    });

    it("updates email and password state on input change", () => {
        render(<LoginForm />);
        const emailInput = screen.getByLabelText(/Email/i);
        const passwordInput = screen.getByLabelText(/Password/i);

        fireEvent.change(emailInput, { target: { value: "user@example.com" } });
        fireEvent.change(passwordInput, { target: { value: "secret" } });

        expect((emailInput as HTMLInputElement).value).toBe("user@example.com");
        expect((passwordInput as HTMLInputElement).value).toBe("secret");
    });

    it("shows loading spinner when submitting", async () => {
        vi.stubGlobal("fetch", vi.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ success: false }),
            })
        ));

        render(<LoginForm />);
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.com" } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pw" } });

        fireEvent.click(screen.getByRole("button", { name: /Log in/i }));
        expect(screen.getByRole("button")).toBeDisabled();
        expect(screen.getByRole("button").querySelector("i")).toBeInTheDocument();

        await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    });

    it("shows error message on failed login", async () => {
        vi.stubGlobal("fetch", vi.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ success: false, error: "Invalid credentials" }),
            })
        ));

        render(<LoginForm />);
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.com" } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pw" } });

        fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

        await waitFor(() =>
            expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument()
        );
    }); 

    it("redirects on successful login", async () => {
        vi.stubGlobal("fetch", vi.fn(() =>
            Promise.resolve({
            json: () => Promise.resolve({ success: true }),
            })
        ));

        // Save original location
        const originalLocation = window.location;
        // Mock location object
        Object.defineProperty(window, "location", {
            value: { ...originalLocation, href: "" },
            writable: true,
        });

        render(<LoginForm />);
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.com" } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pw" } });

        fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

        await waitFor(() =>
            expect(window.location.href).toBe("/app")
        );

        // Restore original location after test
        Object.defineProperty(window, "location", {
            value: originalLocation,
            writable: true,
        });
    });

    it("shows default error on fetch failure", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network error"))));
        render(<LoginForm />);
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.com" } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pw" } });

        fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

        await waitFor(() =>
            expect(screen.getByText(/An error occurred/i)).toBeInTheDocument()
        );
    });

    it("renders links for register and forgot password", () => {
        render(<LoginForm />);
        expect(screen.getByText(/Register/i).closest("a")).toHaveAttribute("href", "/register");
        expect(screen.getByText(/Forgot password/i).closest("a")).toHaveAttribute("href", "/forgot-password");
    });

    it("renders ToastContainer", () => {
        render(<LoginForm />);
        expect(screen.getByTestId("toast-container")).toBeInTheDocument();
    });
});