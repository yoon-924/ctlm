(function(){
 'use strict';
 const $=id=>document.getElementById(id), E=window.CTLM;
 const state={patterns:[],file:null,isDemo:false,results:null,fits:new Map(),selected:null,svg:'',loading:0};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(v,d=4)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
 const sci=v=>Number.isFinite(v)?v.toExponential(3):'—';
 const pretty=v=>{if(!(v>0))return '—';const [m,e]=v.toExponential(2).split('e');return `${m} <span class="times">×</span> 10<sup>${Number(e)}</sup>`;};
 function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
 function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=!text;}
 function config(){
   const rawRadius=$('radius').value.trim(),radius=rawRadius===''?NaN:Number(rawRadius),v=$('max-voltage').value.trim();
   if(v!==''&&(!(Number(v)>0)||!Number.isFinite(Number(v))))throw new Error('피팅 구간의 최대 전압은 양수로 입력하거나 빈칸으로 두세요.');
   return {radius,currentScale:Number($('current-unit').value),voltageScale:Number($('voltage-unit').value),maxAbsV:v===''?null:Number(v)*1e-3,weighted:$('weighting').value==='ivse'};
 }
 function renderPatternTable(){
   $('pattern-body').innerHTML=state.patterns.map(p=>`<tr data-id="${p.id}"><td><input type="checkbox" data-control="include" ${p.included?'checked':''} aria-label="${escape(p.name)} 피팅에 포함"></td><td title="${escape(p.name)}">${escape(p.name)}</td><td><input type="number" min="0" step="any" data-control="gap" value="${p.gap??''}" aria-label="${escape(p.name)} 전극 간격 μm" placeholder="입력"></td><td><select data-control="current" aria-label="${escape(p.name)} 전류 열">${p.currentColumns.map(c=>`<option value="${c.j}" ${c.j===p.currentColumn?'selected':''}>${escape(c.h)}</option>`).join('')}</select></td><td><select data-control="voltage" aria-label="${escape(p.name)} 전압 열">${p.voltageOptions.map(c=>`<option value="${escape(c.key)}" ${c.key===p.voltageKey?'selected':''}>${escape(c.label)}</option>`).join('')}</select></td><td data-result="r">—</td><td data-result="r2">—</td><td data-result="n">—</td></tr>`).join('');
   $('iv-select').innerHTML=state.patterns.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('');
   $('iv-select').disabled=false;state.selected=state.patterns[0]?.id??null;$('iv-select').value=state.selected;
 }
 function updatePatternRows(){
   state.patterns.forEach(p=>{
     const tr=$('pattern-body').querySelector(`[data-id="${p.id}"]`),fit=state.fits.get(p.id);if(!tr)return;
     tr.classList.toggle('excluded',!p.included);
     tr.querySelector('[data-control=gap]').setAttribute('aria-invalid',p.included&&!(p.gap>0)?'true':'false');
     tr.querySelector('[data-result=r]').textContent=fit&&!fit.error?num(fit.resistance,6):'—';
     tr.querySelector('[data-result=r2]').textContent=fit&&!fit.error?num(fit.r2,6):'—';
     tr.querySelector('[data-result=n]').textContent=fit&&!fit.error?String(fit.n):'—';
     tr.title=fit?.error??p.name;
   });
 }
 function invalidate(message){
   state.results=null;state.svg='';['rho-value','rs-value','lt-value','exact-r2','pattern-count','radius-ratio'].forEach(id=>$(id).textContent='—');
   $('rho-se').textContent='입력과 포함 패턴을 확인하세요.';$('rs-se').textContent='반도체 층의 횡방향 저항';$('lt-se').textContent='접촉 전류의 길이 척도';
   ['export-btn','json-btn','svg-btn'].forEach(id=>$(id).disabled=true);
   $('result-label').textContent='입력 확인 필요';$('result-label').className='status-label';
   $('ctlm-chart').innerHTML=`<div class="chart-empty">${escape(message)}</div>`;
   $('compare-body').innerHTML='<tr><td>분석 대기</td><td>—</td><td>—</td></tr>';
   $('quality-notes').textContent='유효한 입력으로 피팅하면 결과가 표시됩니다.';notice(message,true);
 }
 function fitAll(){
   if(!state.patterns.length){notice('측정 파일을 불러오거나 예제 데이터를 선택하세요.');return;}
   let cfg;
   try{cfg=config();}catch(error){invalidate(error.message);return;}
   $('radius').setAttribute('aria-invalid',cfg.radius>0?'false':'true');state.fits.clear();
   state.patterns.forEach(p=>{try{state.fits.set(p.id,E.ivFit(E.pointsFor(p),cfg));}catch(error){state.fits.set(p.id,{error:error.message});}});
   updatePatternRows();renderIV();
   try{
     const data=state.patterns.filter(p=>p.included).map(p=>{const fit=state.fits.get(p.id);if(fit.error)throw new Error(`${p.name}: ${fit.error}`);return {id:p.id,name:p.name,gap:p.gap,...fit};}).sort((a,b)=>a.gap-b.gap);
     const exact=E.exactFit(data,cfg.radius,cfg.weighted),approx=E.correctedFit(data,cfg.radius);
     state.results={data,exact,approx,config:cfg};renderResults();renderCTLM();
     const missing=state.patterns.filter(p=>p.included&&!(p.gap>0));
     notice(state.isDemo?'합성 예제 데이터입니다. 실제 측정 결과가 아닙니다. 파일을 불러오면 사용자의 측정값으로 분석됩니다.':missing.length?'간격을 확인하세요.':'간격의 기본값은 기존 실험 기준입니다. 각 패턴의 실제 치수와 단위를 확인하세요.');
   }catch(error){invalidate(error.message);}
 }
 function renderResults(){
   const {exact:a,approx:b,data,config:cfg}=state.results;
   $('rho-value').innerHTML=pretty(a.rho);$('rs-value').textContent=num(a.rs,4);$('lt-value').textContent=num(a.lt,3);
   $('rho-se').textContent=a.rhoSE!==null?`피팅 표준오차 ± ${sci(a.rhoSE)} Ω·cm² (1σ)`:'파라미터 불확도를 구분하기 어렵습니다.';
   $('rs-se').textContent=a.rsSE!==null?`피팅 표준오차 ± ${num(a.rsSE,4)} Ω/□`:'표준오차 계산 불가';
   $('lt-se').textContent=a.ltSE!==null?`피팅 표준오차 ± ${num(a.ltSE,3)} μm`:'표준오차 계산 불가';
   $('exact-r2').textContent=num(a.r2,5);$('pattern-count').textContent=`${data.length} / ${state.patterns.length}`;$('radius-ratio').textContent=num(cfg.radius/a.lt,2);
   $('result-label').textContent=state.isDemo?'합성 예제':a.boundary?'탐색 경계 · 결과 확인':'피팅 완료 · 모델 조건 확인';
   $('result-label').className=`status-label ${state.isDemo?'demo':'active'}`;
   $('compare-body').innerHTML=[['ρc [Ω·cm²]',sci(a.rho),b.valid?sci(b.rho):'계산 불가'],['Rsh [Ω/□]',num(a.rs,4),b.valid?num(b.rs,4):'—'],['LT [μm]',num(a.lt,3),b.valid?num(b.lt,3):'—'],['저항 축 R²',num(a.r2,5),b.valid?num(b.r2,5):'—']].map(r=>`<tr>${r.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('');
   const warnings=[];
   if(a.boundary)warnings.push('최적값이 전달 길이 탐색 경계에 있습니다. 접촉 비저항을 충분히 식별하지 못했을 수 있습니다.');
   if(a.r2<.98)warnings.push('간격별 저항에 모델 잔차가 남습니다. 실제 치수와 패턴별 반복 측정을 확인하세요.');
   if(cfg.radius/a.lt<4)warnings.push('r₀/LT < 4: 베셀 원식은 사용 가능하지만, 원형 보정 근사 조건에는 여유가 없습니다.');
   if(data.some(d=>d.r2<.995))warnings.push('일부 I–V의 직선성이 낮습니다. 그래프와 피팅 구간을 확인하세요.');
   if(data.some(d=>d.polarity<0))warnings.push('음의 I–V 기울기는 전압 극성을 보존하고 저항에만 기울기 크기를 사용했습니다.');
   if(!b.valid)warnings.push(b.reason);
   if(state.patterns.some(p=>p.included&&p.headers[Number(p.voltageKey.split(':')[1])]?.replace(/[\s()\[\]]/g,'').toLowerCase()==='v1'))warnings.push('V1 공급 전압을 선택한 패턴이 있습니다. 전압 프로브 사이의 전압 차인지 확인하세요.');
   if(cfg.weighted)warnings.push('가중치는 I–V 기울기의 표준오차에서 계산했습니다. 치수·패턴 간 변동을 직접 측정한 불확도는 아닙니다.');
   $('quality-notes').innerHTML=warnings.length?warnings.map(v=>`<p>${escape(v)}</p>`).join(''):'<p>모든 패턴을 포함한 피팅입니다. 실제 치수와 잔차를 함께 확인하세요.</p>';
   ['export-btn','json-btn','svg-btn'].forEach(id=>$(id).disabled=false);
 }
 function axisTicks(min,max,count){
   const rough=(max-min)/count,power=10**Math.floor(Math.log10(rough)),base=rough/power,step=(base<1.5?1:base<3?2:base<7?5:10)*power;
   const out=[];for(let v=Math.ceil(min/step)*step;v<=max+step*1e-7;v+=step)out.push(Math.abs(v)<step*1e-8?0:v);return out;
 }
 function plot(target,{points,lines,xlabel,ylabel,title,zeroX=false,zeroY=false}){
   const width=Math.max(290,target.clientWidth),height=target.clientHeight||300,margin={l:62,r:20,t:15,b:47};
   const all=points.concat(...lines.map(l=>l.points));
   let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
   all.forEach(p=>{xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);});
   const dx=xmax-xmin||Math.abs(xmax)*.1||1,dy=ymax-ymin||Math.abs(ymax)*.1||1;
   xmin-=dx*.045;xmax+=dx*.045;ymin-=dy*.12;ymax+=dy*.12;
   if(zeroX&&xmin>0)xmin=0;if(zeroY&&ymin>0)ymin=0;
   const w=width-margin.l-margin.r,h=height-margin.t-margin.b;
   const sx=x=>margin.l+(x-xmin)/(xmax-xmin)*w,sy=y=>margin.t+h-(y-ymin)/(ymax-ymin)*h;
   const fmt=v=>{if(v===0)return '0';if(Math.abs(v)<.001||Math.abs(v)>=1e5)return v.toExponential(1);return Number(v.toPrecision(4)).toString();};
   const id=target.id+'-clip';
   let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><desc>${points.length}개 측정점과 피팅 모델. x축 ${escape(xlabel)}, y축 ${escape(ylabel)}.</desc><defs><clipPath id="${id}"><rect x="${margin.l}" y="${margin.t}" width="${w}" height="${h}"/></clipPath></defs>`;
   axisTicks(ymin,ymax,4).forEach(v=>svg+=`<line class="svg-grid" x1="${margin.l}" y1="${sy(v)}" x2="${width-margin.r}" y2="${sy(v)}"/><text class="svg-axis" x="${margin.l-10}" y="${sy(v)+3}" text-anchor="end">${fmt(v)}</text>`);
   axisTicks(xmin,xmax,width<420?3:6).forEach(v=>svg+=`<text class="svg-axis" x="${sx(v)}" y="${height-margin.b+21}" text-anchor="middle">${fmt(v)}</text>`);
   svg+=`<g clip-path="url(#${id})">`;
   lines.forEach(l=>{const path=l.points.map((p,i)=>`${i?'L':'M'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');svg+=`<path class="${l.kind==='approx'?'svg-approx':'svg-exact'}" d="${path}"/>`;});
   points.forEach(p=>svg+=`<circle class="svg-point" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.8"><title>${escape(p.label??'')} ${fmt(p.x)}, ${fmt(p.y)}</title></circle>`);
   svg+=`</g><text class="svg-title" x="${margin.l+w/2}" y="${height-7}" text-anchor="middle">${escape(xlabel)}</text><text class="svg-title" transform="translate(14 ${margin.t+h/2}) rotate(-90)" text-anchor="middle">${escape(ylabel)}</text></svg>`;
   target.innerHTML=svg;return svg;
 }
 function renderCTLM(){
   if(!state.results)return;const {data,exact,approx,config:cfg}=state.results;
   const lo=Math.min(...data.map(d=>d.gap)),hi=Math.max(...data.map(d=>d.gap)),samples=Array.from({length:121},(_,i)=>lo+(hi-lo)*i/120);
   const lines=[{points:samples.map(g=>({x:g,y:E.model(g,cfg.radius,exact.rs,exact.lt)})),kind:'exact'}];
   if(approx.valid)lines.push({points:samples.map(g=>({x:g,y:(approx.slope*g+approx.intercept)*cfg.radius/g*Math.log1p(g/cfg.radius)})),kind:'approx'});
   state.svg=plot($('ctlm-chart'),{points:data.map(d=>({x:d.gap,y:d.resistance,label:d.name})),lines,xlabel:'전극 사이 간격 s [μm]',ylabel:'측정 저항 R [Ω]',title:'전극 간격에 따른 CTLM 저항과 모델 피팅',zeroX:true});
 }
 function renderIV(){
   const p=state.patterns.find(p=>p.id===state.selected),fit=state.fits.get(state.selected);
   if(!p||!fit||fit.error){$('iv-chart').innerHTML=`<div class="chart-empty">${escape(fit?.error??'패턴을 선택하세요.')}</div>`;return;}
   let lo=Infinity,hi=-Infinity,vlo=fit.points[0],vhi=fit.points[0];
   fit.points.forEach(p=>{lo=Math.min(lo,p.i);hi=Math.max(hi,p.i);if(p.v<vlo.v)vlo=p;if(p.v>vhi.v)vhi=p;});
   const step=Math.max(1,Math.ceil(fit.points.length/1000)),visible=fit.points.filter((_,j)=>j%step===0||j===fit.points.length-1);
   if(!visible.includes(vlo))visible.push(vlo);if(!visible.includes(vhi))visible.push(vhi);
   plot($('iv-chart'),{points:visible.map(p=>({x:p.i*1e3,y:p.v*1e3,label:`원본 ${p.row}행`})),lines:[{points:[lo,hi].map(i=>({x:i*1e3,y:(fit.slope*i+fit.intercept)*1e3})),kind:'exact'}],xlabel:'전류 I [mA]',ylabel:'센스 전압 ΔV [mV]',title:`${p.name} I–V 직선 피팅`});
   $('iv-note').textContent=`a = ${num(fit.slope,6)} Ω · 절편 = ${num(fit.intercept*1e6,2)} μV · R² = ${num(fit.r2,6)} · ${fit.n}점${step>1?` (그래프 ${visible.length}점 표시, 피팅은 전체)` : ''}`;
 }
 function applyPatterns(patterns,file,isDemo,skipped=[]){
   state.patterns=patterns;state.file=file;state.isDemo=isDemo;state.results=null;
   $('file-name').textContent=file;$('file-detail').textContent=`${patterns.length}개 패턴 감지${skipped.length?` · 측정 열이 없는 시트 ${skipped.length}개 제외`:''}`;
   $('file-state').classList.add('loaded');$('mapping-label').textContent=isDemo?'SYNTHETIC DEMO':'CHECK DIMENSIONS';
   renderPatternTable();fitAll();
 }
 async function loadFile(file){
   if(!file)return;const ticket=++state.loading;
   if(!/\.(xlsx|xls|csv)$/i.test(file.name)){notice('.xlsx, .xls 또는 .csv 파일을 선택하세요.',true);return;}
   if(file.size>30*1024*1024){notice('파일 크기는 30 MB 이하여야 합니다.',true);return;}
   state.results=null;invalidate('새 측정 파일을 읽고 있습니다…');$('result-label').textContent='파일 읽는 중';
   try{
     if(!window.XLSX)throw new Error('엑셀 읽기 라이브러리를 불러오지 못했습니다. vendor 폴더가 함께 있는지 확인하세요.');
     const buffer=await file.arrayBuffer();if(ticket!==state.loading)return;
     const book=window.XLSX.read(buffer,{type:'array',cellDates:false}),parsed=E.extractSheets(book,window.XLSX.utils);
     if(ticket!==state.loading)return;
     // Plain Keithley I1/V2/V3 have no unit suffix: use A/V. Recognized suffixes are applied for the whole workbook.
     const p=parsed.patterns[0],ih=p.headers[p.currentColumn]??'',vh=p.voltageKey.startsWith('diff')?p.headers[Number(p.voltageKey.split(':')[1])]:p.headers[Number(p.voltageKey.split(':')[1])];
     const unit=(h,current)=>{const m=String(h).match(/(?:\[|\()\s*(mA|uA|µA|μA|nA|A|mV|uV|µV|μV|V)\s*(?:\]|\))/i);if(!m)return 1;const u=m[1].toLowerCase();return u.startsWith('m')?1e-3:u.startsWith('n')?1e-9:/^[uµμ]/.test(u)?1e-6:1;};
     const cs=unit(ih,true),vs=unit(vh,false);
     const currentUnits=new Set(parsed.patterns.map(v=>unit(v.headers[v.currentColumn],true)));
     const voltageUnits=new Set(parsed.patterns.map(v=>unit(v.headers[Number(v.voltageKey.split(':')[1])],false)));
     if(currentUnits.size>1||voltageUnits.size>1)throw new Error('시트마다 단위가 다릅니다. 모든 측정 시트의 전류·전압 단위를 통일한 파일을 사용하세요.');
     $('current-unit').value=String(cs);$('voltage-unit').value=String(vs);$('max-voltage').value='';
     applyPatterns(parsed.patterns,file.name,false,parsed.skipped);
   }catch(error){if(ticket!==state.loading)return;state.patterns=[];state.fits.clear();$('pattern-body').innerHTML='<tr><td colspan="8" class="empty-cell">파일 형식과 측정 열을 확인하세요.</td></tr>';$('iv-select').disabled=true;$('iv-chart').innerHTML='<div class="chart-empty">측정 파일을 다시 선택하세요.</div>';invalidate(`파일을 읽지 못했습니다: ${error.message}`);}
   finally{$('file-input').value='';}
 }
 function demo(){
   ++state.loading;$('radius').value=80;$('current-unit').value='1';$('voltage-unit').value='1';$('max-voltage').value='';$('weighting').value='equal';
   const gaps=[5,10,15,20,40,60],names=['Append5','Append4','Append3','Append2','Append1','Data'];
   const patterns=gaps.map((gap,j)=>{const r=E.model(gap,80,1.05,25);return {id:`p${j}`,name:names[j],sourceSheet:names[j],group:names[j],headers:['I1','V1','V2','V3','VPROBE'],currentColumns:[{h:'I1',j:0}],voltageOptions:[{key:'diff:2:3',label:'V2 − V3 (센스 전압 차)'},{key:'col:4',label:'VPROBE'},{key:'col:1',label:'V1'}],currentColumn:0,voltageKey:'diff:2:3',gap,included:true,rows:Array.from({length:21},(_,k)=>{const i=(k-10)*.0004,v=r*i+35e-6+Math.sin(k*1.7+j)*1.4e-6;return {row:k+2,cells:[i,i*2.8,v/2,-v/2,-v]};})};});
   applyPatterns(patterns,'합성 예제 · CTLM demo',true);
 }
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function baseName(){return (state.isDemo?'CTLM_demo':String(state.file??'CTLM').replace(/\.(xlsx|xls|csv)$/i,'')).replace(/[<>:"/\\|?*]/g,'_')+'_analysis';}
 function exportPayload(){
   const r=state.results;if(!r)return null;
   return {application:'CTLM Fit Lab',version:'1.0.0',createdAt:new Date().toISOString(),sourceFile:state.file,syntheticDemo:state.isDemo,units:{resistance:'ohm',length:'um',contactResistivity:'ohm cm^2'},configuration:r.config,models:{bessel:r.exact,corrected:r.approx},patterns:state.patterns.map(p=>({name:p.name,sourceSheet:p.sourceSheet,gap_um:p.gap,included:p.included,currentColumn:p.headers[p.currentColumn],voltageSelection:p.voltageOptions.find(v=>v.key===p.voltageKey)?.label,rawPoints:E.pointsFor(p),ivFit:state.fits.get(p.id)})),assumptions:['Negligible metal resistance','Same sheet resistance under contacts and in gap','Sufficiently wide outer electrode','Ohmic response within selected I-V range'],uncertainty:'Local linearized fit standard errors (1 sigma), residual-scaled covariance, excludes geometry and model error'};
 }
 function exportExcel(){
   const r=state.results;if(!r)return;const X=window.XLSX;if(!X){toast('엑셀 라이브러리가 없습니다.');return;}
   const a=r.exact,b=r.approx;
   const summary=[['CTLM Fit Lab · 접촉 비저항 분석'],['Source file',state.file],['Synthetic demo',state.isDemo],['Created at (UTC)',new Date().toISOString()],['계산 결과는 현재 입력의 값 스냅샷입니다. 치수 변경 시 웹 도구에서 다시 피팅하세요.'],[],['항목','베셀 원식','원형 보정 근사','단위'],['Contact resistivity',a.rho,b.valid?b.rho:null,'ohm cm^2'],['Sheet resistance',a.rs,b.valid?b.rs:null,'ohm/sq'],['Transfer length',a.lt,b.valid?b.lt:null,'um'],['R^2 (original R axis)',a.r2,b.valid?b.r2:null,''],['rho standard error (1 sigma)',a.rhoSE,null,'ohm cm^2'],['Rsh standard error (1 sigma)',a.rsSE,null,'ohm/sq'],['LT standard error (1 sigma)',a.ltSE,null,'um'],['Corrected-axis R^2',null,b.valid?b.correctedR2:null,''],[],['Inner radius',r.config.radius,'um'],['CTLM weights',r.config.weighted?'1 / IV resistanceSE^2':'equal'],['Input current scale to A',r.config.currentScale],['Input voltage scale to V',r.config.voltageScale],['Maximum |sense V|',r.config.maxAbsV,'V; blank means all points'],['Boundary solution',a.boundary],[],['Assumptions','Negligible metal resistance; same Rsh under contact and gap; sufficiently wide outer electrode'],['Uncertainty','Residual-scaled local fit standard error, not geometry/model uncertainty'],['Bessel source','Marlow & Das (1982), DOI 10.1016/0038-1101(82)90036-3'],['Correction source','CTLM_Cor_Factor.pdf equations (2) and (3)'],['Numerical source','Independent JS engine; not a direct execution of maciejkozubal/cTLM']];
   const patterns=[['Pattern','Source sheet','Included','Gap [um]','Current column','Sense voltage','R [ohm]','R SE [ohm]','IV signed slope [ohm]','IV offset [V]','IV R^2','IV points','Bessel R model [ohm]','Bessel residual [ohm]','Correction c','R/c [ohm]','Corrected R model (original axis) [ohm]']];
   const raw=[['Pattern','Source sheet','Original row','Included CTLM','Included IV','I [A]','Sense V [V]','IV predicted V [V]']];
   state.patterns.forEach(p=>{const fit=state.fits.get(p.id),i=r.data.findIndex(d=>d.id===p.id),valid=fit&&!fit.error;
     patterns.push([p.name,p.sourceSheet,p.included,p.gap,p.headers[p.currentColumn],p.voltageOptions.find(v=>v.key===p.voltageKey)?.label,valid?fit.resistance:null,valid?fit.resistanceSE:null,valid?fit.slope:null,valid?fit.intercept:null,valid?fit.r2:null,valid?fit.n:null,i>=0?a.predictions[i]:null,i>=0?a.residuals[i]:null,i>=0?b.corrections[i]:null,i>=0?b.corrected[i]:null,i>=0&&b.valid?b.predictions[i]:null]);
     const kept=new Set(valid?fit.points.map(v=>v.row):[]);
     E.pointsFor(p).forEach(v=>{const current=v.i*r.config.currentScale,voltage=v.v*r.config.voltageScale;raw.push([p.name,p.sourceSheet,v.row,p.included,kept.has(v.row),current,voltage,valid?fit.slope*current+fit.intercept:null]);});
   });
   const wb=X.utils.book_new();[['Summary',summary],['Pattern results',patterns],['IV data',raw]].forEach(([name,rows])=>{const ws=X.utils.aoa_to_sheet(rows);ws['!cols']=Array.from({length:rows.reduce((m,v)=>Math.max(m,v.length),0)},(_,j)=>({wch:j===0?32:22}));Object.keys(ws).forEach(k=>{if(ws[k]?.t==='n'&&Math.abs(ws[k].v)<.01&&ws[k].v!==0)ws[k].z='0.000000E+00';});X.utils.book_append_sheet(wb,ws,name);});
   download(new Blob([X.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),baseName()+'.xlsx');toast('결과 Excel을 저장했습니다.');
 }
 $('file-input').addEventListener('change',event=>loadFile(event.target.files[0]));
 $('dropzone').addEventListener('dragover',event=>{event.preventDefault();$('dropzone').classList.add('over');});
 $('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('over'));
 $('dropzone').addEventListener('drop',event=>{event.preventDefault();$('dropzone').classList.remove('over');loadFile(event.dataTransfer.files[0]);});
 $('demo-btn').addEventListener('click',demo);$('fit-btn').addEventListener('click',fitAll);
 let timer;function schedule(){clearTimeout(timer);['export-btn','json-btn','svg-btn'].forEach(id=>$(id).disabled=true);$('result-label').textContent='재계산 중';timer=setTimeout(fitAll,180);}
 ['radius','weighting','current-unit','voltage-unit','max-voltage'].forEach(id=>$(id).addEventListener(id==='radius'||id==='max-voltage'?'input':'change',schedule));
 $('pattern-body').addEventListener('input',event=>{
   const control=event.target.dataset.control,tr=event.target.closest('[data-id]');if(!tr||!control)return;
   const p=state.patterns.find(p=>p.id===tr.dataset.id);
   if(control==='gap')p.gap=event.target.value.trim()===''?null:Number(event.target.value);
   if(control==='include')p.included=event.target.checked;
   if(control==='current')p.currentColumn=Number(event.target.value);
   if(control==='voltage')p.voltageKey=event.target.value;
   schedule();
 });
 $('iv-select').addEventListener('change',event=>{state.selected=event.target.value;renderIV();});
 $('export-btn').addEventListener('click',exportExcel);
 $('json-btn').addEventListener('click',()=>{const payload=exportPayload();if(payload)download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),baseName()+'.json');});
 $('svg-btn').addEventListener('click',()=>{if(!state.svg)return;const css='<style>.svg-grid{stroke:#e9edf4;stroke-width:1;stroke-dasharray:3 5}.svg-axis,.svg-title{fill:#748094;font-family:Arial,sans-serif;font-size:10px}.svg-point{fill:#345fdb;stroke:#fff;stroke-width:1.5}.svg-exact{fill:none;stroke:#1e3558;stroke-width:2}.svg-approx{fill:none;stroke:#d58b4a;stroke-width:1.6;stroke-dasharray:5 4}</style>';download(new Blob([state.svg.replace('</title>','</title>'+css)],{type:'image/svg+xml'}),baseName()+'.svg');});
 const observer=new ResizeObserver(()=>{clearTimeout(observer.timer);observer.timer=setTimeout(()=>{renderCTLM();renderIV();},90);});observer.observe($('ctlm-chart'));observer.observe($('iv-chart'));
 // A synthetic example makes the workflow inspectable without distributing a user's measurements.
 demo();
})();
