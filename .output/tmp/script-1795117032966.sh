function tokens(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);}
function bigrams(s){const t=` ${s} `;const out=[];for(let i=0;i<t.length-1;i++)out.push(t.slice(i,i+2));return out;}
function similarity(a,b){const A=bigrams(a),B=bigrams(b);if(!A.length||!B.length)return 0;let hits=0;for(const g of A){const i=B.indexOf(g);if(i!==-1){hits++;B.splice(i,1);}}return (2*hits)/(A.length+B.length);}
for(const [h,f] of [["Middle Name","site_name"],["Name","site_name"],["Full Name","member_full_name"],["First Name","member_full_name"]]){
 const hSq=h.toLowerCase().replace(/[^a-z0-9]/g,"");
 const hToks=new Set(tokens(h)),fToks=new Set(tokens(f.replace(/_/g," ")));
 const inter=[...hToks].filter(t=>fToks.has(t)).length,union=new Set([...hToks,...fToks]).size;
 console.log(h,"vs",f,"jaccard=",(union?inter/union:0).toFixed(3),"bigram=",similarity(hSq,f.replace(/_/g,"")).toFixed(3));
}
