import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export type AuthContext = {
  userId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

type Handler = (
  req: NextRequest,
  ctx: AuthContext,
  params?: any,
) => Promise<NextResponse>;

/**
 * withAuth — resolves the better-auth session from the request cookies and
 * passes the authenticated user to the handler. Returns 401 if no session.
 */
export function withAuth(handler: Handler) {
  return async (req: NextRequest, ctx?: any) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const authCtx: AuthContext = {
      userId: session.user.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    };
    return handler(req, authCtx, ctx);
  };
}
