import {ensureRsvpSchema,getD1Binding} from '@/db';
import {validateSketch,upgradeSketch,syncSketchTableLabels,withoutTextItems} from '@/lib/seating-sketch';
import {validatePlan} from '@/lib/seating-model';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(){
 try{
  await ensureRsvpSchema();const db=getD1Binding();
  const [row,planRow]=await Promise.all([
   db.prepare('SELECT document, updated_at FROM seating_sketches WHERE id = 1').first<{document:string;updated_at:string}>(),
   db.prepare('SELECT document FROM seating_plans WHERE id = 1').first<{document:string}>()
  ]);
  if(!row)return Response.json({error:'עדיין לא נשמרה סקיצת אולם.'},{status:404,headers});
  const sketch=withoutTextItems(JSON.parse(row.document)),plan=planRow?JSON.parse(planRow.document):{tables:[]};
  if(!validateSketch(sketch)||!validatePlan(plan))throw new Error('Invalid layout');
  const synced=syncSketchTableLabels(upgradeSketch(sketch),plan.tables);
  return Response.json({sketch:{...synced,items:synced.items.map(item=>{const publicItem={...item};delete publicItem.seatingTableId;return publicItem;})},updatedAt:row.updated_at},{headers});
 }catch{return Response.json({error:'לא הצלחנו לטעון את הסקיצה. נסו שוב.'},{status:503,headers});}
}
