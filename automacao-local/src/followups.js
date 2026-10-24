// Datas adicionais (feriados locais) podem ser cadastradas em data/agent.json.
export function holidaysFor(year,extra=[]){
 const fixed=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const n=h+l-7*m+114,month=Math.floor(n/31),day=n%31+1;
 const friday=new Date(Date.UTC(year,month-1,day-2)).toISOString().slice(0,10);
 return [...new Set([...fixed.map(x=>`${year}-${x}`),friday,...extra])].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));
}
export class FollowupWorker{
 constructor({rpc,flush,holidays=[]}){Object.assign(this,{rpc,flush,holidays});this.busy=false;}
 async tick(now=new Date()){
  if(this.busy)return 0;this.busy=true;
  try{await this.flush();return await this.rpc('wa_followups_prepare',{p_holidays:[...holidaysFor(now.getUTCFullYear()-1,this.holidays),...holidaysFor(now.getUTCFullYear(),this.holidays)]});}
  finally{this.busy=false;}
 }
}
