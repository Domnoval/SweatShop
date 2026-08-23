// @ts-nocheck
/* Imperative SVG glyph drawing registry + seeded-seal generator.
   Ported verbatim from the verified standalone codex. Each fn takes an SVGElement
   and appends geometry. Run client-side only (see Glyph.tsx useEffect). */
const NS="http://www.w3.org/2000/svg", TAU=Math.PI*2, R3=Math.sqrt(3), K="currentColor";
const S=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
function add(p,t,a){const e=S(t,a);p.appendChild(e);return e;}
function ngon(cx,cy,r,n,rot,step){const p=[];step=step||1;rot=rot||0;for(let i=0;i<n;i++){const a=rot-Math.PI/2+((i*step)%n)*TAU/n;p.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return p;}
function pth(pts,close){return pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ")+(close?"Z":"");}
function P(svg,d,w,fill,op){add(svg,"path",{d,fill:fill||"none",stroke:K,"stroke-width":w||1.4,"stroke-linejoin":"round","stroke-linecap":"round",opacity:op==null?1:op});}
function ring(svg,cx,cy,r,w,op){add(svg,"circle",{cx,cy,r,fill:"none",stroke:K,"stroke-width":w||1.4,opacity:op==null?1:op});}
function dot(svg,cx,cy,r){add(svg,"circle",{cx,cy,r,fill:K});}
function line(svg,x1,y1,x2,y2,w,op){add(svg,"line",{x1,y1,x2,y2,stroke:K,"stroke-width":w||1.4,"stroke-linecap":"round",opacity:op==null?1:op});}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rngOf(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function seedSeal(svg,name,style){
  const r=rngOf(hash(name+style)), c=50;
  ring(svg,c,c,40,1.3,.9);
  if(style!=="goe"){ring(svg,c,c,40,.6,.45);ring(svg,c,c,34,.6,.4);}
  const k=4+Math.floor(r()*5), baseR=style==="goe"?38:34, ang=[];
  for(let i=0;i<k;i++)ang.push(r()*TAU); ang.sort((a,b)=>a-b);
  const pts=ang.map(a=>[c+Math.cos(a)*baseR*(.6+r()*.4),c+Math.sin(a)*baseR*(.6+r()*.4)]);
  let cur=[c+(r()-.5)*10,c+(r()-.5)*10];
  pts.forEach(p=>{
    if(style==="goe"&&r()<.5){const mid=[c+(r()-.5)*40,c+(r()-.5)*40];P(svg,pth([cur,mid,p]),1.4,"none",.95);}
    else P(svg,pth([cur,p]),1.4,"none",.95);
    const cap=Math.floor(r()*4);
    if(cap===0)ring(svg,p[0],p[1],3,1.2);
    else if(cap===1)dot(svg,p[0],p[1],1.8);
    else if(cap===2){const a=Math.atan2(p[1]-cur[1],p[0]-cur[0])+Math.PI/2;line(svg,p[0]+Math.cos(a)*4,p[1]+Math.sin(a)*4,p[0]-Math.cos(a)*4,p[1]-Math.sin(a)*4,1.2);}
    else{const a=Math.atan2(p[1]-cur[1],p[0]-cur[0]);line(svg,p[0],p[1],p[0]+Math.cos(a+.4)*5,p[1]+Math.sin(a+.4)*5,1.1);line(svg,p[0],p[1],p[0]+Math.cos(a-.4)*5,p[1]+Math.sin(a-.4)*5,1.1);}
    if(r()<.6)cur=p;
  });
  for(let i=0;i<2+Math.floor(r()*2);i++){const a=pts[Math.floor(r()*pts.length)],b=pts[Math.floor(r()*pts.length)];P(svg,pth([a,b]),.8,"none",.55);}
  const m=Math.floor(r()*3);
  if(m===0)ring(svg,c,c,3.5,1.2);
  else if(m===1)P(svg,pth(ngon(c,c,5,3),true),1.1,"none",.9);
  else{line(svg,c-4,c,c+4,c,1.1);line(svg,c,c-4,c,c+4,1.1);}
}
const D={
vesica(s){const r=30,c=50;ring(s,c-15,c,r,1.4,.85);ring(s,c+15,c,r,1.4,.85);const h=r*R3/2;P(s,"M"+c+" "+(c-h)+" A "+r+" "+r+" 0 0 1 "+c+" "+(c+h)+" A "+r+" "+r+" 0 0 1 "+c+" "+(c-h)+"Z",1.4,"rgba(94,242,196,.10)");},
seed(s){const r=17,c=50;ring(s,c,c,r,1.3,.9);for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6;ring(s,c+Math.cos(a)*r,c+Math.sin(a)*r,r,1.3,.9);}},
flower(s){const r=11,c=50,R=2*r,lim=R*1.04;for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){const x=i*r+j*r/2,y=j*r*R3/2,d=Math.hypot(x,y);if(d>lim)continue;if(d+r<=R+1e-9){ring(s,c+x,c+y,r,1,.85);continue;}if(d>=r+R)continue;const a=(d*d+r*r-R*R)/(2*d),h=Math.sqrt(Math.max(0,r*r-a*a));const ux=-x/d,uy=-y/d,mx=c+x+a*ux,my=c+y+a*uy;const p1=[mx-h*uy,my+h*ux],p2=[mx+h*uy,my-h*ux];const ang=(px,py)=>Math.atan2(py-(c+y),px-(c+x));const nrm=(v)=>((v%(2*Math.PI))+2*Math.PI)%(2*Math.PI);const a1=ang(p1[0],p1[1]),a2=ang(p2[0],p2[1]),am=Math.atan2(uy,ux);const ccw=nrm(a2-a1),toNear=nrm(am-a1);const dir=toNear<=ccw?1:0,span=dir?ccw:2*Math.PI-ccw;const large=span>Math.PI?1:0;P(s,"M"+p1[0].toFixed(2)+" "+p1[1].toFixed(2)+" A "+r+" "+r+" 0 "+large+" "+dir+" "+p2[0].toFixed(2)+" "+p2[1].toFixed(2),1,"none",.85);}ring(s,c,c,R,1.4,1);},
fruit(s){const r=8,c=50;ring(s,c,c,r,1.2,.9);for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6;ring(s,c+Math.cos(a)*2*r,c+Math.sin(a)*2*r,r,1.2,.85);}for(let i=0;i<6;i++){const a=-Math.PI/2+(i+0.5)*TAU/6;ring(s,c+Math.cos(a)*2*r*R3,c+Math.sin(a)*2*r*R3,r,1.2,.85);}},
metatron(s){const c=50,st=13,N=[[c,c]];for(let rg=1;rg<=2;rg++)for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6;N.push([c+Math.cos(a)*st*rg,c+Math.sin(a)*st*rg]);}for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++)line(s,N[i][0],N[i][1],N[j][0],N[j][1],.4,.5);N.forEach(n=>{ring(s,n[0],n[1],st/2,.7,.5);dot(s,n[0],n[1],1.3);});},
merkaba(s){const c=50,r=36;P(s,pth(ngon(c,c,r,3,0),true),1.5,"none",.95);P(s,pth(ngon(c,c,r,3,Math.PI),true),1.5,"none",.95);ring(s,c,c,r,.5,.3);},
sriyantra(s){const c=50;/* [apexY, baseY, halfWidth] — four upward, five downward, as the figure requires */const up=[[20.5,75.5,26],[25.5,66.5,20],[31.5,56.5,15],[37.5,49.5,10]];const dn=[[79.5,24.5,27],[70.5,30.5,21],[61.5,37.5,15.5],[53.5,43.5,10.5],[47.5,45.5,6]];const tri=(ay,by,hw)=>[[c,ay],[c-hw,by],[c+hw,by]];up.concat(dn).forEach(t=>P(s,pth(tri(t[0],t[1],t[2]),true),.8,"none",.85));dot(s,c,c,1.6);[32,38].forEach((rr,k)=>{const n=k?16:8;for(let i=0;i<n;i++){const a=i*TAU/n+(k?TAU/32:0);dot(s,c+Math.cos(a)*rr,c+Math.sin(a)*rr,.9);}});add(s,"rect",{x:6,y:6,width:88,height:88,fill:"none",stroke:K,"stroke-width":.6,opacity:.4});},
tree(s){const N={k:[50,8],c:[72,22],b:[28,22],h:[72,42],g:[28,42],t:[50,52],n:[72,70],ho:[28,70],y:[50,80],m:[50,94]};const E=[["k","c"],["k","b"],["k","t"],["c","b"],["c","h"],["c","t"],["b","g"],["b","t"],["h","g"],["h","t"],["h","n"],["g","t"],["g","ho"],["t","n"],["t","ho"],["t","y"],["n","ho"],["n","y"],["ho","y"],["y","m"],["c","g"],["b","h"]];E.forEach(e=>line(s,N[e[0]][0],N[e[0]][1],N[e[1]][0],N[e[1]][1],.7,.55));Object.values(N).forEach(p=>add(s,"circle",{cx:p[0],cy:p[1],r:5,fill:"var(--ink)",stroke:K,"stroke-width":1.1}));},
borromean(s){const c=50,r=20,o=11;[[c,c-o],[c-o*.87,c+o*.5],[c+o*.87,c+o*.5]].forEach(p=>ring(s,p[0],p[1],r,1.4,.9));},
goldenspiral(s){let b=.306,d="",c=50;const tMax=Math.log(45/2.4)/b;for(let t=0;t<tMax;t+=.12){const rr=2.4*Math.exp(b*t),x=c+rr*Math.cos(t),y=c+rr*Math.sin(t);d+=(d?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);}P(s,d,1.4,"none",.95);},
loshu(s){const g=[[4,9,2],[3,5,7],[8,1,6]],c=50,cell=18,o=c-cell*1.5;for(let i=0;i<=3;i++){line(s,o,o+cell*i,o+cell*3,o+cell*i,.6,.45);line(s,o+cell*i,o,o+cell*i,o+cell*3,.6,.45);}for(let r=0;r<3;r++)for(let col=0;col<3;col++){const t=add(s,"text",{x:o+cell*(col+.5),y:o+cell*(r+.5)+3.5,"text-anchor":"middle","font-size":9,fill:K,"font-family":"var(--mono)"});t.textContent=g[r][col];}},
pentagram(s){const c=50;ring(s,c,c,40,1,.5);P(s,pth(ngon(c,c,38,5,0,2),true),1.5,"none",.95);},
hexagram(s){const c=50;P(s,pth(ngon(c,c,38,3,0),true),1.5,"none",.95);P(s,pth(ngon(c,c,38,3,Math.PI),true),1.5,"none",.95);},
unicursalhex(s){const c=50;P(s,pth(ngon(c,c,40,3,0),true),1.4,"none",.9);P(s,pth(ngon(c,c,40,3,Math.PI),true),1.4,"none",.9);ring(s,c,c,5,1.2);dot(s,c,c,1.4);},
sigillumdei(s){const c=50,R=40;ring(s,c,c,R,1.2,.95);ring(s,c,c,R-5,.7,.6);for(let i=0;i<28;i++){const a=i*TAU/28;dot(s,c+Math.cos(a)*(R-2.5),c+Math.sin(a)*(R-2.5),.7);}P(s,pth(ngon(c,c,R-9,7,0,1),true),.9,"none",.85);P(s,pth(ngon(c,c,R-9,7,0,2),true),.9,"none",.9);P(s,pth(ngon(c,c,14,5,0,2),true),.9,"none",.9);},
monas(s){const c=50;P(s,"M38 30 A 12 12 0 0 0 62 30",1.5);ring(s,c,46,9,1.5);dot(s,c,46,1.6);line(s,c,55,c,78,1.5);line(s,c-7,66,c+7,66,1.5);P(s,"M40 86 A 6 6 0 0 1 50 76 A 6 6 0 0 1 60 86",1.5);},
squaredcircle(s){const c=50;ring(s,c,c,38,1.2,.6);P(s,pth(ngon(c,c,40,3,0),true),1.2,"none",.8);add(s,"rect",{x:c-22,y:c-22,width:44,height:44,fill:"none",stroke:K,"stroke-width":1.2,opacity:.85});ring(s,c,c,22,1.4,1);},
eyeprov(s){const c=50;P(s,pth(ngon(c,52,40,3,0),true),1.4,"none",.9);for(let i=0;i<12;i++){const a=i*TAU/12;line(s,c+Math.cos(a)*30,52+Math.sin(a)*26,c+Math.cos(a)*38,52+Math.sin(a)*34,.6,.4);}P(s,"M36 52 Q50 42 64 52 Q50 62 36 52Z",1.3,"none",.95);dot(s,c,52,4);},
rosecross(s){const c=50;line(s,c,16,c,84,1.5);line(s,20,c,80,c,1.5);[[c,16],[c,84],[20,c],[80,c]].forEach(p=>add(s,"rect",{x:p[0]-5,y:p[1]-5,width:10,height:10,fill:"none",stroke:K,"stroke-width":1}));for(let i=0;i<3;i++)ring(s,c,c,6+i*4,1,.9-i*.2);for(let i=0;i<12;i++){const a=i*TAU/12;P(s,"M"+c+" "+c+" Q "+(c+Math.cos(a)*8)+" "+(c+Math.sin(a)*8)+" "+(c+Math.cos(a)*14)+" "+(c+Math.sin(a)*14),.7,"none",.6);}},
triquetra(s){const c=50,r=18,o=10,cs=[[c,c-o],[c-o*.87,c+o*.5],[c+o*.87,c+o*.5]];cs.forEach((p,i)=>{const a0=i*TAU/3-Math.PI/2,arc=[];for(let t=-1.05;t<=1.05;t+=.1)arc.push([p[0]+Math.cos(a0+t+Math.PI)*r,p[1]+Math.sin(a0+t+Math.PI)*r]);P(s,pth(arc),1.5,"none",.95);});ring(s,c,c,30,.6,.4);},
triskele(s){const c=50;for(let i=0;i<3;i++){const a0=i*TAU/3;let d="M"+c+" "+c;for(let t=0;t<3.4;t+=.15){const rr=t*5.5,x=c+rr*Math.cos(a0+t),y=c+rr*Math.sin(a0+t);d+="L"+x.toFixed(1)+" "+y.toFixed(1);}P(s,d,1.6,"none",.95);}},
triplemoon(s){const c=50;ring(s,c,c,15,1.6);P(s,"M30 35 A 16 16 0 0 0 30 65",1.6);P(s,"M70 35 A 16 16 0 0 1 70 65",1.6);},
hecate(s){const c=50;ring(s,c,c,38,1.2,.9);ring(s,c,c,10,1.2);for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2;P(s,"M"+(c+Math.cos(a)*10)+" "+(c+Math.sin(a)*10)+" L "+(c+Math.cos(a)*30)+" "+(c+Math.sin(a)*30),1.4);const a2=a+.5;P(s,"M"+(c+Math.cos(a)*30)+" "+(c+Math.sin(a)*30)+" A 30 30 0 0 1 "+(c+Math.cos(a2)*30)+" "+(c+Math.sin(a2)*30),1.4,"none",.8);}},
hamsa(s){P(s,"M35 86 L35 50 Q35 40 42 40 Q48 40 48 50 M48 50 L48 30 Q48 22 53 22 Q58 22 58 30 L58 52 M58 52 L58 34 Q58 28 63 28 Q68 28 68 36 L68 56 M68 56 Q72 50 76 54 Q78 58 72 66 L66 80 Q60 88 50 88 L42 88 Q36 88 35 82",1.4,"none",.95);P(s,"M44 64 Q50 58 56 64 Q50 70 44 64Z",1.1,"none",.9);dot(s,50,64,1.6);},
ouroboros(s){const c=50,r=30;P(s,"M "+(c+Math.cos(-1)*r)+" "+(c+Math.sin(-1)*r)+" A "+r+" "+r+" 0 1 0 "+(c+Math.cos(-.2)*r)+" "+(c+Math.sin(-.2)*r),3.2,"none",.9);const hx=c+Math.cos(-.2)*r,hy=c+Math.sin(-.2)*r;P(s,"M "+(hx-5)+" "+(hy-6)+" L "+(hx+6)+" "+hy+" L "+(hx-5)+" "+(hy+6)+"Z",1,K,.95);},
valknut(s){const c=50,r=20;[[c,c-12],[c-15,c+10],[c+15,c+10]].forEach(o=>P(s,pth(ngon(o[0],o[1]+6,r,3,0),true),1.4,"none",.92));},
webofwyrd(s){const c=50,pts=[];for(let i=0;i<9;i++){const a=i*TAU/9-Math.PI/2;pts.push([c+Math.cos(a)*36,c+Math.sin(a)*36]);}for(let i=0;i<9;i++)for(let j=i+1;j<9;j++)if((j-i)%3===0||(j-i)===1||(i+j)%4===0)line(s,pts[i][0],pts[i][1],pts[j][0],pts[j][1],.6,.5);},
chaosstar(s){const c=50;for(let i=0;i<8;i++){const a=i*TAU/8,x=c+Math.cos(a)*38,y=c+Math.sin(a)*38;line(s,c,c,x,y,1.4);P(s,"M"+x+" "+y+" L "+(x-Math.cos(a-.5)*8)+" "+(y-Math.sin(a-.5)*8)+" M"+x+" "+y+" L "+(x-Math.cos(a+.5)*8)+" "+(y-Math.sin(a+.5)*8),1.3);}dot(s,c,c,2);},
chaossphere(s){const c=50;ring(s,c,c,34,1.4);for(let i=0;i<8;i++){const a=i*TAU/8;line(s,c,c,c+Math.cos(a)*34,c+Math.sin(a)*34,.9,.7);}ring(s,c,c,18,1,.6);},
vegvisir(s){const c=50;ring(s,c,c,40,.7,.5);for(let i=0;i<8;i++){const a=i*TAU/8,ux=c+Math.cos(a)*36,uy=c+Math.sin(a)*36,v=i%4,px=Math.cos(a),py=Math.sin(a),qx=-py,qy=px;line(s,c,c,ux,uy,1.5);if(v===0){line(s,ux,uy,ux-px*6+qx*6,uy-py*6+qy*6,1.3);line(s,ux,uy,ux-px*6-qx*6,uy-py*6-qy*6,1.3);}else if(v===1){line(s,ux-px*5+qx*7,uy-py*5+qy*7,ux-px*5-qx*7,uy-py*5-qy*7,1.3);}else if(v===2){ring(s,ux,uy,3,1.2);}else{line(s,ux,uy,ux+qx*6,uy+qy*6,1.3);line(s,ux-px*4,uy-py*4,ux-px*4+qx*6,uy-py*4+qy*6,1.3);}}},
aegishjalmur(s){const c=50;for(let i=0;i<8;i++){const a=i*TAU/8,px=Math.cos(a),py=Math.sin(a),qx=-py,qy=px,ex=c+px*38,ey=c+py*38;line(s,c,c,ex,ey,1.5);line(s,ex,ey,ex-px*7+qx*7,ey-py*7+qy*7,1.4);line(s,ex,ey,ex-px*7-qx*7,ey-py*7-qy*7,1.4);for(let m=1;m<=2;m++){const bx=c+px*13*m,by=c+py*13*m;line(s,bx+qx*5,by+qy*5,bx-qx*5,by-qy*5,1.2);}}dot(s,c,c,2);},
veldismagn(s){const c=50;for(let i=0;i<8;i++){const a=i*TAU/8,px=Math.cos(a),py=Math.sin(a),qx=-py,qy=px,ex=c+px*38,ey=c+py*38;line(s,c,c,ex,ey,1.5);const bx=c+px*26,by=c+py*26;line(s,bx+qx*6,by+qy*6,bx-qx*6,by-qy*6,1.3);dot(s,ex,ey,2.4);}},
eyehorus(s){P(s,"M22 46 Q42 30 64 44 Q52 56 38 54 Q26 52 22 46Z",1.4,"none",.95);ring(s,44,46,5,1.4);dot(s,44,46,2);P(s,"M64 44 Q70 46 74 44",1.4);P(s,"M40 54 L36 70",1.4);P(s,"M48 55 Q50 66 60 66",1.4,"none",.9);},
ankh(s){const c=50;ring(s,c,30,12,1.6);line(s,c,42,c,84,1.6);line(s,32,54,68,54,1.6);},
tyet(s){const c=50;ring(s,c,30,10,1.6);line(s,c,40,c,78,1.6);P(s,"M40 44 Q34 58 44 70",1.6,"none",.95);P(s,"M60 44 Q66 58 56 70",1.6,"none",.95);},
akhet(s){const c=50;ring(s,c,46,13,1.6);P(s,"M14 64 L40 64 M60 64 L86 64",1.6);P(s,"M22 64 L22 56 M30 64 L30 50 M70 64 L70 50 M78 64 L78 56",1.4,"none",.85);},
sa(s){P(s,"M38 80 L38 40 Q38 24 50 24 Q62 24 62 40 L62 80",1.6,"none",.95);P(s,"M38 56 Q50 50 62 56",1.5,"none",.9);},
baphomet(s){const c=50;ring(s,c,c,40,1.3);ring(s,c,c,33,.8,.6);P(s,pth(ngon(c,c,31,5,Math.PI,2),true),1.5,"none",.95);const heb=["ל","ת","ן","ו","י"],pts=ngon(c,c,37,5,Math.PI);pts.forEach((p,i)=>{const t=add(s,"text",{x:p[0],y:p[1]+3,"text-anchor":"middle","font-size":7,fill:K,"font-family":"'Noto Sans Hebrew',serif"});t.textContent=heb[i];});},
leviathancross(s){const c=50;line(s,c,18,c,66,1.6);line(s,30,32,70,32,1.6);line(s,34,44,66,44,1.6);ring(s,c-9,74,9,1.6);ring(s,c+9,74,9,1.6);},
lucifersigil(s){P(s,"M30 70 L50 50 L70 70",1.6,"none",.95);line(s,50,50,50,30,1.6);P(s,"M42 30 L58 30",1.6);ring(s,50,22,7,1.5);line(s,40,84,60,84,1.6);P(s,"M50 84 Q44 78 50 72 Q56 78 50 84",1.5,"none",.9);},
adinkrahene(s){const c=50;for(let i=0;i<3;i++)ring(s,c,c,12+i*11,1.8,1);},
gyenyame(s){P(s,"M50 20 Q72 24 72 46 Q72 64 52 64 Q40 64 40 52 Q40 44 48 44 M50 80 Q28 76 28 54 Q28 36 48 36 Q60 36 60 48 Q60 56 52 56",1.7,"none",.95);},
sankofa(s){P(s,"M50 78 Q24 70 30 44 Q34 26 52 26 Q66 26 66 40 Q66 50 56 50 Q50 50 50 44",1.7,"none",.95);P(s,"M50 44 L42 36 M50 44 L58 36",1.5);dot(s,50,68,3);},
dwennimmen(s){P(s,"M30 70 Q30 40 50 40 Q70 40 70 70",1.7,"none",.9);P(s,"M30 70 Q18 70 18 56 Q18 46 28 46",1.6,"none",.9);P(s,"M70 70 Q82 70 82 56 Q82 46 72 46",1.6,"none",.9);},
akoma(s){P(s,"M50 78 C20 56 24 30 42 30 C50 30 50 40 50 44 C50 40 50 30 58 30 C76 30 80 56 50 78Z",1.7,"none",.92);},
eban(s){add(s,"rect",{x:26,y:26,width:48,height:48,rx:6,fill:"none",stroke:K,"stroke-width":1.6});line(s,50,26,50,74,1.6);line(s,26,50,74,50,1.6);add(s,"rect",{x:40,y:40,width:20,height:20,fill:"none",stroke:K,"stroke-width":1.4});},
nkyinkyim(s){P(s,"M26 78 L26 60 L44 60 L44 42 L62 42 L62 24 L74 24",1.7,"none",.95);},
damballa(s){const c=50;line(s,c,16,c,84,1.6);[-1,1].forEach(d=>{P(s,"M50 30 q "+(14*d)+" 6 0 18 q "+(-14*d)+" 12 0 24",1.5,"none",.9);ring(s,50+18*d,26,5,1.2);dot(s,50+18*d,26,2.2);});for(let i=0;i<4;i++)line(s,c-12,30+i*14,c+12,30+i*14,1,.5);ring(s,c,50,6,1.3);},
legba(s){const c=50;line(s,c,16,c,84,1.6);line(s,20,40,80,40,1.6);ring(s,c,c,7,1.4);ring(s,c,c,13,.8,.5);[[20,40],[80,40],[50,16],[50,84]].forEach(p=>dot(s,p[0],p[1],2));},
erzulie(s){P(s,"M50 80 C16 54 22 26 42 26 C50 26 50 38 50 42 C50 38 50 26 58 26 C78 26 84 54 50 80Z",1.6,"none",.92);for(let i=0;i<5;i++){const a=-Math.PI/2+(i-2)*.4;line(s,50,40,50+Math.cos(a)*16,40+Math.sin(a)*16,.9,.6);}line(s,50,80,50,92,1.4);},
baronsamedi(s){line(s,50,20,50,80,1.6);line(s,26,40,74,40,1.6);add(s,"rect",{x:40,y:62,width:20,height:18,fill:"none",stroke:K,"stroke-width":1.4});ring(s,50,30,6,1.3);dot(s,47,29,1);dot(s,53,29,1);[[26,40],[74,40]].forEach(p=>dot(s,p[0],p[1],2));},
abraxas(s){ring(s,50,34,9,1.4);P(s,"M50 28 L50 18 M46 22 L54 22",1.3);line(s,50,43,50,64,1.5);P(s,"M40 50 L34 70 M60 50 L66 70",1.5,"none",.9);P(s,"M34 70 q -4 8 4 10 M66 70 q 4 8 -4 10",1.4,"none",.85);line(s,40,54,60,54,1.4);}
};

export { D as DRAWS, seedSeal };
