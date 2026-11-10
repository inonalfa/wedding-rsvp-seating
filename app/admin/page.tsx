import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { isAdminEmail } from "@/lib/admin-auth";
import { loadAdminData } from "@/lib/admin-data";
import Link from "next/link";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");

  if (!isAdminEmail(user.email)) {
    return (
      <main className="admin-access-page">
        <section className="admin-access-card">
          <span className="admin-lock" aria-hidden="true">●</span>
          <p className="admin-kicker">אזור פרטי</p>
          <h1>אין לחשבון הזה הרשאת מנהל</h1>
          <p>התחברת באמצעות {user.email}, אך החשבון אינו מופיע ברשימת המנהלים של האתר.</p>
          <a className="admin-primary-link" href={chatGPTSignOutPath("/admin")}>התחברות עם חשבון אחר</a>
          <Link className="admin-text-link" href="/">חזרה להזמנה</Link>
        </section>
      </main>
    );
  }

  const data = await loadAdminData();

  return (
    <AdminDashboard
      adminName={user.fullName || user.email}
      adminEmail={user.email}
      initialData={data}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
