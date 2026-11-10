import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { isAdminEmail } from '@/lib/admin-auth';
import Reconcile from './Reconcile';
export const dynamic='force-dynamic';
export default async function Page(){const user=await requireChatGPTUser('/admin/reconcile');if(!isAdminEmail(user.email))return <main>אין הרשאת מנהל</main>;return <Reconcile/>;}
