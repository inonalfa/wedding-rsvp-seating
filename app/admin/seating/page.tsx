import Link from 'next/link';
import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { isAdminEmail } from '@/lib/admin-auth';
import SeatingPlanner from './SeatingPlanner';
import './seating.css';
export const dynamic = 'force-dynamic';
export default async function SeatingPage() {
  const user = await requireChatGPTUser('/admin/seating');
  if (!isAdminEmail(user.email)) return <main className="admin-access-page"><section className="admin-access-card"><h1>אין הרשאת מנהל</h1><p>עמוד ההושבה זמין רק למנהלי החתונה.</p><a href={chatGPTSignOutPath('/admin/seating')}>התחברות עם חשבון אחר</a><Link href="/">חזרה להזמנה</Link></section></main>;
  return <SeatingPlanner />;
}
