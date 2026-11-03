import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, intParam } from "@/lib/api/helpers";
import { listPipelineContacts } from "@/lib/db/contacts";
import type { ContactStage } from "@/types/db";
import type { PipelineActivityFilter, PipelineOwnerFilter } from "@/lib/pipeline";

const STAGES: ContactStage[] = ["new", "contacted", "replied", "negotiating", "customer", "lost"];

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const params = request.nextUrl.searchParams;
    const pages: Partial<Record<ContactStage, number>> = {};
    for (const stage of STAGES) {
      if (params.has(stage)) pages[stage] = intParam(params, stage, 1);
    }
    const result = await listPipelineContacts({
      query: params.get("query") ?? undefined,
      owner: (params.get("owner") ?? "all") as PipelineOwnerFilter,
      activity: (params.get("activity") ?? "all") as PipelineActivityFilter,
      pageSize: intParam(params, "pageSize", 40),
      pages,
    });
    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}
