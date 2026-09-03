import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/", env().NEXT_PUBLIC_APP_URL), {
    status: 303, // 303 para o browser trocar o POST por um GET no redirect.
  });
}
