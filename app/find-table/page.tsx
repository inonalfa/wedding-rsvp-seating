import type {Metadata} from 'next';
import FindTable from './FindTable';
import './find-table.css';
export const metadata:Metadata={title:'איפה יושבים? | דנה ויואב',description:'מוצאים את השולחן שלכם בחתונה של דנה ויואב',robots:{index:false,follow:false}};
export default function Page(){return <FindTable/>;}
