'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import LogoutButton from '../LogoutButton';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: session } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleNav = () => setNavOpen((s) => !s);
  const closeNav = () => setNavOpen(false);
  const toggleMenu = () => setMenuOpen((s) => !s);
  const closeMenu = () => setMenuOpen(false);

  const brandHref = session ? '/dashboard' : '/';

  const userInitials = useMemo(() => {
    const name = session?.user?.name || session?.user?.email || '';
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last || first).toUpperCase();
  }, [session?.user?.name, session?.user?.email]);

  return (
    <nav
      className="navbar navbar-expand-md border-bottom"
    >
      <div className="container">
        {/* Brand (left) */}
        <Link href={brandHref} className="navbar-brand fw-semibold text-dark m-0">
          {title}
        </Link>

        {/* Toggler (mobile) */}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          onClick={toggleNav}
          className="navbar-toggler"
          style={{ border: 'none' }}
        >
          <span className="navbar-toggler-icon" />
        </button>

        {/* Right side (no .collapse to avoid CSS conflicts) */}
        <div
          className={`navbar-collapse ${navOpen ? 'd-block' : 'd-none'} d-md-flex`}
          style={{ width: '100%' }}
        >
          <ul className="navbar-nav ms-auto align-items-center gap-1">
            {!session ? (
              <>
                <li className="nav-item">
                  <Link
                    className="btn btn-secondary btn-sm"
                    href="/login"
                    onClick={closeNav}
                  >
                    Log in
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    className="btn btn-outline-secondary btn-sm ms-md-2"
                    href="/register"
                    onClick={closeNav}
                  >
                    Register
                  </Link>
                </li>
              </>
            ) : (
              <li className="nav-item dropdown">
                <button
                  className="btn p-0 border-0"
                  onClick={toggleMenu}
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                >
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt="User avatar"
                      width={40}
                      height={40}
                      className="rounded-circle"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      className="d-flex align-items-center justify-content-center bg-primary text-white rounded-circle"
                      style={{ width: 40, height: 40, fontWeight: 700 }}
                    >
                      {userInitials}
                    </div>
                  )}
                </button>
                <ul
                  className={`dropdown-menu dropdown-menu-end ${menuOpen ? 'show' : ''}`}
                  style={{ marginTop: '0.5rem' }}
                  onMouseLeave={closeMenu}
                >
                  <li>
                    <Link className="dropdown-item" href="/app" onClick={closeMenu}>
                      Home
                    </Link>
                  </li>
                  <li>
                    <Link className="dropdown-item" href="/profile" onClick={closeMenu}>
                      Profile
                    </Link>
                  </li>
                  <li><hr className="dropdown-divider" /></li>
                  <li className="px-3 py-1">
                    <LogoutButton />
                  </li>
                </ul>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
