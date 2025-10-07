import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import mongoose from 'mongoose';

const EntrySchema = new mongoose.Schema({
  userId: String,
  title: String,
  description: String,
}, { timestamps: true });

const Entry = mongoose.models.Entry || mongoose.model('Entry', EntrySchema);

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { userId, title, description } = await req.json();

    if (!userId || !title || !description) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const newEntry = new Entry({ userId, title, description });
    await newEntry.save();

    return NextResponse.json({ message: 'Entry created successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error creating entry:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
