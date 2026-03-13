import { redirect } from "next/navigation";
import { getHomePathForRole, getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(getHomePathForRole(session.role));
}
