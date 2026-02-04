import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CollapsibleText from '../CollapsibleText';

describe('CollapsibleText', () => {
  it('renders nothing when text is null or undefined', () => {
    const { container: c1 } = render(<CollapsibleText text={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<CollapsibleText text={undefined} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders nothing when text is empty string', () => {
    const { container } = render(<CollapsibleText text="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders full short text without toggle button', () => {
    const shortText = 'Hello, World!';
    render(<CollapsibleText text={shortText} limit={500} />);

    expect(screen.getByText(shortText)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('truncates long text and shows toggle button', () => {
    const longText = 'A'.repeat(600);
    render(<CollapsibleText text={longText} limit={100} />);

    const displayed = screen.getByText(/^A+…$/);
    expect(displayed.textContent).toBe('A'.repeat(100) + '…');
    expect(screen.getByRole('button', { name: /view full text/i })).toBeInTheDocument();
  });

  it('expands and collapses text on toggle', () => {
    const longText = 'B'.repeat(200);
    render(<CollapsibleText text={longText} limit={50} />);

    const button = screen.getByRole('button', { name: /view full text/i });

    // Initially truncated
    expect(screen.getByText(/^B+…$/).textContent).toBe('B'.repeat(50) + '…');

    // Expand
    fireEvent.click(button);
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.getByText(/^B+…$/).textContent).toBe('B'.repeat(50) + '…');
    expect(screen.getByRole('button', { name: /view full text/i })).toBeInTheDocument();
  });

  it('applies custom class names', () => {
    render(
      <CollapsibleText
        text="Test"
        className="wrapper-class"
        textClassName="text-class"
        buttonClassName="btn-class"
        limit={2}
      />
    );

    const wrapper = screen.getByText(/Te…/).closest('div')?.parentElement;
    expect(wrapper).toHaveClass('wrapper-class');
    expect(screen.getByText(/Te…/)).toHaveClass('text-class');
    expect(screen.getByRole('button')).toHaveClass('btn-class');
  });

  it('sets aria attributes correctly', () => {
    render(<CollapsibleText text={'C'.repeat(100)} limit={10} id="collapsible-1" />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'collapsible-1');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses default limit of 500', () => {
    const text = 'D'.repeat(501);
    render(<CollapsibleText text={text} />);

    expect(screen.getByRole('button', { name: /view full text/i })).toBeInTheDocument();
    expect(screen.getByText(/^D+…$/).textContent).toBe('D'.repeat(500) + '…');
  });

  it('shows full text when exactly at limit', () => {
    const text = 'E'.repeat(100);
    render(<CollapsibleText text={text} limit={100} />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('preserves whitespace with pre-wrap style', () => {
    const textWithNewlines = 'Line1\nLine2\nLine3';
    render(<CollapsibleText text={textWithNewlines} />);

    const textElement = screen.getByText(/Line1/);
    expect(textElement).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });
});
