import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { redirectIfLoggedIn } from '@/app/lib/commonFunctions';

// Simplify Next.js components that expect the app runtime
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

vi.mock('@/app/lib/commonFunctions', () => ({
  redirectIfLoggedIn: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/app/components/LoginForm', () => ({
  __esModule: true,
  default: () => <div data-testid="login-form">Login Form</div>
}));

vi.mock('@/app/components/RegisterForm', () => ({
  __esModule: true,
  default: () => <div data-testid="register-form">Register Form</div>
}));

vi.mock('@/app/components/ForgotPasswordForm', () => ({
  __esModule: true,
  default: () => <div data-testid="forgot-password-form">Forgot Password Form</div>
}));

vi.mock('@/app/components/ResetPasswordForm', () => ({
  __esModule: true,
  default: () => <div data-testid="reset-password-form">Reset Password Form</div>
}));

vi.mock('@/app/components/topics/TopicsBrowser', () => ({
  __esModule: true,
  default: () => <div data-testid="topics-browser">Topics Browser</div>
}));

vi.mock('@/app/components/home/FeaturedTopics', () => ({
  __esModule: true,
  default: () => <div data-testid="featured-topics">Featured Topics</div>
}));

const mockNotFound = vi.fn();
const mockHeaders = vi.fn();

vi.mock('next/navigation', () => ({
  __esModule: true,
  notFound: () => mockNotFound(),
}));

vi.mock('next/headers', () => ({
  __esModule: true,
  headers: () => mockHeaders(),
}));

vi.mock('@/app/components/topics/FactCard', () => ({
  __esModule: true,
  default: ({ fact, topicId }: any) => (
    <div data-testid="fact-card">{fact.text}-{topicId}</div>
  ),
}));

type AsyncPage = () => Promise<JSX.Element> | JSX.Element;

const renderServerPage = async (PageComponent: AsyncPage) => {
  const element = await PageComponent();
  return render(element);
};

describe('App Router pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockReturnValue(new Headers({ cookie: 'session=abc' }));
    mockNotFound.mockReset();
    global.fetch = vi.fn();
  });

  it('renders the home page with hero section, features, and featured topics', async () => {
    const { default: Home } = await import('@/app/page');
    await renderServerPage(Home);

    // Hero section
    expect(screen.getByRole('heading', { name: /welcome to consensus engine/i })).toBeInTheDocument();
    expect(screen.getByText(/join the conversation and discover what people are debating about/i)).toBeInTheDocument();
    
    // Call-to-action buttons
    const registerLinks = screen.getAllByRole('link', { name: /get started/i });
    expect(registerLinks[0]).toHaveAttribute('href', '/register');
    const loginLinks = screen.getAllByRole('link', { name: /log in/i });
    expect(loginLinks[0]).toHaveAttribute('href', '/login');

    // Features section
    expect(screen.getByRole('heading', { name: /engage in debates/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /vote on arguments/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /build consensus/i })).toBeInTheDocument();

    // Featured topics section
    expect(screen.getByRole('heading', { name: /featured debates/i })).toBeInTheDocument();
    expect(screen.getByTestId('featured-topics')).toBeInTheDocument();

    // Final call-to-action
    expect(screen.getByRole('heading', { name: /ready to join/i })).toBeInTheDocument();
    
    expect(redirectIfLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('renders the login page and redirects if already authed', async () => {
    const { default: LoginPage } = await import('@/app/login/page');
    await renderServerPage(LoginPage);

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(redirectIfLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('renders the registration page', async () => {
    const { default: RegisterPage } = await import('@/app/register/page');
    await renderServerPage(RegisterPage);

    expect(screen.getByTestId('register-form')).toBeInTheDocument();
    expect(redirectIfLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('renders the forgot-password page', async () => {
    const { default: ForgotPasswordPage } = await import('@/app/forgot-password/page');
    await renderServerPage(ForgotPasswordPage);

    expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
    expect(redirectIfLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('renders the reset-password page', async () => {
    const { default: ResetPasswordPage } = await import('@/app/reset-password/page');
    await renderServerPage(ResetPasswordPage);

    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(redirectIfLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('renders the topics page shell', async () => {
    const { default: TopicsPage } = await import('@/app/topics/page');
    await renderServerPage(TopicsPage);

    expect(screen.getByRole('heading', { name: /debates/i })).toBeInTheDocument();
    expect(screen.getByTestId('topics-browser')).toBeInTheDocument();
  });

  it('renders the topic facts page with data', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ topicId: 't1', facts: [{ id: 'f1', text: 'Fact body', sourceArgument: 'a1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ topic: { id: 't1', title: 'Topic title' } }) });

    const { default: TopicFactsPage } = await import('@/app/topics/[id]/facts/page');
    await renderServerPage(() => TopicFactsPage({ params: { id: 't1' } } as any));

    expect(screen.getByRole('heading', { name: /factual highlights: topic title/i })).toBeInTheDocument();
    expect(screen.getByTestId('fact-card')).toHaveTextContent('Fact body-t1');
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('returns notFound when facts or meta missing', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, json: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({ ok: false, json: vi.fn().mockResolvedValue({}) });

    const { default: TopicFactsPage } = await import('@/app/topics/[id]/facts/page');
    await renderServerPage(() => TopicFactsPage({ params: { id: 'missing' } } as any));

    expect(mockNotFound).toHaveBeenCalled();
  });
});
