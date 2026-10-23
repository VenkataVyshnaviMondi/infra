import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Workspace } from "@/components/workspace";
import { Login } from "@/components/login";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const screen = (await params).screen || [];
  const user = await currentUser();
  if (!user) {
    if (screen[0] && screen[0] !== "login") redirect("/login");
    return <Login />;
  }
  if (screen[0] === "login") redirect("/dashboard");
  if (!screen.length) redirect("/dashboard");
  if (screen[0] === "employees" && user.role !== "ADMIN")
    redirect("/dashboard");
  return <Workspace user={user} screen={screen} />;
}
