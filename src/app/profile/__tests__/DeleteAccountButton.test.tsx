import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('next-auth/react', () => ({
  useSession: useSessionMock,
  signOut: signOutMock,
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import DeleteAccountButton from '../DeleteAccountButton';
import { toast } from 'react-toastify';

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteAccountButton', () => {
  it('renders nothing when user is not the owner', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    const { container } = render(<DeleteAccountButton userId="different-user" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders delete button when user is the owner', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    render(<DeleteAccountButton userId="user-1" />);
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
  });

  it('renders nothing when session is null', () => {
    useSessionMock.mockReturnValue({
      data: null,
    });

    const { container } = render(<DeleteAccountButton userId="user-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('opens confirmation modal when delete button is clicked', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    render(<DeleteAccountButton userId="user-1" />);
    
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    
    expect(screen.getByText(/delete your account\?/i)).toBeInTheDocument();
    expect(screen.getByText(/this action is/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent/i)).toBeInTheDocument();
  });

  it('shows warning list in modal', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));

    expect(screen.getByText(/remove all your posts and comments/i)).toBeInTheDocument();
    expect(screen.getByText(/remove all your votes/i)).toBeInTheDocument();
    expect(screen.getByText(/deactivate any topics you created/i)).toBeInTheDocument();
    expect(screen.getByText(/delete any facts derived from your posts/i)).toBeInTheDocument();
    expect(screen.getByText(/remove your profile and all associated data/i)).toBeInTheDocument();
  });

  it('closes modal when cancel is clicked', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    
    expect(screen.getByText(/delete your account\?/i)).toBeInTheDocument();
    
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    
    expect(screen.queryByText(/delete your account\?/i)).not.toBeInTheDocument();
  });

  it('calls delete API and signs out on successful deletion', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as any);

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/user/delete', {
        method: 'DELETE',
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Your account has been deleted.');
    });

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' });
    });
  });

  it('shows error toast on API failure', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Failed to delete account' }),
    } as any);

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete account');
    });

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('shows generic error on network failure', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error');
    });
  });

  it('handles non-JSON error response gracefully', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Test User' } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as any);

    render(<DeleteAccountButton userId="user-1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete account');
    });
  });
});
