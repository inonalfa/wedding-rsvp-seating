import Link from 'next/link';
import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { isAdminEmail } from '@/lib/admin-auth';
import SketchPlanner from './SketchPlanner';
import '../seating.css';
import './sketch.css';
export const dynamic = 'force-dynamic';
export default async function SketchPage() {
  const user = await requireChatGPTUser('/admin/seating/sketch');
  if (!isAdminEmail(user.email)) return <main className="admin-access-page"><section className="admin-access-card"><h1>אין הרשאת מנהל</h1><p>עמוד הסקיצה זמין רק למנהלי החתונה.</p><a href={chatGPTSignOutPath('/admin/seating/sketch')}>התחברות עם חשבון אחר</a><Link href="/">חזרה להזמנה</Link></section></main>;
  return <SketchPlanner />;
}
