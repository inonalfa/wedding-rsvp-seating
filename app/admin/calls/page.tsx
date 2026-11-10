import Link from 'next/link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { isAdminEmail } from '@/lib/admin-auth';
import CallManager from './CallManager';
export const dynamic='force-dynamic';
export default async function CallsPage() {
  const user=await requireChatGPTUser('/admin/calls');
  if(!isAdminEmail(user.email))return <main className="admin-access-page"><section className="admin-access-card"><h1>אין הרשאת מנהל</h1><Link href="/">חזרה להזמנה</Link></section></main>;
  return <CallManager admin />;
}
