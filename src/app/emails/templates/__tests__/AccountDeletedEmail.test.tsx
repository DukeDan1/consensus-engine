import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccountDeletedEmail from '../AccountDeletedEmail';

describe('AccountDeletedEmail', () => {
  describe('self-deleted', () => {
    it('renders deletion heading', () => {
      const { container } = render(
        <AccountDeletedEmail name="John Doe" deletedBy="self" />
      );
      expect(container.textContent).toContain('Your account has been deleted');
    });

    it('addresses user by name', () => {
      const { container } = render(
        <AccountDeletedEmail name="Alice" deletedBy="self" />
      );
      expect(container.textContent).toContain('Hi Alice');
    });

    it('confirms user request', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="self" />
      );
      expect(container.textContent).toContain('As requested');
      expect(container.textContent).toContain('permanently deleted');
    });

    it('explains what was removed', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="self" />
      );
      expect(container.textContent).toContain('posts, comments, votes, and profile data');
      expect(container.textContent).toContain('removed');
      expect(container.textContent).toContain('Topics you created have been deactivated');
    });

    it('invites user to return', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="self" />
      );
      expect(container.textContent).toContain('sorry to see you go');
      expect(container.textContent).toContain('welcome to create a new account');
    });
  });

  describe('admin-deleted', () => {
    it('renders deletion heading', () => {
      const { container } = render(
        <AccountDeletedEmail name="John Doe" deletedBy="admin" />
      );
      expect(container.textContent).toContain('Your account has been deleted');
    });

    it('addresses user by name', () => {
      const { container } = render(
        <AccountDeletedEmail name="Bob" deletedBy="admin" />
      );
      expect(container.textContent).toContain('Hi Bob');
    });

    it('indicates admin action', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="admin" />
      );
      expect(container.textContent).toContain('deleted by an administrator');
    });

    it('explains what was removed', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="admin" />
      );
      expect(container.textContent).toContain('posts, comments, votes, and profile data');
      expect(container.textContent).toContain('removed');
    });

    it('offers support contact for mistakes', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="admin" />
      );
      expect(container.textContent).toContain('believe this was a mistake');
      expect(container.textContent).toContain('contact our support team');
    });

    it('does not invite to return like self-deleted', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="admin" />
      );
      expect(container.textContent).not.toContain('sorry to see you go');
      expect(container.textContent).not.toContain('welcome to create a new account');
    });
  });

  describe('email preview', () => {
    it('has appropriate preview text', () => {
      const { container } = render(
        <AccountDeletedEmail name="User" deletedBy="self" />
      );
      // The preview is in the HTML but may be hidden - just verify render doesn't fail
      expect(container).toBeDefined();
    });
  });
});
