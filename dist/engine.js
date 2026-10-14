/* CTLM Fit Lab numerical engine. Lengths: micrometres. R: ohms. rho: ohm cm². */
(function (root) {
  'use strict';
  function regression(x, y) {
    if (x.length !== y.length || x.length < 3) throw new Error('I–V 피팅에는 유효한 측정점이 3개 이상 필요합니다.');
    const n = x.length, mx = x.reduce((a,b)=>a+b,0)/n, my = y.reduce((a,b)=>a+b,0)/n;
    let xx=0, xy=0, yy=0;
    for(let i=0;i<n;i++){xx+=(x[i]-mx)**2;xy+=(x[i]-mx)*(y[i]-my);yy+=(y[i]-my)**2;}
    if (!(xx>0)) throw new Error('전류 또는 간격 값에 변화가 없어 기울기를 구할 수 없습니다.');
    const slope=xy/xx, intercept=my-slope*mx;
    const predictions=x.map(v=>slope*v+intercept), residuals=y.map((v,i)=>v-predictions[i]);
    const sse=residuals.reduce((a,b)=>a+b*b,0), sigma2=sse/(n-2);
    return {slope,intercept,predictions,residuals,sse,r2:yy>0?1-sse/yy:null,slopeSE:Math.sqrt(sigma2/xx),interceptSE:Math.sqrt(sigma2*(1/n+mx*mx/xx)),covariance:-mx*sigma2/xx,n};
  }
  function ivFit(points, config={}) {
    const currentScale=config.currentScale??1, voltageScale=config.voltageScale??1;
    const maxV=config.maxAbsV, minV=config.minAbsV??0;
    const kept=points.map(p=>({i:p.i*currentScale,v:p.v*voltageScale,row:p.row}))
      .filter(p=>Number.isFinite(p.i)&&Number.isFinite(p.v)&&Math.abs(p.v)>=minV&&(!(maxV>0)||Math.abs(p.v)<=maxV));
    const fit=regression(kept.map(p=>p.i),kept.map(p=>p.v));
    if(!(Math.abs(fit.slope)>0))throw new Error('저항이 0으로 추출되었습니다. 전압 열과 단위를 확인하세요.');
    return {...fit,resistance:Math.abs(fit.slope),resistanceSE:fit.slopeSE,points:kept,polarity:fit.slope<0?-1:1};
  }
  function iRatio(z) {
    if(!(z>0))return NaN;
    if(z>50){
      const asym=nu=>{let term=1,sum=1;for(let k=1;k<=8;k++){term*=-(4*nu*nu-(2*k-1)**2)/(k*8*z);sum+=term;}return sum;};
      return asym(0)/asym(1);
    }
    let t0=1,t1=1,s0=1,s1=1;
    for(let k=1;k<300;k++){t0*=z*z/(4*k*k);t1*=z*z/(4*k*(k+1));s0+=t0;s1+=t1;if(t0<s0*1e-16&&t1<s1*1e-16)break;}
    return s0/(z/2*s1);
  }
  function gaussLegendre(n) {
    const nodes=new Array(n),weights=new Array(n);
    for(let i=0;i<Math.ceil(n/2);i++){
      let z=Math.cos(Math.PI*(i+.75)/(n+.5)),der=0;
      for(let j=0;j<40;j++){
        let p0=1,p1=z;for(let k=2;k<=n;k++){const p=((2*k-1)*z*p1-(k-1)*p0)/k;p0=p1;p1=p;}
        der=n*(z*p1-p0)/(z*z-1);const next=z-p1/der;if(Math.abs(next-z)<1e-15){z=next;break;}z=next;
      }
      const w=2/((1-z*z)*der*der);nodes[i]=-z;nodes[n-1-i]=z;weights[i]=w;weights[n-1-i]=w;
    }
    return {nodes,weights};
  }
  const quad=gaussLegendre(64);
  function kRatio(z) {
    if(!(z>0))return NaN;
    const end=Math.acosh(1+45/z);let k0=0,k1=0;
    for(let j=0;j<quad.nodes.length;j++){
      const t=(quad.nodes[j]+1)*end/2,c=Math.cosh(t),v=Math.exp(-z*(c-1))*quad.weights[j];k0+=v;k1+=v*c;
    }
    return k0/k1;
  }
  function shape(gap,radius,lt) {
    const outer=radius+gap;
    return (Math.log1p(gap/radius)+lt/radius*iRatio(radius/lt)+lt/outer*kRatio(outer/lt))/(2*Math.PI);
  }
  function model(gap,radius,rs,lt){return rs*shape(gap,radius,lt);}
  function rSquared(y,p){const mean=y.reduce((a,b)=>a+b,0)/y.length,yy=y.reduce((a,b)=>a+(b-mean)**2,0);return yy>0?1-y.reduce((a,b,i)=>a+(b-p[i])**2,0)/yy:null;}
  function validate(data,radius) {
    if(!(Number.isFinite(radius)&&radius>0))throw new Error('안쪽 전극 반지름은 0보다 큰 숫자로 입력하세요.');
    if(data.length<3)throw new Error('피팅에 포함할 패턴이 3개 이상 필요합니다.');
    if(data.some(d=>!(d.gap>0)||!Number.isFinite(d.gap)))throw new Error('포함된 모든 패턴의 간격을 0보다 큰 숫자로 입력하세요.');
    if(new Set(data.map(d=>d.gap)).size<3)throw new Error('서로 다른 간격이 3개 이상 필요합니다.');
    if(data.some(d=>!(d.resistance>0)||!Number.isFinite(d.resistance)))throw new Error('측정 저항이 유효하지 않습니다.');
  }
  function exactFit(data,radius,weighted=false) {
    validate(data,radius);
    if(weighted&&data.some(d=>!(d.resistanceSE>0)||!Number.isFinite(d.resistanceSE)))throw new Error('가중 피팅에는 양의 저항 표준오차가 필요합니다. 동일 가중치를 선택하세요.');
    const weights=data.map(d=>weighted?1/d.resistanceSE**2:1),scale=Math.max(...weights),w=weights.map(v=>v/scale);
    const yy=data.map(d=>d.resistance),gaps=data.map(d=>d.gap);
    const profile=logLT=>{
      const lt=Math.exp(logLT),a=gaps.map(g=>shape(g,radius,lt));let numer=0,denom=0;
      a.forEach((v,i)=>{numer+=w[i]*v*yy[i];denom+=w[i]*v*v;});
      const rs=numer/denom,predictions=a.map(v=>v*rs),sse=yy.reduce((sum,v,i)=>sum+w[i]*(v-predictions[i])**2,0);
      return {rs,lt,predictions,sse};
    };
    const lower=Math.log(radius*1e-5),upper=Math.log(radius*100),grid=100;
    let best=0,bestLoss=Infinity;
    for(let j=0;j<=grid;j++){const loss=profile(lower+(upper-lower)*j/grid).sse;if(loss<bestLoss){best=j;bestLoss=loss;}}
    let lo=lower+(upper-lower)*Math.max(0,best-1)/grid,hi=lower+(upper-lower)*Math.min(grid,best+1)/grid;
    const q=(Math.sqrt(5)-1)/2;let c=hi-q*(hi-lo),d=lo+q*(hi-lo),fc=profile(c).sse,fd=profile(d).sse;
    for(let j=0;j<70;j++){if(fc<fd){hi=d;d=c;fd=fc;c=hi-q*(hi-lo);fc=profile(c).sse;}else{lo=c;c=d;fc=fd;d=lo+q*(hi-lo);fd=profile(d).sse;}}
    const ans=profile((lo+hi)/2),rho=ans.rs*(ans.lt*1e-4)**2;
    const jac=gaps.map(g=>[shape(g,radius,ans.lt),ans.rs*(shape(g,radius,ans.lt*1.0001)-shape(g,radius,ans.lt*.9999))/(ans.lt*.0002)]);
    let aa=0,ab=0,bb=0;jac.forEach((v,i)=>{aa+=w[i]*v[0]**2;ab+=w[i]*v[0]*v[1];bb+=w[i]*v[1]**2;});
    const det=aa*bb-ab*ab,sigma2=ans.sse/(data.length-2);
    let covariance=null,rhoSE=null,rsSE=null,ltSE=null;
    if(det>aa*bb*1e-12){
      covariance=[[sigma2*bb/det,-sigma2*ab/det],[-sigma2*ab/det,sigma2*aa/det]];
      const g=[(ans.lt*1e-4)**2,2*ans.rs*ans.lt*1e-8];
      rhoSE=Math.sqrt(Math.max(0,g[0]**2*covariance[0][0]+2*g[0]*g[1]*covariance[0][1]+g[1]**2*covariance[1][1]));
      rsSE=Math.sqrt(covariance[0][0]);ltSE=Math.sqrt(covariance[1][1]);
    }
    return {...ans,rho,rhoSE,rsSE,ltSE,covariance,r2:rSquared(yy,ans.predictions),residuals:yy.map((v,i)=>v-ans.predictions[i]),weighted,boundary:best===0||best===grid,kind:'exact',radius,searchBounds:[radius*1e-5,radius*100]};
  }
  function correctedFit(data,radius) {
    validate(data,radius);
    const gaps=data.map(d=>d.gap),corrections=gaps.map(g=>radius/g*Math.log1p(g/radius)),corrected=data.map((d,i)=>d.resistance/corrections[i]);
    const reg=regression(gaps,corrected),rs=2*Math.PI*radius*reg.slope,lt=reg.intercept/(2*reg.slope);
    if(!(rs>0&&lt>0))return {valid:false,reason:'보정 직선의 기울기 또는 절편이 물리적 조건(Rsh > 0, LT > 0)에 맞지 않습니다.',corrections,corrected,...reg};
    const predictions=reg.predictions.map((v,i)=>v*corrections[i]);
    return {...reg,valid:true,rs,lt,rho:rs*(lt*1e-4)**2,predictions,corrections,corrected,correctedR2:reg.r2,r2:rSquared(data.map(d=>d.resistance),predictions),kind:'corrected',radius};
  }
  function extractSheets(book,utils) {
    const normalize=s=>String(s??'').toLowerCase().replace(/[\s_()\[\]·]/g,'');
    const currentHeader=s=>/^(i\d*(?:a|ma|ua|µa|μa|na)?|current(?:a|ma|ua|µa|μa|na)?|전류a?)$/.test(normalize(s));
    const voltageHeader=s=>/^(v\d*(?:v|mv|uv|µv|μv)?|vprobe(?:v|mv|uv|µv|μv)?|voltage(?:v|mv|uv|µv|μv)?|sensevoltage|전압v?)$/.test(normalize(s));
    const patterns=[],skipped=[];
    for(const name of book.SheetNames){
      const ws=book.Sheets[name];if(!ws['!ref']){skipped.push(name);continue;}
      const extent=utils.decode_range(ws['!ref']);
      if(extent.e.r-extent.s.r>200000||extent.e.c-extent.s.c>300)throw new Error(`${name}: 시트가 너무 큽니다(최대 200,000행·300열). 측정 데이터만 별도 파일로 저장하세요.`);
      const rows=utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
      let headerRow=-1;
      for(let j=0;j<Math.min(35,rows.length);j++)if(rows[j].some(currentHeader)&&rows[j].some(voltageHeader)){headerRow=j;break;}
      if(headerRow<0){skipped.push(name);continue;}
      const headers=rows[headerRow].map((h,j)=>String(h??`Column ${j+1}`));
      const currentColumns=headers.map((h,j)=>({h,j})).filter(v=>currentHeader(v.h));
      const voltageColumns=headers.map((h,j)=>({h,j})).filter(v=>voltageHeader(v.h));
      const named=n=>headers.findIndex(h=>normalize(h)===n||normalize(h)===n+'v');
      const v2=named('v2'),v3=named('v3'),vp=named('vprobe');
      const options=voltageColumns.map(v=>({key:`col:${v.j}`,label:v.h}));
      if(v2>=0&&v3>=0)options.unshift({key:`diff:${v2}:${v3}`,label:'V2 − V3 (센스 전압 차)'});
      const preferred=v2>=0&&v3>=0?`diff:${v2}:${v3}`:vp>=0?`col:${vp}`:`col:${voltageColumns[0].j}`;
      const groupIndex=headers.findIndex(h=>/^(원본시트|시트|sheet|pattern|패턴|series)$/.test(normalize(h)));
      const groups=new Map();
      rows.slice(headerRow+1).forEach((cells,j)=>{const group=groupIndex>=0?String(cells[groupIndex]??name):name;if(!groups.has(group))groups.set(group,[]);groups.get(group).push({cells,row:headerRow+j+2});});
      for(const [group,data] of groups){
        const ci=currentColumns[0].j;
        if(data.filter(r=>numeric(r.cells[ci])!==null).length<3)continue;
        const key=normalize(group),defaults={data:60,append1:40,append2:20,append3:15,append4:10,append5:5};
        const gapMatch=group.match(/(?:gap|\bs)\s*[_=: -]?\s*(\d+(?:\.\d+)?)/i);
        patterns.push({id:`p${patterns.length}`,name:groupIndex>=0?`${name} / ${group}`:name,sourceSheet:name,group,headers,currentColumns,voltageOptions:options,currentColumn:ci,voltageKey:preferred,rows:data,gap:defaults[key]??(gapMatch?Number(gapMatch[1]):null),included:true});
      }
    }
    if(!patterns.length)throw new Error('I1/Current와 VPROBE 또는 V2·V3 열이 있는 측정 시트를 찾지 못했습니다. 첫 35행 안에 열 제목이 있어야 합니다.');
    return {patterns,skipped};
  }
  function numeric(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=typeof v==='number'?v:Number(String(v).replace(/,/g,'').trim());return Number.isFinite(n)?n:null;}
  function pointsFor(pattern){
    const mode=pattern.voltageKey.split(':'),out=[];
    pattern.rows.forEach(r=>{
      const i=numeric(r.cells[pattern.currentColumn]);
      const a=numeric(r.cells[Number(mode[1])]),b=mode[0]==='diff'?numeric(r.cells[Number(mode[2])]):0;
      const v=mode[0]==='diff'?(a!==null&&b!==null?a-b:null):a;
      if(i!==null&&v!==null)out.push({i,v,row:r.row});
    });return out;
  }
  root.CTLM={regression,ivFit,iRatio,kRatio,shape,model,exactFit,correctedFit,extractSheets,pointsFor,numeric,rSquared};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.CTLM;
})(typeof globalThis!=='undefined'?globalThis:this);
