import Image from "next/image";
import { lusitana } from "@/app/components/ui/fonts";
import { dbConnect } from "@/app/lib/mongoose";
import Entry from "@/app/models/entry";

// Define a local type to avoid shadowing the Mongoose model
interface EntryData {
  userId: string;
  title: string;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Async server component
export default async function Page() {
  await dbConnect();

  const entries: EntryData[] = await Entry.find().sort({ createdAt: -1 }).lean();

  return (
    <main>
      <h1 className={`${lusitana.className} mb-4 text-xl md:text-4xl`}>
        Joemon's Dashboard
      </h1>

      <div className="flex items-center justify-center md:w-3/5 md:px-28 md:py-12 gap-12">
        {/* Left side: image */}

        <div className="rounded-full border-8 border-blue-500 overflow-hidden">
          <Image
            src="/joemon.jpg"
            width={1000}
            height={760}
             sizes="(max-width: 768px) 100vw, 50vw"
             className="rounded-lg shadow-lg w-full max-w-md md:max-w-full"
             alt="Screenshots of the dashboard project showing desktop version"
           />
          <h3 className={`${lusitana.className} mb-4 text-xl md:text-4xl`}>
            Latest Entries
          </h3>

          <ul className="space-y-4">
            {entries.map((entry: EntryData) => (
              <li key={entry.userId} className="rounded-lg border p-4 shadow max-w-xl">
                <h3 className="font-semibold">{entry.userId}</h3>
                <h4 className="font-semibold">{entry.title}</h4>
                <p className="text-gray-600">{entry.description}</p>
                <small className="text-gray-400">
                  {entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString()
                    : "No date available"}
                </small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
