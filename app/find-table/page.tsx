import type {Metadata} from 'next';
import FindTable from './FindTable';
import './find-table.css';
export const metadata:Metadata={title:`איפה יושבים? | ${eventHosts}`,description:`מוצאים את השולחן שלכם בחתונה של ${eventHosts}`,robots:{index:false,follow:false}};
export default function Page(){return <FindTable/>;}
import { eventHosts } from '@/lib/event-config';
