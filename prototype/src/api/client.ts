import type {AnswerPublic,ApiFailure,BrewingPublic,InquiryReceipt,Match,Page,PublicConfig,Success,TeaItemPublic} from './types';

export type InquiryInput={kind:'consultation'|'sample';tea_id?:string;tea_item_id?:string;need:string;contact:{channel:'phone'|'email';value:string};consent:{accepted:true;notice_version:string;purpose:'inquiry_followup'}};
export type TeaApi={config:()=>Promise<PublicConfig>;listItems:()=>Promise<Page<TeaItemPublic>>;brewing:(teaId:string,itemId:string)=>Promise<Match<BrewingPublic>>;question:(question:string)=>Promise<AnswerPublic>;inquiry:(body:InquiryInput)=>Promise<InquiryReceipt>};

export function createTeaApi(baseUrl:string):TeaApi{
  const base=baseUrl.replace(/\/$/,'');
  const request=async<T>(path:string,init:RequestInit={}):Promise<T>=>{
    const response=await fetch(base+path,{credentials:'include',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
    const body=await response.json() as Success<T>|ApiFailure;
    if(!response.ok){const failure=body as ApiFailure;throw new Error(`${failure.error.code}: ${failure.error.message}`)}
    return (body as Success<T>).data;
  };
  const write=<T>(path:string,body:unknown)=>request<T>(path,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
  return{
    config:()=>request<PublicConfig>('/config'),listItems:()=>request<Page<TeaItemPublic>>('/tea-items?page_size=100'),
    brewing:(teaId,itemId)=>request<Match<BrewingPublic>>(`/teas/${teaId}/brewing?tea_item_id=${itemId}`),
    question:(question)=>write<AnswerPublic>('/questions',{question}),inquiry:(body)=>write<InquiryReceipt>('/inquiries',body),
  };
}
