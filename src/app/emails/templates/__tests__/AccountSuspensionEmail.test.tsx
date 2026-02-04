import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccountSuspensionEmail from '../AccountSuspensionEmail';

describe('AccountSuspensionEmail', () => {
  describe('suspended action', () => {
    it('renders suspension heading', () => {
      const { container } = render(
        <AccountSuspensionEmail name="John Doe" action="suspended" />
      );
      expect(container.textContent).toContain('Your account has been suspended');
    });

    it('addresses user by name', () => {
      const { container } = render(
        <AccountSuspensionEmail name="Alice" action="suspended" />
      );
      expect(container.textContent).toContain('Hi Alice');
    });

    it('explains suspension consequences', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="suspended" />
      );
      expect(container.textContent).toContain('suspended by a moderator');
      expect(container.textContent).toContain('not be able to post new content');
      expect(container.textContent).toContain('comment, or vote');
    });

    it('shows reason when provided', () => {
      const { container } = render(
        <AccountSuspensionEmail 
          name="User" 
          action="suspended" 
          reason="Violation of community guidelines" 
        />
      );
      expect(container.textContent).toContain('Reason:');
      expect(container.textContent).toContain('Violation of community guidelines');
    });

    it('does not show reason section when not provided', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="suspended" />
      );
      expect(container.textContent).not.toContain('Reason:');
    });

    it('mentions support contact option', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="suspended" />
      );
      expect(container.textContent).toContain('contact our support team');
    });
  });

  describe('unsuspended action', () => {
    it('renders reinstatement heading', () => {
      const { container } = render(
        <AccountSuspensionEmail name="John Doe" action="unsuspended" />
      );
      expect(container.textContent).toContain('Your account has been reinstated');
    });

    it('addresses user by name', () => {
      const { container } = render(
        <AccountSuspensionEmail name="Bob" action="unsuspended" />
      );
      expect(container.textContent).toContain('Hi Bob');
    });

    it('conveys positive message', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="unsuspended" />
      );
      expect(container.textContent).toContain('Good news');
      expect(container.textContent).toContain('reinstated');
    });

    it('explains restored capabilities', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="unsuspended" />
      );
      expect(container.textContent).toContain('post, comment, and vote again');
    });

    it('thanks user for participation', () => {
      const { container } = render(
        <AccountSuspensionEmail name="User" action="unsuspended" />
      );
      expect(container.textContent).toContain('appreciate your continued participation');
    });
  });
});
