import CallManager from '@/app/admin/calls/CallManager';
import type { Metadata } from 'next';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:`רשימת שיחות - ${eventHosts}`,robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function CallerPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  return <CallManager token={token} />;
}
import { eventHosts } from '@/lib/event-config';
