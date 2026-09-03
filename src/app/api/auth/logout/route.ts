import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/", appUrl()), {
    status: 303, // 303 para o browser trocar o POST por um GET no redirect.
  });
}
