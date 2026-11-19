function slugify(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function tokens(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);}
function bigrams(s){const t=` ${s} `;const out=[];for(let i=0;i<t.length-1;i++)out.push(t.slice(i,i+2));return out;}
function similarity(a,b){const A=bigrams(a),B=bigrams(b);if(!A.length||!B.length)return 0;let hits=0;for(const g of A){const i=B.indexOf(g);if(i!==-1){hits++;B.splice(i,1);}}return (2*hits)/(A.length+B.length);}
const TH=0.6;
function suggestDecision(header,knownFields=[]){
 const h=String(header||"").trim();const hSq=h.toLowerCase().replace(/[^a-z0-9]/g,"");const hToks=new Set(tokens(h));
 let best=null,bestScore=0;
 for(const f of knownFields){if(!f)continue;let score=0;
  if(f.toLowerCase()===h.toLowerCase()||f===hSq||f===slugify(h))score=1;
  else{const fToks=new Set(tokens(f.replace(/_/g," ")));const inter=[...hToks].filter((t)=>fToks.has(t)).length;const union=new Set([...hToks,...fToks]).size;score=Math.max(union?inter/union:0,similarity(hSq,f.replace(/_/g,"")));}
  if(score>bestScore){bestScore=score;best=f;}}
 if(best&&bestScore>=TH)return {action:"map",field:best};
 return {action:"new",field:slugify(h)||"custom_field"};
}
const fields=["member_full_name","site_name","funding_source"];
for(const h of ["First Name","Last Name","Middle Name","Member Full Name","member_full_name","Site Name","Full Name","Name"])
 console.log(h,"→",suggestDecision(h,fields));
