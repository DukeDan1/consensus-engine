'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AcmeLogo from "@/app/components/ui/acme-logo";
import LogoutButton from '../LogoutButton';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <header className="flex justify-between items-center text-black p-4 bg-orange-700 relative">

      { /* Left spacer */}
      <div className="w-1/3">
      <AcmeLogo/>
      </div>


      {/* Centered title */}
      <div className="w-1/3 flex justify-center">
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      {/* Right controls */}
      {session ? (
        <div className="w-1/3 flex justify-end relative">
          <button
            onClick={toggleDropdown}
            className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold"
          >
            {userInitials}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg z-10">
              <button
                onClick={() => router.push('/profile')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                Profile
              </button>
              <LogoutButton />
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => router.push('/login')}
          className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
        >
          Log In
        </button>
      )}
    </header>
  );
}
