function slugify(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function tokens(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);}
const TH=0.6;
function suggestDecision(header,knownFields=[]){
 const h=String(header||"").trim();const hSq=h.toLowerCase().replace(/[^a-z0-9]/g,"");const hToks=new Set(tokens(h));
 let best=null,bestScore=0;
 for(const f of knownFields){if(!f)continue;let score=0;
  if(f.toLowerCase()===h.toLowerCase()||f===hSq||f===slugify(h))score=1;
  else{const fToks=new Set(tokens(f.replace(/_/g," ")));const inter=[...hToks].filter((t)=>fToks.has(t)).length;const union=new Set([...hToks,...fToks]).size;score=union?inter/union:0;}
  if(score>bestScore){bestScore=score;best=f;}}
 if(best&&bestScore>=TH)return {action:"map",field:best};
 return {action:"new",field:slugify(h)||"custom_field"};
}
const fields=["member_full_name","site_name","funding_source"];
for(const h of ["First Name","Last Name","Middle Name","Member Full Name","member_full_name","Site Name","Full Name","Name","Funding Source","Header with no overlap at all"])
 console.log(h,"→",suggestDecision(h,fields));
