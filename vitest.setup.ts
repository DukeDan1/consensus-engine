import "@testing-library/jest-dom";

vi.mock("next/navigation", () => {
  // Basic mocks used in Client Components
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
  };
});

// If you call `fetch` (server actions), consider MSW:
import { setupServer } from "msw/node";
export const server = setupServer();
// Start/stop only for node-like tests; for JSDOM component tests MSW still works.
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
