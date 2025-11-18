import { NextRequest, NextResponse } from "next/server";
import { getOntologyCategories } from "@/app/services/ontologyClassificationService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") || "100", 10) || 100));
  const idsParam = searchParams.getAll("id");

  const categories = await getOntologyCategories();
  let filtered = categories;

  if (idsParam.length) {
    const idSet = new Set(idsParam.map((id) => id.trim()).filter(Boolean));
    filtered = categories.filter((cat) => idSet.has(cat.id));
  } else if (q) {
    filtered = categories.filter((cat) => {
      const haystack = `${cat.label} ${cat.description || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  return NextResponse.json({
    categories: filtered.slice(0, limit).map((cat) => ({
      id: cat.id,
      label: cat.label,
      description: cat.description,
    })),
  });
}
