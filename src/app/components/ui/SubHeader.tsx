// src/components/SubHeader.tsx

import Link from 'next/link';

export default function SubHeader() {
  return (
    <div className="bg-orange-500 px-4 py-1 border-b border-gray-300">
      <nav className="flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="text-blue-600ut"> Home </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-blue-600ut"> Dashboard</Link>
        </div>
      </nav>
    </div>
  );
}
